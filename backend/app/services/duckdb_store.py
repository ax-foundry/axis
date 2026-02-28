import asyncio
import contextlib
import json
import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import anyio
import duckdb
import pandas as pd

logger = logging.getLogger(__name__)

# Tables visible to API consumers (staging/internal tables excluded)
ALLOWED_TABLES = frozenset(
    {"monitoring_data", "human_signals_raw", "human_signals_cases", "eval_data", "kpi_data"}
)

# Dataset name → DuckDB table name mapping
DATASET_TABLE_MAP = {
    "monitoring": "monitoring_data",
    "human_signals": "human_signals_cases",
    "human_signals_raw": "human_signals_raw",
    "eval": "eval_data",
    "kpi": "kpi_data",
}

# Low-cardinality columns whose distinct values are cached during sync
FILTER_FIELDS = [
    "environment",
    "source_name",
    "source_component",
    "source_type",
    "metric_name",
    "metric_category",
    "kpi_name",
    "kpi_category",
]


@dataclass
class SyncStatus:
    """Per-table sync status."""

    state: str = "not_synced"  # not_synced | syncing | ready | error
    rows: int = 0
    last_sync: datetime | None = None
    error: str | None = None
    truncated: bool = False
    sync_type: str = "full"  # "full" | "incremental"
    last_incremental: datetime | None = None
    incremental_rows: int = 0


class DuckDBStore:
    """DuckDB connection manager with staging+swap, metadata persistence."""

    def __init__(self, db_path: str, query_concurrency: int = 8) -> None:
        """Initialize DuckDB store with database path and query concurrency limit."""
        self.db_path = db_path
        self._write_lock = asyncio.Lock()
        self._sync_status: dict[str, SyncStatus] = {}
        self._cached_metadata: dict[str, dict[str, Any]] = {}
        self._cache_lock = threading.Lock()
        self._query_limiter = anyio.CapacityLimiter(query_concurrency)
        # Protects conn.register/unregister which are connection-level ops
        self._register_lock = threading.Lock()

        # Ensure parent directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        # Single persistent connection — all access goes through cursors
        self._conn = duckdb.connect(db_path)

    @contextmanager
    def _cursor(self) -> Generator[duckdb.DuckDBPyConnection, None, None]:
        """Create a thread-safe cursor from the persistent connection."""
        cur = self._conn.cursor()
        try:
            yield cur
        finally:
            cur.close()

    @property
    def query_limiter(self) -> anyio.CapacityLimiter:
        """Shared capacity limiter for concurrent DuckDB reads."""
        return self._query_limiter

    # ------------------------------------------------------------------
    # Read-only queries (cursor per call for thread safety)
    # ------------------------------------------------------------------

    def query_df(self, sql: str, params: list[Any] | None = None) -> pd.DataFrame:
        """Read-only query returning a DataFrame. Runs in a thread."""
        with self._cursor() as cur:
            return cur.execute(sql, params or []).fetchdf()

    def query_list(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        """Read-only query returning list of dicts."""
        df = self.query_df(sql, params)
        records: list[dict[str, Any]] = df.to_dict(orient="records")  # type: ignore[assignment]
        return records

    def query_value(self, sql: str, params: list[Any] | None = None) -> Any:
        """Read-only query returning a single scalar."""
        with self._cursor() as cur:
            result = cur.execute(sql, params or []).fetchone()
            return result[0] if result else None

    # ------------------------------------------------------------------
    # Staging / swap primitives (sync, run via anyio.to_thread)
    # ------------------------------------------------------------------

    def _init_staging(self, table_name: str) -> None:
        """Drop existing staging table."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {staging}")

    def _write_chunk(self, table_name: str, df: pd.DataFrame, is_first: bool) -> None:
        """Write one DataFrame chunk to staging table."""
        # Coerce mixed-type object columns to string so DuckDB gets consistent types
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].where(df[col].isna(), df[col].astype(str))
        staging = f"{table_name}_staging"
        with self._register_lock:
            self._conn.register("_chunk", df)
            try:
                if is_first:
                    self._conn.execute(f"CREATE TABLE {staging} AS SELECT * FROM _chunk")
                else:
                    self._conn.execute(f"INSERT INTO {staging} SELECT * FROM _chunk")
            finally:
                self._conn.unregister("_chunk")

    def _swap_staging(self, table_name: str) -> None:
        """Atomic swap: drop live table, rename staging."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            cur.execute("BEGIN TRANSACTION")
            cur.execute(f"DROP TABLE IF EXISTS {table_name}")
            cur.execute(f"ALTER TABLE {staging} RENAME TO {table_name}")
            cur.execute("COMMIT")

    def _write_csv_to_staging(self, table_name: str, csv_path: str) -> None:
        """Create staging table from a CSV file using DuckDB's read_csv_auto."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            cur.execute(f"CREATE TABLE {staging} AS SELECT * FROM read_csv_auto('{csv_path}')")

    def _write_csv_chunk_to_staging(self, table_name: str, csv_path: str, is_first: bool) -> None:
        """Write one CSV file to staging (create on first, append on subsequent)."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            if is_first:
                cur.execute(f"CREATE TABLE {staging} AS SELECT * FROM read_csv_auto('{csv_path}')")
            else:
                cur.execute(f"INSERT INTO {staging} SELECT * FROM read_csv_auto('{csv_path}')")

    def _rename_staging_columns(self, table_name: str, rename_map: dict[str, str]) -> None:
        """Rename columns on the staging table via ALTER TABLE RENAME COLUMN."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            for old_name, new_name in rename_map.items():
                if old_name != new_name:
                    cur.execute(f'ALTER TABLE {staging} RENAME COLUMN "{old_name}" TO "{new_name}"')

    def _cleanup_staging(self, table_name: str) -> None:
        """Drop staging table on error."""
        staging = f"{table_name}_staging"
        try:
            with self._cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {staging}")
        except Exception:
            logger.warning(f"Failed to cleanup staging table {staging}")

    def _write_derived_table(self, table_name: str, df: pd.DataFrame) -> None:
        """Atomically write a derived table (not staging pattern)."""
        with self._register_lock:
            self._conn.register("_derived", df)
            try:
                self._conn.execute(
                    f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM _derived"
                )
            finally:
                self._conn.unregister("_derived")

    # ------------------------------------------------------------------
    # Append primitives (incremental sync)
    # ------------------------------------------------------------------

    def _append_chunk(self, table_name: str, df: pd.DataFrame) -> int:
        """Append a DataFrame to an existing table via INSERT INTO. Returns rows appended."""
        if df.empty:
            return 0
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].where(df[col].isna(), df[col].astype(str))
        with self._register_lock:
            self._conn.register("_append", df)
            try:
                self._conn.execute(f"INSERT INTO {table_name} SELECT * FROM _append")
            finally:
                self._conn.unregister("_append")
        return len(df)

    def _append_csv(self, table_name: str, csv_path: str) -> int:
        """Append rows from a CSV file to an existing table. Returns rows appended."""
        with self._cursor() as cur:
            cur.execute(f"INSERT INTO {table_name} SELECT * FROM read_csv_auto('{csv_path}')")
            count_row = cur.execute("SELECT changes()").fetchone()
            return count_row[0] if count_row else 0

    # ------------------------------------------------------------------
    # Watermark helpers (reuse _store_metadata KV table)
    # ------------------------------------------------------------------

    def get_watermark(self, table_name: str) -> str | None:
        """Read the incremental sync watermark for a table."""
        return self.get_kv(f"_watermark_{table_name}")

    def set_watermark(self, table_name: str, value: str) -> None:
        """Persist the max watermark value for a table."""
        self.set_kv(f"_watermark_{table_name}", value)

    def clear_watermark(self, table_name: str) -> None:
        """Clear watermark for a table — forces full rebuild on next sync."""
        try:
            with self._cursor() as cur:
                self._ensure_metadata_table(cur)
                cur.execute(
                    "DELETE FROM _store_metadata WHERE table_name = ?",
                    [f"_watermark_{table_name}"],
                )
        except duckdb.CatalogException:
            pass

    # ------------------------------------------------------------------
    # Metadata persistence (_store_metadata table)
    # ------------------------------------------------------------------

    def _ensure_metadata_table(self, cur: duckdb.DuckDBPyConnection | None = None) -> None:
        """Create _store_metadata table if it doesn't exist."""
        sql = """
            CREATE TABLE IF NOT EXISTS _store_metadata (
                table_name TEXT PRIMARY KEY,
                metadata_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT current_timestamp
            )
        """
        if cur:
            cur.execute(sql)
        else:
            with self._cursor() as c:
                c.execute(sql)

    def _compute_and_persist_metadata(self, table_name: str) -> dict[str, Any]:
        """Compute metadata, persist to DuckDB, update hot cache."""
        with self._cursor() as cur:
            row_count_row = cur.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            row_count = row_count_row[0] if row_count_row else 0
            columns = cur.execute(f"DESCRIBE {table_name}").fetchdf()
            col_info = columns[["column_name", "column_type"]].to_dict(orient="records")

            filter_values: dict[str, list[str]] = {}
            existing_cols = set(columns["column_name"])
            for fld in FILTER_FIELDS:
                if fld in existing_cols:
                    vals = cur.execute(
                        f"SELECT DISTINCT {fld} FROM {table_name} "
                        f"WHERE {fld} IS NOT NULL ORDER BY {fld} LIMIT 200"
                    ).fetchdf()
                    filter_values[fld] = vals[fld].tolist()

            time_range = None
            if "timestamp" in existing_cols:
                tr = cur.execute(
                    f"SELECT MIN(timestamp), MAX(timestamp) FROM {table_name}"
                ).fetchone()
                if tr and tr[0] is not None:
                    time_range = {"min": str(tr[0]), "max": str(tr[1])}

            # Pre-aggregate summary stats for monitoring_data (serves /summary fast path)
            summary_stats: dict[str, float] | None = None
            if "metric_score" in existing_cols:
                latency_col = None
                for alias in [
                    "latency",
                    "latency_ms",
                    "response_time",
                    "duration",
                    "duration_ms",
                ]:
                    if alias in existing_cols:
                        latency_col = alias
                        break

                lat_select = ""
                if latency_col:
                    lat_select = (
                        f", quantile_cont(CAST({latency_col} AS DOUBLE), 0.5) AS p50_lat"
                        f", quantile_cont(CAST({latency_col} AS DOUBLE), 0.95) AS p95_lat"
                        f", quantile_cont(CAST({latency_col} AS DOUBLE), 0.99) AS p99_lat"
                    )

                stats_sql = (
                    f"SELECT COUNT(*) AS total,"
                    f" AVG(CAST(metric_score AS DOUBLE)) AS avg_score,"
                    f" COUNT(*) FILTER (WHERE CAST(metric_score AS DOUBLE) >= 0.5)"
                    f" * 100.0 / NULLIF(COUNT(*), 0) AS pass_rate"
                    f"{lat_select}"
                    f" FROM {table_name} WHERE metric_score IS NOT NULL"
                )
                stats_row = cur.execute(stats_sql).fetchone()
                if stats_row:
                    desc = cur.description or []
                    col_names = [d[0] for d in desc]
                    stats_dict = dict(zip(col_names, stats_row, strict=False))
                    summary_stats = {
                        "total_records": int(stats_dict.get("total", 0)),
                        "avg_score": self.clean_value(stats_dict.get("avg_score")) or 0.0,
                        "pass_rate": self.clean_value(stats_dict.get("pass_rate")) or 0.0,
                        "p50_latency": self.clean_value(stats_dict.get("p50_lat")) or 0.0,
                        "p95_latency": self.clean_value(stats_dict.get("p95_lat")) or 0.0,
                        "p99_latency": self.clean_value(stats_dict.get("p99_lat")) or 0.0,
                    }

            metadata: dict[str, Any] = {
                "row_count": row_count,
                "columns": col_info,
                "filter_values": filter_values,
                "time_range": time_range,
            }
            if summary_stats is not None:
                metadata["summary_stats"] = summary_stats

            self._ensure_metadata_table(cur)
            cur.execute(
                "INSERT OR REPLACE INTO _store_metadata VALUES (?, ?, current_timestamp)",
                [table_name, json.dumps(metadata)],
            )

        with self._cache_lock:
            self._cached_metadata[table_name] = metadata
        return metadata

    def load_metadata_from_db(self) -> None:
        """Populate hot cache from DuckDB _store_metadata table. Called on startup."""
        if not Path(self.db_path).exists():
            logger.info("DuckDB file does not exist yet, skipping metadata load")
            return
        try:
            with self._cursor() as cur:
                rows = cur.execute(
                    "SELECT table_name, metadata_json FROM _store_metadata"
                ).fetchall()
                with self._cache_lock:
                    for table_name, metadata_json in rows:
                        self._cached_metadata[table_name] = json.loads(metadata_json)
                logger.info(f"Loaded metadata cache for {len(rows)} table(s) from DuckDB")
        except duckdb.CatalogException:
            pass  # Table doesn't exist yet — first run

    def get_metadata(self, table_name: str) -> dict[str, Any]:
        """Return cached metadata. Hot cache first, fallback to DuckDB."""
        cached = self._cached_metadata.get(table_name)
        if cached is not None:
            return cached
        try:
            with self._cursor() as cur:
                row = cur.execute(
                    "SELECT metadata_json FROM _store_metadata WHERE table_name = ?",
                    [table_name],
                ).fetchone()
                if row:
                    metadata: dict[str, Any] = json.loads(row[0])
                    with self._cache_lock:
                        self._cached_metadata[table_name] = metadata
                    return metadata
        except duckdb.CatalogException:
            pass
        return {}

    # ------------------------------------------------------------------
    # KV storage (reuses _store_metadata table)
    # ------------------------------------------------------------------

    def get_kv(self, key: str) -> str | None:
        """Read a key-value from _store_metadata."""
        if not Path(self.db_path).exists():
            return None
        try:
            with self._cursor() as cur:
                row = cur.execute(
                    "SELECT metadata_json FROM _store_metadata WHERE table_name = ?",
                    [key],
                ).fetchone()
                return json.loads(row[0]) if row else None
        except (duckdb.CatalogException, json.JSONDecodeError):
            return None

    def set_kv(self, key: str, value: str) -> None:
        """Write a key-value to _store_metadata."""
        with self._cursor() as cur:
            self._ensure_metadata_table(cur)
            cur.execute(
                "INSERT OR REPLACE INTO _store_metadata VALUES (?, ?, current_timestamp)",
                [key, json.dumps(value)],
            )

    # ------------------------------------------------------------------
    # View / internal table helpers
    # ------------------------------------------------------------------

    def _create_view(self, view_name: str, select_sql: str) -> None:
        """Create or replace a DuckDB view."""
        with self._cursor() as cur:
            cur.execute(f"CREATE OR REPLACE VIEW {view_name} AS {select_sql}")

    def _drop_table_or_view(self, name: str) -> None:
        """Drop a table or view if it exists (regardless of current type)."""
        with self._cursor() as cur:
            with contextlib.suppress(duckdb.CatalogException):
                cur.execute(f"DROP TABLE IF EXISTS {name}")
            with contextlib.suppress(duckdb.CatalogException):
                cur.execute(f"DROP VIEW IF EXISTS {name}")

    def _has_internal_table(self, table_name: str) -> bool:
        """Check if an internal (non-API-exposed) table/view exists."""
        if not Path(self.db_path).exists():
            return False
        try:
            with self._cursor() as cur:
                cur.execute(f"SELECT 1 FROM {table_name} LIMIT 0")
                return True
        except duckdb.CatalogException:
            return False

    # ------------------------------------------------------------------
    # Table introspection
    # ------------------------------------------------------------------

    def has_table(self, table_name: str) -> bool:
        """Check if a non-staging table exists."""
        if table_name not in ALLOWED_TABLES:
            return False
        if not Path(self.db_path).exists():
            return False
        try:
            with self._cursor() as cur:
                cur.execute(f"SELECT 1 FROM {table_name} LIMIT 0")
                return True
        except duckdb.CatalogException:
            return False

    def get_table_columns(self, table_name: str) -> set[str]:
        """Return column names for a table (cached from metadata if available)."""
        meta = self.get_metadata(table_name)
        if meta and "columns" in meta:
            return {c["column_name"] for c in meta["columns"]}
        try:
            with self._cursor() as cur:
                cols = cur.execute(f"DESCRIBE {table_name}").fetchdf()
                return set(cols["column_name"])
        except duckdb.CatalogException:
            return set()

    # ------------------------------------------------------------------
    # Sync status
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Shared query helpers
    # ------------------------------------------------------------------

    @staticmethod
    def clean_value(v: Any) -> float | None:
        """Clean NaN/Inf for JSON serialization."""
        if v is None:
            return None
        try:
            fval = float(v)
            if fval != fval or fval == float("inf") or fval == float("-inf"):
                return None
            return fval
        except (TypeError, ValueError):
            return None

    def ensure_ready(self, table_name: str, label: str = "Data") -> None:
        """Raise 503/404 if a table is not ready for queries."""
        from fastapi import HTTPException

        if not self.has_table(table_name):
            status = self.get_sync_status(table_name)
            if status.state == "syncing":
                raise HTTPException(503, f"{label} is syncing. Try again shortly.")
            raise HTTPException(404, f"{label} not available. Trigger a sync first.")

    # ------------------------------------------------------------------
    # Sync status
    # ------------------------------------------------------------------

    def get_sync_status(self, table_name: str) -> SyncStatus:
        """Return sync status for a table."""
        return self._sync_status.get(table_name, SyncStatus())

    def get_all_sync_status(self) -> dict[str, dict[str, Any]]:
        """Return sync status for all known tables (excluding staging/internal)."""
        result: dict[str, dict[str, Any]] = {}
        for table in ALLOWED_TABLES:
            status = self._sync_status.get(table, SyncStatus())
            result[table] = {
                "state": status.state,
                "rows": status.rows,
                "last_sync": status.last_sync.isoformat() if status.last_sync else None,
                "error": status.error,
                "truncated": status.truncated,
                "sync_type": status.sync_type,
                "last_incremental": (
                    status.last_incremental.isoformat() if status.last_incremental else None
                ),
                "incremental_rows": status.incremental_rows,
            }
        return result


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_store: DuckDBStore | None = None


def get_store() -> DuckDBStore:
    """Return the global DuckDBStore singleton. Creates it on first call."""
    global _store
    if _store is None:
        from app.config.db.duckdb import duckdb_config

        _store = DuckDBStore(
            db_path=duckdb_config.path,
            query_concurrency=duckdb_config.query_concurrency,
        )
    return _store
