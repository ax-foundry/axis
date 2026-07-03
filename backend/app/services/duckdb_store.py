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
    {"monitoring_data", "human_signals_data", "human_signals_cases", "eval_data", "kpi_data"}
)

# Dataset name → DuckDB table name mapping
DATASET_TABLE_MAP = {
    "monitoring": "monitoring_data",
    "human_signals": "human_signals_cases",
    "human_signals_data": "human_signals_data",
    "eval": "eval_data",
    "kpi": "kpi_data",
}


def get_live_dataset_tables() -> list[tuple[str, str]]:
    """``(label, table)`` for each configured live dataset.

    This is the cross-surface set: the copilot injects every one of these
    tables' schemas (the selected one in full, the rest compact) so it can
    answer a question against the right table without the user switching
    datasets. Driven by ``duckdb.live_datasets`` (YAML-overridable); unknown
    labels are skipped so a config typo can't break schema building.
    """
    from app.config.db.duckdb import duckdb_config

    return [
        (label, DATASET_TABLE_MAP[label])
        for label in duckdb_config.live_datasets
        if label in DATASET_TABLE_MAP
    ]


# Low-cardinality columns always included regardless of cardinality check
FILTER_FIELDS = [
    "environment",
    "evaluation_name",
    "metric_name",
    "metric_category",
    "metric_type",
    "source_name",
    "source_component",
    "source_type",
    "kpi_name",
    "kpi_category",
]

# Column name substrings that indicate free-text / ID columns — skip auto-discovery
_FILTER_SKIP_PATTERNS = frozenset(
    {"_id", "query", "output", "conversation", "text", "content", "explanation", "trace"}
)


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
        # Tables with a sync coroutine actually running right now. Concurrency
        # guard only — distinct from _sync_status, whose "syncing" state is also
        # seeded at startup (before the sync task starts) for status consumers.
        self._sync_inflight: set[str] = set()
        self._cached_metadata: dict[str, dict[str, Any]] = {}
        self._cache_lock = threading.Lock()
        self._query_limiter = anyio.CapacityLimiter(query_concurrency)
        # Protects conn.register/unregister which are connection-level ops
        self._register_lock = threading.Lock()

        # Ensure parent directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        # Single persistent connection — all access goes through cursors
        self._conn = duckdb.connect(db_path)

        # Create _store_metadata up front, while nothing else is running.
        # Concurrent dataset syncs each CREATE IF NOT EXISTS it from their own
        # cursor transactions, and on a fresh database DuckDB raises a catalog
        # write-write conflict when two of those creates race.
        self._ensure_metadata_table()

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

    def query_list_interruptible(
        self, sql: str, params: list[Any] | None, timeout_seconds: float
    ) -> list[dict[str, Any]]:
        """Read-only query with a hard timeout via DuckDB cursor.interrupt().

        On timeout, the running query is cancelled (no leaked limiter slot) and
        ``TimeoutError`` is raised. Run this from a worker thread.
        """
        with self._cursor() as cur:
            timed_out = threading.Event()

            def _on_timeout() -> None:
                timed_out.set()
                with contextlib.suppress(Exception):
                    cur.interrupt()

            timer = threading.Timer(timeout_seconds, _on_timeout)
            timer.start()
            try:
                df = cur.execute(sql, params or []).fetchdf()
            except Exception as exc:
                if timed_out.is_set():
                    raise TimeoutError(f"Query exceeded {timeout_seconds}s timeout") from exc
                raise
            finally:
                timer.cancel()
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

    # read_csv_auto options used everywhere we ingest a CSV. sample_size=-1
    # scans the whole file for type detection (instead of inferring from a row
    # sample), so a sparse early slice can no longer mis-type a string/timestamp
    # column as NULL; null_padding=true tolerates ragged trailing columns. The
    # full scan is one sequential pass — O(rows in this CSV), not the live table.
    _CSV_READ_OPTS = "sample_size=-1, null_padding=true"

    def _write_csv_to_staging(self, table_name: str, csv_path: str) -> None:
        """Create staging table from a CSV file using DuckDB's read_csv_auto."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            cur.execute(
                f"CREATE TABLE {staging} AS "
                f"SELECT * FROM read_csv_auto('{csv_path}', {self._CSV_READ_OPTS})"
            )

    def _write_csv_chunk_to_staging(self, table_name: str, csv_path: str, is_first: bool) -> None:
        """Write one CSV file to staging (create on first, append on subsequent)."""
        staging = f"{table_name}_staging"
        with self._cursor() as cur:
            if is_first:
                cur.execute(
                    f"CREATE TABLE {staging} AS "
                    f"SELECT * FROM read_csv_auto('{csv_path}', {self._CSV_READ_OPTS})"
                )
            else:
                cur.execute(
                    f"INSERT INTO {staging} "
                    f"SELECT * FROM read_csv_auto('{csv_path}', {self._CSV_READ_OPTS})"
                )

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
    # Schema-aligned insert (incremental sync into an existing table)
    # ------------------------------------------------------------------

    def _get_table_schema(self, table_name: str) -> list[tuple[str, str]]:
        """Return ordered ``(column_name, column_type)`` for a table via DESCRIBE."""
        with self._cursor() as cur:
            described = cur.execute(f"DESCRIBE {table_name}").fetchdf()
        return list(zip(described["column_name"], described["column_type"], strict=False))

    def _aligned_select_sql(self, table_name: str, source_relation: str) -> tuple[str, str]:
        """Build the by-name projection of ``source_relation`` onto the live schema.

        Returns ``(col_list, select_list)`` — the quoted live column list and
        the matching ``CAST("col" AS type) AS "col"`` expressions. Extra source
        columns are ignored. A live column with no same-named source column
        raises instead of NULL-filling: an upstream rename/drop (or a rename
        map that failed to apply) would otherwise silently append NULLs for
        that column on every incremental — the exact "-" columns corruption.
        The raised error fails the sync, which clears the watermarks, so the
        next sync does a full rebuild and self-heals.
        """
        live_schema = self._get_table_schema(table_name)
        source_cols = self.get_table_columns(source_relation)
        missing = [name for name, _ in live_schema if name not in source_cols]
        if missing:
            raise ValueError(
                f"Aligned insert into {table_name} aborted: source {source_relation} "
                f"is missing live column(s) {missing}. Refusing to NULL-fill — "
                f"a full rebuild will pick up the new schema."
            )
        select_exprs = [f'CAST("{name}" AS {dtype}) AS "{name}"' for name, dtype in live_schema]
        col_list = ", ".join(f'"{name}"' for name, _ in live_schema)
        select_list = ", ".join(select_exprs)
        return col_list, select_list

    def _insert_aligned(self, table_name: str, source_relation: str) -> None:
        """Insert rows from ``source_relation`` into ``table_name`` matched BY NAME.

        A positional ``INSERT ... SELECT *`` trusts that a separately-built
        staging relation has the exact same column order *and* the exact same
        inferred types as the live table. When the staging relation comes from a
        per-CSV ``read_csv_auto`` (incremental slices), a column that sampled
        sparse can be inferred as a different/NULL type, and the positional copy
        then silently writes NULLs into the live column. This matches each live
        column to the same-named source column and casts it to the live type
        (see _aligned_select_sql for the missing-column contract); a genuinely
        incompatible value raises a loud cast error instead of corrupting the
        column. Still a single ``INSERT ... SELECT`` over the staging relation —
        O(increment rows), so it scales.
        """
        col_list, select_list = self._aligned_select_sql(table_name, source_relation)
        with self._cursor() as cur:
            cur.execute(
                f"INSERT INTO {table_name} ({col_list}) "
                f"SELECT {select_list} FROM {source_relation}"
            )

    def _upsert_aligned(
        self,
        table_name: str,
        source_relation: str,
        key_columns: list[str],
        order_column: str | None = None,
    ) -> None:
        """Upsert rows from ``source_relation`` into ``table_name`` by natural key.

        Incremental slices re-pull a lag window behind the watermark, so the
        same key arrives more than once (late rows, re-scored rows, overlap).
        A blind append would duplicate them; this replaces instead:

        1. DELETE live rows whose key appears in the source (``IS NOT
           DISTINCT FROM`` so NULL key parts still match), then
        2. INSERT the aligned source rows, deduped within the slice to one row
           per key — latest by ``order_column`` when given (last-write-wins),
           arbitrary otherwise.

        Both statements run on ONE cursor in ONE transaction: a failure (e.g.
        a cast error) rolls back the DELETE, leaving the live table untouched.
        Empty ``key_columns`` falls back to a plain aligned append.
        """
        if not key_columns:
            self._insert_aligned(table_name, source_relation)
            return

        col_list, select_list = self._aligned_select_sql(table_name, source_relation)
        live_cols = {name for name, _ in self._get_table_schema(table_name)}
        bad_keys = [k for k in key_columns if k not in live_cols]
        if bad_keys:
            raise ValueError(
                f"Upsert into {table_name} aborted: key column(s) {bad_keys} "
                f"not present in the live schema."
            )

        key_list = ", ".join(f'"{k}"' for k in key_columns)
        order_clause = ""
        if order_column and order_column in live_cols:
            order_clause = f' ORDER BY "{order_column}" DESC NULLS LAST'

        # Materialize the aligned (casted) slice into a temp table first. A
        # window function directly over the aliased casts trips a DuckDB
        # binder bug (INTERNAL Error binding the column reference) when a cast
        # alias shares its name with a differently-typed source column — and
        # it also surfaces cast errors up front, before the DELETE runs.
        tmp = f"{table_name}_upsert_tmp"
        match_pred = " AND ".join(
            f'{tmp}."{k}" IS NOT DISTINCT FROM {table_name}."{k}"' for k in key_columns
        )
        delete_sql = (
            f"DELETE FROM {table_name} WHERE EXISTS (SELECT 1 FROM {tmp} WHERE {match_pred})"
        )
        insert_sql = (
            f"INSERT INTO {table_name} ({col_list}) "
            f"SELECT {col_list} FROM ("
            f"SELECT *, ROW_NUMBER() OVER (PARTITION BY {key_list}{order_clause}) AS _rn "
            f"FROM {tmp}"
            f") AS _deduped WHERE _rn = 1"
        )

        with self._cursor() as cur:
            cur.execute("BEGIN TRANSACTION")
            try:
                cur.execute(
                    f"CREATE TEMP TABLE {tmp} AS SELECT {select_list} FROM {source_relation}"
                )
                cur.execute(delete_sql)
                cur.execute(insert_sql)
                cur.execute(f"DROP TABLE {tmp}")
                cur.execute("COMMIT")
            except Exception:
                cur.execute("ROLLBACK")
                with contextlib.suppress(duckdb.CatalogException):
                    cur.execute(f"DROP TABLE IF EXISTS {tmp}")
                raise

    # ------------------------------------------------------------------
    # Append primitives (incremental sync)
    # ------------------------------------------------------------------

    def _append_chunk(
        self,
        table_name: str,
        df: pd.DataFrame,
        key_columns: list[str] | None = None,
        order_column: str | None = None,
    ) -> int:
        """Append (or upsert, when ``key_columns`` is set) a DataFrame.

        The target table must already exist. Returns rows written.
        """
        if df.empty:
            return 0
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].where(df[col].isna(), df[col].astype(str))
        # Materialize to a real staging table first: a registered DataFrame is
        # connection-local and isn't visible to the child cursor _insert_aligned
        # opens, whereas a persisted table is. Then align BY NAME into the live
        # table and drop the staging.
        staging = f"{table_name}_append_staging"
        with self._register_lock:
            self._conn.register("_append", df)
            try:
                self._conn.execute(f"CREATE OR REPLACE TABLE {staging} AS SELECT * FROM _append")
            finally:
                self._conn.unregister("_append")
        try:
            self._upsert_aligned(table_name, staging, key_columns or [], order_column)
        finally:
            with self._cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {staging}")
        return len(df)

    def _append_csv(
        self,
        table_name: str,
        csv_path: str,
        key_columns: list[str] | None = None,
        order_column: str | None = None,
    ) -> int:
        """Append (or upsert, when ``key_columns`` is set) rows from a CSV file.

        The target table must already exist. Returns the net row-count change.
        """
        staging = f"{table_name}_append_staging"
        with self._cursor() as cur:
            cur.execute(
                f"CREATE OR REPLACE TABLE {staging} AS "
                f"SELECT * FROM read_csv_auto('{csv_path}', {self._CSV_READ_OPTS})"
            )
        try:
            before = self.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0
            self._upsert_aligned(table_name, staging, key_columns or [], order_column)
            after = self.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0
        finally:
            with self._cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {staging}")
        return int(after) - int(before)

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
    # Snapshots (whole-store copy for GCS-backed cold-start restore)
    # ------------------------------------------------------------------

    def create_snapshot(self, dest_path: str) -> None:
        """Write a consistent copy of the whole store to ``dest_path``.

        ``ATTACH`` + ``COPY FROM DATABASE`` on a cursor of the live connection
        is transactional and copies tables, views, and ``_store_metadata`` —
        so watermarks, last-sync, and rebuild KVs travel with the snapshot,
        which is what lets a restored store resume with an *incremental* sync.
        Callers must hold ``_write_lock`` so a concurrent sync can't swap
        tables mid-copy.
        """
        dest = Path(dest_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest.unlink()
        with self._cursor() as cur:
            row = cur.execute("SELECT current_database()").fetchone()
            assert row is not None
            catalog = row[0]
            escaped_dest = dest_path.replace("'", "''")
            cur.execute(f"ATTACH '{escaped_dest}' AS _snapshot_target")
            try:
                cur.execute(f'COPY FROM DATABASE "{catalog}" TO _snapshot_target')
                # Flush the snapshot's WAL so the file is complete on disk.
                cur.execute("CHECKPOINT _snapshot_target")
            finally:
                cur.execute("DETACH _snapshot_target")

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

            # Phase 1: explicit allowlist — always include regardless of cardinality
            for fld in FILTER_FIELDS:
                if fld in existing_cols:
                    vals = cur.execute(
                        f'SELECT DISTINCT "{fld}" FROM {table_name} '
                        f'WHERE "{fld}" IS NOT NULL ORDER BY "{fld}" LIMIT 200'
                    ).fetchdf()
                    filter_values[fld] = vals[fld].tolist()

            # Phase 2: auto-discover remaining VARCHAR/TEXT columns with low cardinality
            str_cols = [
                c["column_name"]
                for c in col_info
                if ("VARCHAR" in c.get("column_type", "") or "TEXT" in c.get("column_type", ""))
                and c["column_name"] not in filter_values
                and not any(p in c["column_name"].lower() for p in _FILTER_SKIP_PATTERNS)
            ]
            for col in str_cols:
                try:
                    n_distinct = cur.execute(
                        f'SELECT approx_count_distinct("{col}") FROM {table_name}'
                    ).fetchone()
                    if n_distinct and n_distinct[0] <= 50:
                        vals = cur.execute(
                            f'SELECT DISTINCT "{col}" FROM {table_name} '
                            f'WHERE "{col}" IS NOT NULL ORDER BY "{col}" LIMIT 50'
                        ).fetchdf()
                        filter_values[col] = vals[col].tolist()
                except Exception:
                    pass

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

    def get_filter_values_for_source(
        self, table_name: str, source_name: str
    ) -> dict[str, list[str]]:
        """Return filter_values restricted to rows where source_name matches."""
        filter_fields = [f for f in FILTER_FIELDS if f != "source_name"]
        result: dict[str, list[str]] = {}
        try:
            with self._cursor() as cur:
                columns = cur.execute(f"DESCRIBE {table_name}").fetchdf()
                existing_cols = set(columns["column_name"])
                for fld in filter_fields:
                    if fld not in existing_cols:
                        continue
                    vals = cur.execute(
                        f'SELECT DISTINCT "{fld}" FROM {table_name} '
                        f'WHERE source_name = ? AND "{fld}" IS NOT NULL ORDER BY "{fld}" LIMIT 200',
                        [source_name],
                    ).fetchdf()
                    result[fld] = vals[fld].tolist()
        except Exception:
            logger.warning(
                "get_filter_values_for_source failed for table=%s source=%s",
                table_name,
                source_name,
                exc_info=True,
            )
        return result

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

    # ------------------------------------------------------------------
    # Saved datasets (axis_datasets registry)
    # ------------------------------------------------------------------

    def init_datasets_registry(self) -> None:
        """Create the axis_datasets registry table if it doesn't exist, and migrate."""
        with self._cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS axis_datasets (
                    dataset_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    table_name TEXT NOT NULL,
                    row_count INTEGER NOT NULL,
                    columns_json TEXT NOT NULL,
                    source_sql TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT current_timestamp,
                    tags_json TEXT DEFAULT '[]',
                    user_id TEXT DEFAULT ''
                )
            """)
            # Migrate existing installs that lack the user_id column
            existing_cols = {
                row[0]
                for row in cur.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'axis_datasets'"
                ).fetchall()
            }
            if "user_id" not in existing_cols:
                cur.execute("ALTER TABLE axis_datasets ADD COLUMN user_id TEXT DEFAULT ''")

    @staticmethod
    def _sanitize_user_prefix(user_id: str | None) -> str:
        """Return a safe DuckDB identifier prefix from a user ID (max 12 chars)."""
        import re

        if not user_id:
            return ""
        sanitized = re.sub(r"[^a-z0-9]", "", user_id.lower())[:12]
        return sanitized if sanitized else ""

    def create_dataset_from_sql(
        self,
        name: str,
        sql: str,
        description: str | None = None,
        tags: list[str] | None = None,
        max_rows: int = 10_000,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Materialize SQL query results as a named, persisted dataset table.

        Returns metadata dict with dataset_id, name, table, row_count, columns.
        """
        import uuid

        dataset_id = uuid.uuid4().hex[:8]
        prefix = self._sanitize_user_prefix(user_id)
        table_name = f"ds_{prefix}_{dataset_id}" if prefix else f"ds_{dataset_id}"
        capped_sql = f"SELECT * FROM ({sql}) __q LIMIT {max_rows}"

        try:
            with self._cursor() as cur:
                cur.execute(f"CREATE TABLE {table_name} AS {capped_sql}")
                row_count_row = cur.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                row_count = row_count_row[0] if row_count_row else 0
                cols_df = cur.execute(f"DESCRIBE {table_name}").fetchdf()
                columns = cols_df[["column_name", "column_type"]].to_dict(orient="records")

            self.init_datasets_registry()
            with self._cursor() as cur:
                cur.execute(
                    """INSERT OR REPLACE INTO axis_datasets
                           (dataset_id, name, description, table_name, row_count,
                            columns_json, source_sql, tags_json, user_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    [
                        dataset_id,
                        name,
                        description or "",
                        table_name,
                        row_count,
                        json.dumps(columns),
                        sql,
                        json.dumps(tags or []),
                        user_id or "",
                    ],
                )

            return {
                "dataset_id": dataset_id,
                "name": name,
                "table": table_name,
                "row_count": row_count,
                "columns": columns,
                "description": description or "",
                "tags": tags or [],
                "user_id": user_id or "",
            }
        except Exception:
            with contextlib.suppress(Exception), self._cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {table_name}")
            raise

    def list_datasets(self, user_id: str | None = None) -> list[dict[str, Any]]:
        """Return metadata for saved datasets, newest first. Optionally filter by user_id."""
        try:
            self.init_datasets_registry()
            with self._cursor() as cur:
                if user_id:
                    rows = cur.execute(
                        "SELECT dataset_id, name, description, table_name, row_count,"
                        " columns_json, source_sql, created_at, tags_json, user_id"
                        " FROM axis_datasets WHERE user_id = ? ORDER BY created_at DESC",
                        [user_id],
                    ).fetchall()
                else:
                    rows = cur.execute(
                        "SELECT dataset_id, name, description, table_name, row_count,"
                        " columns_json, source_sql, created_at, tags_json, user_id"
                        " FROM axis_datasets ORDER BY created_at DESC"
                    ).fetchall()
            return [
                {
                    "dataset_id": row[0],
                    "name": row[1],
                    "description": row[2],
                    "table_name": row[3],
                    "row_count": row[4],
                    "columns": json.loads(row[5]),
                    "source_sql": row[6],
                    "created_at": str(row[7]),
                    "tags": json.loads(row[8]),
                    "user_id": row[9] or "",
                }
                for row in rows
            ]
        except duckdb.CatalogException:
            return []

    def get_dataset(self, dataset_id: str) -> dict[str, Any] | None:
        """Return metadata for one dataset by ID, or None if not found."""
        try:
            self.init_datasets_registry()
            with self._cursor() as cur:
                row = cur.execute(
                    "SELECT dataset_id, name, description, table_name, row_count,"
                    " columns_json, source_sql, created_at, tags_json, user_id"
                    " FROM axis_datasets WHERE dataset_id = ?",
                    [dataset_id],
                ).fetchone()
            if not row:
                return None
            return {
                "dataset_id": row[0],
                "name": row[1],
                "description": row[2],
                "table_name": row[3],
                "row_count": row[4],
                "columns": json.loads(row[5]),
                "source_sql": row[6],
                "created_at": str(row[7]),
                "tags": json.loads(row[8]),
                "user_id": row[9] or "",
            }
        except duckdb.CatalogException:
            return None

    def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset table and its registry entry. Returns True if deleted."""
        try:
            self.init_datasets_registry()
            ds = self.get_dataset(dataset_id)
            if not ds:
                return False
            with self._cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {ds['table_name']}")
                cur.execute("DELETE FROM axis_datasets WHERE dataset_id = ?", [dataset_id])
            return True
        except duckdb.CatalogException:
            return False

    def get_dataset_as_csv(self, dataset_id: str) -> str | None:
        """Return the full dataset as a CSV string, or None if not found."""
        ds = self.get_dataset(dataset_id)
        if not ds:
            return None
        try:
            df = self.query_df(f"SELECT * FROM {ds['table_name']}")
            csv: str = df.to_csv(index=False)
            return csv
        except Exception:
            return None

    def sql_to_csv(self, sql: str, max_rows: int = 100_000) -> str:
        """Execute a SELECT and return results as a CSV string without persisting a table.

        Used by the copilot download_data tool to avoid creating throwaway ds_* tables.
        """
        capped_sql = f"SELECT * FROM ({sql}) __q LIMIT {max_rows}"
        df = self.query_df(capped_sql)
        csv: str = df.to_csv(index=False)
        return csv

    def sql_to_csv_file(self, sql: str, csv_path: str, max_rows: int = 100_000) -> int:
        """Execute a SELECT and write results to a CSV file. Returns exported row count."""
        safe_max_rows = max(0, int(max_rows))
        capped_sql = f"SELECT * FROM ({sql}) __q LIMIT {safe_max_rows}"
        escaped_path = csv_path.replace("'", "''")
        count_sql = f"SELECT COUNT(*) FROM ({capped_sql}) __count"
        copy_sql = f"COPY ({capped_sql}) TO '{escaped_path}' (HEADER, DELIMITER ',')"
        with self._cursor() as cur:
            result = cur.execute(count_sql).fetchone()
            row_count = int(result[0]) if result else 0
            cur.execute(copy_sql)
        return row_count

    def get_all_sync_status(self) -> dict[str, dict[str, Any]]:
        """Return sync status for all known tables (excluding staging/internal).

        For tables populated via CSV upload (no DB sync), _sync_status has no
        entry, so fall back to the metadata cache for the row count.
        """
        result: dict[str, dict[str, Any]] = {}
        for table in ALLOWED_TABLES:
            status = self._sync_status.get(table, SyncStatus())
            # CSV-uploaded tables never go through the sync engine, so
            # _sync_status.rows stays 0. Use the metadata cache as fallback.
            rows = status.rows
            if rows == 0 and self.has_table(table):
                rows = self.get_metadata(table).get("row_count", 0)
            result[table] = {
                "state": status.state,
                "rows": rows,
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
