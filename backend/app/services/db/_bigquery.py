"""BigQuery backend for AXIS.

All ``google-cloud-bigquery`` imports are lazy (inside methods) so that
Postgres-only deployments are not affected by a missing optional dependency.

## Verification notes (pre-implementation spike)
- INFORMATION_SCHEMA.TABLE_STORAGE is more reliable for row counts than
  INFORMATION_SCHEMA.TABLES.total_rows (which is stale for partitioned tables).
- INFORMATION_SCHEMA queries require ``location`` set on the QueryJobConfig;
  omitting it causes region-mismatch errors for non-US datasets.
- query_job.result(page_size=N).pages streams lazily — memory stays flat for
  large tables when rows are consumed page-by-page.
- pandas.DataFrame.from_records([dict(row) for row in page]) handles STRUCT
  and ARRAY columns without pyarrow by serialising them as Python dicts/lists.

## Auth
Service-account credentials are built via _gcp_auth.build_bq_client(params).
Leave sa_client_email / sa_private_key blank to use ADC.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.db._base import AsyncConnection, BoundParams, CatalogBackend, DatabaseBackend
from app.services.db._errors import DatabaseBackendError
from app.services.db._query_guard import assert_read_only
from app.services.db._types import DatabaseType, TableId

logger = logging.getLogger(__name__)

_REQUIRED_PARAMS = ("project_id", "dataset")


def _require_bq() -> Any:
    """Lazy-import google.cloud.bigquery, raising DatabaseBackendError on failure."""
    try:
        from google.cloud import bigquery  # type: ignore[import-untyped]

        return bigquery
    except ImportError:
        raise DatabaseBackendError(
            "BigQuery support not installed. " "Install with: pip install 'axis[bigquery]'"
        )


def _bq_params_to_args(items: list[Any]) -> list[Any]:
    """Return list as-is — items are already ScalarQueryParameter objects."""
    return items


# ---------------------------------------------------------------------------
# BigQueryConnection — wraps a single query execution
# ---------------------------------------------------------------------------


class BigQueryConnection(AsyncConnection):
    """Thin async wrapper around a synchronous BigQuery query result.

    Each instance holds a reference to the ``bigquery.Client`` and the
    params dict. Queries are executed in a thread via asyncio.to_thread.
    """

    def __init__(self, client: Any, params: dict[str, Any]) -> None:
        self._client = client
        self._params = params

    def _run_query(
        self,
        query: str,
        bq_params: list[Any] | None,
        max_results: int | None = None,
    ) -> list[dict[str, Any]]:
        """Synchronous helper executed inside asyncio.to_thread."""
        bigquery = _require_bq()
        job_config = bigquery.QueryJobConfig(
            use_query_cache=True,
            query_parameters=bq_params or [],
        )
        project_id = self._params.get("project_id")
        dataset = self._params.get("dataset")
        if project_id and dataset:
            job_config.default_dataset = bigquery.DatasetReference(project_id, dataset)
        location = self._params.get("location") or None
        job = self._client.query(query, job_config=job_config, location=location)
        result = job.result()
        rows = []
        for i, row in enumerate(result):
            if max_results is not None and i >= max_results:
                break
            rows.append(dict(row))
        return rows

    async def fetch_all(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        bq_params: list[Any] | None = None
        if isinstance(params, list):
            bq_params = params
        return await asyncio.to_thread(self._run_query, query, bq_params)

    async def fetch_one(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        rows = await self.fetch_all(query, params)
        return rows[0] if rows else None

    async def execute(
        self,
        query: str,
        params: tuple[Any, ...] | list[Any] | dict[str, Any] | None = None,
    ) -> None:
        await self.fetch_all(query, params)

    async def commit(self) -> None:
        pass  # BigQuery is auto-commit; no transaction support


# ---------------------------------------------------------------------------
# BigQueryBackend
# ---------------------------------------------------------------------------


class BigQueryBackend(DatabaseBackend):
    """BigQuery implementation of DatabaseBackend.

    All google-cloud-bigquery imports are lazy so the Postgres path is not
    affected when the optional extra is not installed.
    """

    @property
    def db_type(self) -> DatabaseType:
        return DatabaseType.BIGQUERY

    def build_connection_params(self, source: Any) -> dict[str, Any]:
        """Build BigQuery params from a config, Pydantic request, or dict."""
        from app.config.env import settings

        if isinstance(source, dict):
            raw = source
        else:
            raw = getattr(source, "connection_params", {}) or {}
            # Also check top-level fields (DatabaseConnectionRequest)
            if not raw:
                _pk = getattr(source, "sa_private_key", None)
                raw = {
                    "project_id": getattr(source, "project_id", None),
                    "dataset": getattr(source, "dataset", None),
                    "location": getattr(source, "location", None),
                    "sa_client_email": getattr(source, "sa_client_email", None),
                    "sa_private_key": (
                        _pk.get_secret_value() if _pk is not None and hasattr(_pk, "get_secret_value") else _pk
                    ),
                }

        # Fall back to GCP env vars when YAML/request leaves them blank
        project_id = raw.get("project_id") or settings.gcp_project_id
        dataset = raw.get("dataset")
        sa_email = raw.get("sa_client_email") or settings.gcp_sa_client_email
        sa_key = raw.get("sa_private_key") or settings.gcp_sa_private_key

        if not project_id:
            raise DatabaseBackendError("BigQuery requires connection_params.project_id")
        if not dataset:
            raise DatabaseBackendError("BigQuery requires connection_params.dataset")

        return {
            "project_id": project_id,
            "dataset": dataset,
            "location": raw.get("location") or "US",
            "sa_client_email": sa_email or "",
            "sa_private_key": sa_key or "",
        }

    def build_url_from_params(self, params: dict[str, Any]) -> str:
        """Return a sentinel URL for logging / handle metadata only."""
        project = params.get("project_id", "unknown")
        dataset = params.get("dataset", "unknown")
        return f"bigquery://{project}/{dataset}"

    def _get_client(self, params: dict[str, Any]) -> Any:
        from app.services.db._gcp_auth import build_bq_client

        return build_bq_client(params)

    @asynccontextmanager
    async def connect(
        self,
        params: dict[str, Any],
        connect_timeout: int = 10,
        statement_timeout_ms: int = 60_000,
    ) -> AsyncIterator[BigQueryConnection]:
        _require_bq()
        client = self._get_client(params)
        yield BigQueryConnection(client, params)

    @asynccontextmanager
    async def pooled_connection(
        self,
        params: dict[str, Any],
        statement_timeout_ms: int = 60_000,
        connect_timeout: int = 10,
        min_size: int = 0,
        max_size: int = 10,
    ) -> AsyncIterator[BigQueryConnection]:
        # BigQuery uses a cached client — no real pool needed.
        async with self.connect(params, connect_timeout, statement_timeout_ms) as conn:
            yield conn

    async def chunked_read(
        self,
        params: dict[str, Any],
        query: str,
        chunk_size: int = 5_000,
        max_rows: int = 0,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 60_000,
    ) -> AsyncIterator[tuple[pd.DataFrame, bool]]:
        _require_bq()
        from google.cloud import bigquery  # type: ignore[import-untyped]

        client = self._get_client(params)
        location = params.get("location") or None
        timeout_s = statement_timeout_ms / 1000 if statement_timeout_ms else None

        def _run() -> Any:
            job_config = bigquery.QueryJobConfig(use_query_cache=True)
            project_id = params.get("project_id")
            dataset = params.get("dataset")
            if project_id and dataset:
                job_config.default_dataset = bigquery.DatasetReference(project_id, dataset)
            return client.query(query, job_config=job_config, location=location).result(
                timeout=timeout_s, page_size=chunk_size
            )

        result = await asyncio.to_thread(_run)

        total_rows = 0
        for page in result.pages:
            page_rows = list(page)
            if not page_rows:
                continue

            # Truncate BEFORE DataFrame conversion to honour max_rows
            if max_rows > 0 and total_rows + len(page_rows) > max_rows:
                keep = max_rows - total_rows
                page_rows = page_rows[:keep]
                df = pd.DataFrame([dict(r) for r in page_rows])
                total_rows += len(df)
                yield df, True
                return

            df = pd.DataFrame([dict(r) for r in page_rows])
            total_rows += len(df)
            yield df, False

    async def close_all_pools(self) -> None:
        pass  # BigQuery client lifecycle is managed by _gcp_auth cache

    async def test_connection(
        self,
        params: dict[str, Any],
        connect_timeout: int = 10,
        statement_timeout_ms: int = 30_000,
    ) -> str | None:
        _require_bq()
        import google.cloud.bigquery  # type: ignore[import-untyped]

        client = self._get_client(params)

        def _check() -> str:
            # Simple SELECT 1 to verify connectivity
            location = params.get("location") or None
            from google.cloud import bigquery  # type: ignore[import-untyped]

            job = client.query(
                "SELECT 1 AS v",
                job_config=bigquery.QueryJobConfig(use_query_cache=False),
                location=location,
            )
            job.result(timeout=connect_timeout)
            version = google.cloud.bigquery.__version__
            return f"BigQuery client {version}, project={client.project}"

        return await asyncio.to_thread(_check)

    async def copy_to_csv(
        self,
        params: dict[str, Any],
        query: str,
        dest_path: str | Path,
        connect_timeout: int = 10,
        statement_timeout_ms: int = 600_000,
    ) -> int:
        raise NotImplementedError  # sync_engine falls back to chunked_read

    async def execute_read_query(
        self,
        params: dict[str, Any],
        query: str,
        *,
        max_rows: int = 100,
        statement_timeout_ms: int = 30_000,
    ) -> list[dict[str, Any]]:
        """Execute a safe read-only SELECT against BigQuery.

        Guards applied:
        1. assert_read_only rejects non-SELECT/WITH queries
        2. QueryJobConfig.maximum_bytes_billed caps scan cost
        3. max_rows enforced by row-iterator truncation (no LIMIT injection)
        """
        assert_read_only(query)
        _require_bq()
        from google.cloud import bigquery  # type: ignore[import-untyped]

        from app.config.env import settings

        client = self._get_client(params)
        location = params.get("location") or None
        timeout_s = statement_timeout_ms / 1000 if statement_timeout_ms else None
        max_bytes = settings.bigquery_max_bytes_billed

        def _run() -> list[dict[str, Any]]:
            job_config = bigquery.QueryJobConfig(
                use_query_cache=True,
                maximum_bytes_billed=max_bytes,
            )
            result = client.query(query, job_config=job_config, location=location).result(
                timeout=timeout_s
            )
            rows = []
            for i, row in enumerate(result):
                if i >= max_rows:
                    break
                rows.append(dict(row.items()))
            return rows

        return await asyncio.to_thread(_run)

    # -- SQL dialect helpers --

    def quote_identifier(self, name: str) -> str:
        return f"`{name}`"

    def quote_table(self, schema: str, table: str) -> str:
        """Schema = dataset for BigQuery. Uses backtick quoting."""
        return f"`{schema}.{table}`"

    def quote_table_id(self, table: TableId) -> str:
        """Build `` `project.dataset.table` ``.

        Falls back to the params' project_id if ``table.project`` is None.
        """
        project = table.project or ""
        if project:
            return f"`{project}.{table.schema}.{table.table}`"
        return f"`{table.schema}.{table.table}`"

    def cast_to_text(self, expr: str) -> str:
        return f"CAST({expr} AS STRING)"

    def limit_clause(self, n: int) -> str:
        # BigQuery supports LIMIT but we use row-iterator truncation in
        # execute_read_query. Return empty so it doesn't double-limit.
        return ""

    # -- Named parameter binding for BigQuery --

    def bind_param(
        self,
        builder: BoundParams,
        value: Any,
        name: str | None = None,
        sql_type: str | None = None,
    ) -> str:
        """Append a ``ScalarQueryParameter`` and return ``@name``."""
        _require_bq()
        from google.cloud.bigquery import ScalarQueryParameter  # type: ignore[import-untyped]

        idx = len(builder._items) + 1
        param_name = name or f"p{idx}"
        bq_type = sql_type or "STRING"
        builder._items.append(ScalarQueryParameter(param_name, bq_type, str(value)))
        return f"@{param_name}"

    def to_params(self, builder: BoundParams) -> list[Any]:
        """Return the list of ``ScalarQueryParameter`` objects."""
        return builder._items


# ---------------------------------------------------------------------------
# BigQueryCatalog
# ---------------------------------------------------------------------------


class BigQueryCatalog(CatalogBackend):
    """BigQuery implementation of CatalogBackend.

    Uses INFORMATION_SCHEMA views scoped to the configured dataset.
    All queries set location on the job to avoid region-mismatch errors.
    """

    async def list_tables(self, conn: AsyncConnection) -> list[dict[str, Any]]:
        bq_conn = _as_bq_conn(conn)
        project = bq_conn._params.get("project_id", "")
        dataset = bq_conn._params.get("dataset", "")

        # TABLE_STORAGE is more reliable than TABLES.row_count for partitioned tables
        query = f"""
            SELECT
                t.table_name,
                COALESCE(ts.total_rows, 0) AS row_estimate
            FROM `{project}.{dataset}.INFORMATION_SCHEMA.TABLES` t
            LEFT JOIN `{project}.{dataset}.INFORMATION_SCHEMA.TABLE_STORAGE` ts
                ON t.table_schema = ts.table_schema
                AND t.table_name = ts.table_name
            WHERE t.table_type = 'BASE TABLE'
            ORDER BY t.table_name
        """
        rows = await conn.fetch_all(query)
        return [
            {
                "schema_name": dataset,
                "table_name": r["table_name"],
                "row_estimate": int(r.get("row_estimate") or 0),
            }
            for r in rows
        ]

    async def table_exists(self, conn: AsyncConnection, schema: str, table: str) -> bool:
        bq_conn = _as_bq_conn(conn)
        project = bq_conn._params.get("project_id", "")
        dataset = schema  # schema_name maps to dataset in BQ
        query = f"""
            SELECT COUNT(*) AS cnt
            FROM `{project}.{dataset}.INFORMATION_SCHEMA.TABLES`
            WHERE table_name = @tname
        """
        row = await conn.fetch_one(query, _scalar_param("tname", table))
        return int((row or {}).get("cnt", 0)) > 0

    async def get_columns(
        self, conn: AsyncConnection, schema: str, table: str
    ) -> list[dict[str, Any]]:
        bq_conn = _as_bq_conn(conn)
        project = bq_conn._params.get("project_id", "")
        dataset = schema
        query = f"""
            SELECT column_name, data_type, is_nullable
            FROM `{project}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
            WHERE table_name = @tname
            ORDER BY ordinal_position
        """
        return await conn.fetch_all(query, _scalar_param("tname", table))

    async def validate_columns(
        self, conn: AsyncConnection, schema: str, table: str, columns: list[str]
    ) -> set[str]:
        if not columns:
            return set()
        column_rows = await self.get_columns(conn, schema, table)
        existing = {row["column_name"] for row in column_rows}
        return set(columns) - existing


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _as_bq_conn(conn: AsyncConnection) -> BigQueryConnection:
    if not isinstance(conn, BigQueryConnection):
        raise TypeError(f"Expected BigQueryConnection, got {type(conn).__name__}")
    return conn


def _scalar_param(name: str, value: str) -> list[Any]:
    """Return a single-element ScalarQueryParameter list."""
    _require_bq()
    from google.cloud.bigquery import ScalarQueryParameter  # type: ignore[import-untyped]

    return [ScalarQueryParameter(name, "STRING", value)]
