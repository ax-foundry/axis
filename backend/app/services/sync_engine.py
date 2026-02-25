import asyncio
import csv
import fcntl
import json
import logging
import shutil
import time
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anyio
import pandas as pd

from app.services.db._base import DatabaseBackend
from app.services.duckdb_store import DuckDBStore, SyncStatus, get_store

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """Result of syncing one dataset."""

    table_name: str
    rows_synced: int
    duration_seconds: float
    status: str  # success | error | skipped
    error: str | None = None
    truncated: bool = False


# ------------------------------------------------------------------
# Column normalization helpers (per-dataset)
# ------------------------------------------------------------------


def _normalize_monitoring(
    df: pd.DataFrame, custom_columns: dict[str, str] | None = None
) -> pd.DataFrame:
    """Normalize monitoring columns. Reuses logic from monitoring router."""
    from app.routers.monitoring import normalize_column_names

    return normalize_column_names(df, custom_columns)


def _normalize_eval(df: pd.DataFrame, custom_columns: dict[str, str] | None = None) -> pd.DataFrame:
    """Normalize eval columns using EVAL_COLUMN_NORMALIZATION."""
    from app.routers.data import EVAL_COLUMN_NORMALIZATION

    rename_map = {}
    custom_columns = custom_columns or {}
    for col in df.columns:
        if col in custom_columns:
            rename_map[col] = custom_columns[col]
        else:
            normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
            if normalized in EVAL_COLUMN_NORMALIZATION:
                rename_map[col] = EVAL_COLUMN_NORMALIZATION[normalized]
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def _normalize_human_signals(
    df: pd.DataFrame, custom_columns: dict[str, str] | None = None
) -> pd.DataFrame:
    """Basic column normalization for human signals data."""
    rename_map = {}
    custom_columns = custom_columns or {}
    for col in df.columns:
        if col in custom_columns:
            rename_map[col] = custom_columns[col]
        else:
            normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
            if normalized != col:
                rename_map[col] = normalized
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def _normalize_kpi(df: pd.DataFrame, custom_columns: dict[str, str] | None = None) -> pd.DataFrame:
    """Normalize KPI columns: lowercase names, type coercion, safety de-dupe."""
    rename_map = {}
    custom_columns = custom_columns or {}
    for col in df.columns:
        if col in custom_columns:
            rename_map[col] = custom_columns[col]
        else:
            normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
            if normalized != col:
                rename_map[col] = normalized
    if rename_map:
        df = df.rename(columns=rename_map)

    # Type coercion
    if "numeric_value" in df.columns:
        df["numeric_value"] = pd.to_numeric(df["numeric_value"], errors="coerce")
    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], utc=True, errors="coerce")

    # Safety de-dupe by id within a single batch
    if "id" in df.columns:
        df = df.drop_duplicates(subset=["id"], keep="first")

    return df


def _get_normalize_fn(table_name: str) -> Callable[..., pd.DataFrame] | None:
    """Return the appropriate normalization function per dataset."""
    fns: dict[str, Callable[..., pd.DataFrame]] = {
        "monitoring_data": _normalize_monitoring,
        "monitoring_dataset": _normalize_monitoring,
        "monitoring_results": _normalize_monitoring,
        "eval_data": _normalize_eval,
        "eval_dataset": _normalize_eval,
        "eval_results": _normalize_eval,
        "human_signals_raw": _normalize_human_signals,
        "human_signals_dataset": _normalize_human_signals,
        "human_signals_results": _normalize_human_signals,
        "kpi_data": _normalize_kpi,
    }
    return fns.get(table_name)


# ------------------------------------------------------------------
# COPY-based export helpers
# ------------------------------------------------------------------

_TEMP_BASE = Path("data/tmp")


def _ensure_sync_dir(sync_uuid: str) -> Path:
    """Create and return a unique temp directory for this sync run."""
    d = _TEMP_BASE / sync_uuid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cleanup_sync_dir(sync_uuid: str) -> None:
    """Remove the temp directory for a sync run."""
    d = _TEMP_BASE / sync_uuid
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


async def _copy_read(
    backend: DatabaseBackend,
    pg_url: str,
    query: str,
    ssl_mode: str | None,
    statement_timeout_ms: int,
    dest_dir: Path,
    file_name: str,
) -> Path | None:
    """Run COPY export writing to dest_dir/file_name. Returns path or None if unsupported."""
    dest_path = dest_dir / file_name
    effective_ssl = ssl_mode if ssl_mode not in ("disable", None) else None
    try:
        await backend.copy_to_csv(
            url=pg_url,
            query=query,
            dest_path=dest_path,
            ssl_mode=effective_ssl,
            statement_timeout_ms=statement_timeout_ms,
        )
        return dest_path
    except (NotImplementedError, AttributeError):
        return None


@dataclass
class _PartitionBound:
    lower: Any
    upper: Any
    is_last: bool


def _compute_partition_ranges(
    min_val: int | float,
    max_val: int | float,
    n_workers: int,
) -> list[_PartitionBound]:
    """Split [min_val, max_val] into n_workers contiguous ranges."""
    if min_val == max_val or n_workers <= 1:
        return [_PartitionBound(lower=min_val, upper=max_val, is_last=True)]

    step = (max_val - min_val) / n_workers
    use_int = isinstance(min_val, int) and isinstance(max_val, int)

    bounds: list[_PartitionBound] = []
    for i in range(n_workers):
        lower = min_val + step * i
        upper = min_val + step * (i + 1)
        if use_int:
            lower = int(lower)
            upper = int(upper) if i < n_workers - 1 else max_val
        is_last = i == n_workers - 1
        if is_last:
            upper = max_val
        bounds.append(_PartitionBound(lower=lower, upper=upper, is_last=is_last))
    return bounds


def _wrap_query_with_range(query: str, partition_column: str, bound: _PartitionBound) -> str:
    """Wrap a query adding a WHERE clause for the partition range."""
    upper_op = "<=" if bound.is_last else "<"
    return (
        f"SELECT * FROM ({query}) AS _p "
        f'WHERE "{partition_column}" >= {_sql_literal(bound.lower)} '
        f'AND "{partition_column}" {upper_op} {_sql_literal(bound.upper)}'
    )


def _sql_literal(val: Any) -> str:
    """Format a Python value as a SQL literal."""
    if isinstance(val, str):
        escaped = val.replace("'", "''")
        return f"'{escaped}'"
    return str(val)


def _wrap_query_incremental(query: str, column: str, watermark: str) -> str:
    """Wrap a query to only return rows newer than the watermark."""
    escaped_wm = watermark.replace("'", "''")
    return f"SELECT * FROM ({query}) AS _inc " f"WHERE _inc.\"{column}\" > '{escaped_wm}'"


async def _get_partition_bounds(
    backend: DatabaseBackend,
    pg_url: str,
    query: str,
    partition_column: str,
    ssl_mode: str | None,
    statement_timeout_ms: int,
) -> tuple[Any, Any] | None:
    """Query MIN/MAX of partition_column. Returns (min, max) or None if empty."""
    effective_ssl = ssl_mode if ssl_mode not in ("disable", None) else None
    bounds_query = (
        f'SELECT MIN("{partition_column}"), MAX("{partition_column}") ' f"FROM ({query}) AS _bounds"
    )
    async with backend.connect(
        pg_url, ssl_mode=effective_ssl, statement_timeout_ms=statement_timeout_ms
    ) as conn:
        row = await conn.fetch_one(bounds_query)
        if not row:
            return None
        values = list(row.values())
        min_val, max_val = values[0], values[1]
        if min_val is None or max_val is None:
            return None
        return (min_val, max_val)


async def _parallel_copy_read(
    backend: DatabaseBackend,
    pg_url: str,
    query: str,
    partition_column: str,
    n_workers: int,
    ssl_mode: str | None,
    statement_timeout_ms: int,
    dest_dir: Path,
    table_name: str,
) -> list[Path]:
    """Run N parallel COPY reads partitioned by partition_column. Returns list of CSV paths."""
    bounds = await _get_partition_bounds(
        backend, pg_url, query, partition_column, ssl_mode, statement_timeout_ms
    )
    if bounds is None:
        # Empty table — do a single unpartitioned COPY
        result = await _copy_read(
            backend,
            pg_url,
            query,
            ssl_mode,
            statement_timeout_ms,
            dest_dir,
            f"{table_name}.csv",
        )
        return [result] if result else []

    min_val, max_val = bounds
    ranges = _compute_partition_ranges(min_val, max_val, n_workers)
    logger.info(
        f"Parallel COPY: {len(ranges)} workers, partition_column={partition_column}, "
        f"range=[{min_val}, {max_val}]"
    )

    coros = []
    for i, bound in enumerate(ranges):
        ranged_query = _wrap_query_with_range(query, partition_column, bound)
        coros.append(
            _copy_read(
                backend,
                pg_url,
                ranged_query,
                ssl_mode,
                statement_timeout_ms,
                dest_dir,
                f"{table_name}_{i}.csv",
            )
        )

    results = await asyncio.gather(*coros)
    # If any worker returned None (NotImplementedError), COPY isn't supported
    if any(r is None for r in results):
        raise NotImplementedError("Backend does not support copy_to_csv")
    return [r for r in results if r is not None]


def _compute_csv_rename_map(
    csv_path: Path,
    table_name: str,
    custom_columns: dict[str, str] | None = None,
) -> dict[str, str]:
    """Read CSV header and compute the column rename map for normalization."""
    with csv_path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
    if not header:
        return {}

    normalize_fn_name = {
        "monitoring_data": "_monitoring",
        "monitoring_dataset": "_monitoring",
        "monitoring_results": "_monitoring",
        "eval_data": "_eval",
        "eval_dataset": "_eval",
        "eval_results": "_eval",
        "human_signals_raw": "_human_signals",
        "human_signals_dataset": "_human_signals",
        "human_signals_results": "_human_signals",
        "kpi_data": "_kpi",
    }.get(table_name)

    if normalize_fn_name is None:
        return {}

    custom_columns = custom_columns or {}
    rename_map: dict[str, str] = {}

    if normalize_fn_name == "_monitoring":
        from app.routers.monitoring import MONITORING_COLUMN_NORMALIZATION

        for col in header:
            if col in custom_columns:
                rename_map[col] = custom_columns[col]
            else:
                normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
                if normalized in MONITORING_COLUMN_NORMALIZATION:
                    rename_map[col] = MONITORING_COLUMN_NORMALIZATION[normalized]

    elif normalize_fn_name == "_eval":
        from app.routers.data import EVAL_COLUMN_NORMALIZATION

        for col in header:
            if col in custom_columns:
                rename_map[col] = custom_columns[col]
            else:
                normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
                if normalized in EVAL_COLUMN_NORMALIZATION:
                    rename_map[col] = EVAL_COLUMN_NORMALIZATION[normalized]

    elif normalize_fn_name == "_human_signals" or normalize_fn_name == "_kpi":
        for col in header:
            if col in custom_columns:
                rename_map[col] = custom_columns[col]
            else:
                normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
                if normalized != col:
                    rename_map[col] = normalized

    return rename_map


# ------------------------------------------------------------------
# Chunked Postgres reads (async — stays on the event loop)
# ------------------------------------------------------------------


async def _chunked_read(
    pg_url: str,
    query: str,
    ssl_mode: str,
    chunk_size: int,
    normalize_fn: Callable[..., pd.DataFrame] | None,
    custom_columns: dict[str, str] | None,
    max_rows: int,
    db_type: str = "postgres",
    statement_timeout_ms: int = 600_000,
) -> AsyncIterator[tuple[pd.DataFrame, bool]]:
    """Chunked cursor reads from the database via the appropriate backend.

    Yields (DataFrame, truncated) tuples. If max_rows is hit, yields a final
    partial chunk with truncated=True and stops.

    statement_timeout_ms defaults to 10 minutes for background sync jobs.
    """
    from app.services.db import get_backend

    backend = get_backend(db_type)

    async for df, truncated in backend.chunked_read(
        url=pg_url,
        query=query,
        ssl_mode=ssl_mode if ssl_mode not in ("disable", None) else None,
        chunk_size=chunk_size,
        max_rows=max_rows,
        statement_timeout_ms=statement_timeout_ms,
    ):
        if normalize_fn:
            df = normalize_fn(df, custom_columns or {})
        yield df, truncated
        if truncated:
            return


# ------------------------------------------------------------------
# Human signals derived table builder
# ------------------------------------------------------------------


async def _build_human_signals_derived_tables(store: DuckDBStore, sync_id: str) -> None:
    """Build human_signals_cases + human_signals_metric_schema from human_signals_raw.

    Runs aggregation logic against DuckDB data and stores results
    as queryable tables + metadata.
    """
    from app.services.human_signals_service import (
        aggregate_cases,
        build_metric_schema,
        detect_signals_format,
        detect_source_fields,
    )

    df = await anyio.to_thread.run_sync(lambda: store.query_df("SELECT * FROM human_signals_raw"))

    if df.empty:
        logger.info("human_signals_raw is empty, skipping derived table build")
        return

    has_signals = detect_signals_format(df)
    if not has_signals:
        logger.warning("human_signals_raw does not have signals format, skipping derived tables")
        return

    if not detect_source_fields(df):
        logger.warning("human_signals_raw missing source fields, skipping derived tables")
        return

    metric_schema = build_metric_schema(df)
    cases = aggregate_cases(df)

    # Clean NaN values for storage
    from app.routers.human_signals import clean_nan_values

    cases = clean_nan_values(cases)

    if cases:
        cases_df = pd.DataFrame(cases)

        def _write_cases() -> None:
            store._write_derived_table("human_signals_cases", cases_df)

        await anyio.to_thread.run_sync(_write_cases)
        logger.info(f"Built human_signals_cases table with {len(cases)} rows")

        # Compute metadata for cases table
        await anyio.to_thread.run_sync(
            lambda: store._compute_and_persist_metadata("human_signals_cases")
        )

    if metric_schema:

        def _persist_schema() -> None:
            store.set_kv("human_signals_metric_schema", json.dumps(metric_schema))

        await anyio.to_thread.run_sync(_persist_schema)

    # Tag both tables with sync_id
    def _tag_sync() -> None:
        store.set_kv("human_signals_raw_sync_id", sync_id)
        store.set_kv("human_signals_cases_sync_id", sync_id)

    await anyio.to_thread.run_sync(_tag_sync)


# ------------------------------------------------------------------
# Split sync helpers (dataset + results → DuckDB view)
# ------------------------------------------------------------------

# Maps each API-visible table → (dataset_internal_table, results_internal_table)
_SPLIT_TABLE_MAP: dict[str, tuple[str, str]] = {
    "eval_data": ("eval_dataset", "eval_results"),
    "monitoring_data": ("monitoring_dataset", "monitoring_results"),
    "human_signals_raw": ("human_signals_dataset", "human_signals_results"),
}


@dataclass
class _SubQueryConfig:
    """Wraps an existing config, overriding the query field."""

    _base: Any
    query: str

    def __getattr__(self, name: str) -> Any:
        return getattr(self._base, name)


async def _sync_internal_table(
    config: Any,
    table_name: str,
    store: DuckDBStore,
    append_mode: bool = False,
) -> SyncResult:
    """Sync a single table: read from source, write to DuckDB.

    When append_mode=False (default): staging + atomic swap (full rebuild).
    When append_mode=True: INSERT INTO existing table (incremental append).

    No sync status management — caller handles that.
    """
    from app.config import duckdb_config
    from app.services.db import get_backend

    start = time.time()
    sync_uuid = str(uuid.uuid4())
    csv_paths: list[Path] = []
    use_copy = False

    try:
        pg_url = _build_url(config)
        normalize_fn = _get_normalize_fn(table_name)
        truncated = False
        db_type = getattr(config, "db_type", "postgres")
        backend = get_backend(db_type)
        partition_column = getattr(config, "partition_column", None)
        sync_workers = duckdb_config.sync_workers
        custom_columns = getattr(config, "columns", None) or {}
        sync_timeout_ms = getattr(config, "query_timeout", 600) * 1000

        # --- Phase 1: Read from source (no DuckDB lock) ---
        chunks: list[pd.DataFrame] = []
        total_rows = 0
        dest_dir = _ensure_sync_dir(sync_uuid)

        # Tier 1: Parallel COPY reads
        if partition_column and sync_workers > 1:
            try:
                csv_paths = await _parallel_copy_read(
                    backend=backend,
                    pg_url=pg_url,
                    query=config.query,
                    partition_column=partition_column,
                    n_workers=sync_workers,
                    ssl_mode=config.ssl_mode,
                    statement_timeout_ms=sync_timeout_ms,
                    dest_dir=dest_dir,
                    table_name=table_name,
                )
                use_copy = bool(csv_paths)
            except NotImplementedError:
                logger.info(
                    f"Backend {db_type} does not support COPY, "
                    f"falling back to chunked read for {table_name}"
                )

        # Tier 2: Single COPY read
        if not use_copy and not csv_paths:
            result = await _copy_read(
                backend=backend,
                pg_url=pg_url,
                query=config.query,
                ssl_mode=config.ssl_mode,
                statement_timeout_ms=sync_timeout_ms,
                dest_dir=dest_dir,
                file_name=f"{table_name}.csv",
            )
            if result is not None:
                csv_paths = [result]
                use_copy = True

        # Tier 3: Sequential chunked read (fallback)
        if not use_copy:
            async for df, was_truncated in _chunked_read(
                pg_url=pg_url,
                query=config.query,
                ssl_mode=config.ssl_mode,
                chunk_size=duckdb_config.sync_chunk_size,
                normalize_fn=normalize_fn,
                custom_columns=custom_columns,
                max_rows=duckdb_config.max_sync_rows,
                db_type=db_type,
                statement_timeout_ms=sync_timeout_ms,
            ):
                chunks.append(df)
                total_rows += len(df)
                if was_truncated:
                    truncated = True
                    break

        if not use_copy and not chunks:
            return SyncResult(table_name, 0, time.time() - start, "success")

        # --- Phase 2: Write to DuckDB (lock held only for writes) ---
        async with store._write_lock:
            if append_mode:
                # Incremental: INSERT INTO existing live table
                if use_copy:
                    # Load CSV into staging, INSERT INTO live, drop staging
                    staging = f"{table_name}_staging"
                    await anyio.to_thread.run_sync(lambda: store._init_staging(table_name))
                    if len(csv_paths) == 1:
                        await anyio.to_thread.run_sync(
                            lambda: store._write_csv_to_staging(table_name, str(csv_paths[0]))
                        )
                    else:
                        for i, csv_path in enumerate(csv_paths):

                            def _do_csv_write(p: Path = csv_path, first: bool = (i == 0)) -> None:
                                store._write_csv_chunk_to_staging(table_name, str(p), first)

                            await anyio.to_thread.run_sync(_do_csv_write)

                    rename_map = _compute_csv_rename_map(csv_paths[0], table_name, custom_columns)
                    if rename_map:
                        await anyio.to_thread.run_sync(
                            lambda: store._rename_staging_columns(table_name, rename_map)
                        )

                    def _insert_from_staging() -> None:
                        with store._cursor() as cur:
                            cur.execute(f"INSERT INTO {table_name} SELECT * FROM {staging}")
                            cur.execute(f"DROP TABLE IF EXISTS {staging}")

                    await anyio.to_thread.run_sync(_insert_from_staging)
                else:
                    full_df = pd.concat(chunks, ignore_index=True)
                    await anyio.to_thread.run_sync(lambda: store._append_chunk(table_name, full_df))
            else:
                # Full rebuild: staging + atomic swap
                if use_copy:
                    await anyio.to_thread.run_sync(lambda: store._init_staging(table_name))

                    if len(csv_paths) == 1:
                        await anyio.to_thread.run_sync(
                            lambda: store._write_csv_to_staging(table_name, str(csv_paths[0]))
                        )
                    else:
                        for i, csv_path in enumerate(csv_paths):

                            def _do_csv_write(p: Path = csv_path, first: bool = (i == 0)) -> None:
                                store._write_csv_chunk_to_staging(table_name, str(p), first)

                            await anyio.to_thread.run_sync(_do_csv_write)

                    rename_map = _compute_csv_rename_map(csv_paths[0], table_name, custom_columns)
                    if rename_map:
                        await anyio.to_thread.run_sync(
                            lambda: store._rename_staging_columns(table_name, rename_map)
                        )

                    await anyio.to_thread.run_sync(lambda: store._swap_staging(table_name))
                else:
                    # Concat all chunks so DuckDB infers consistent column types
                    full_df = pd.concat(chunks, ignore_index=True)
                    await anyio.to_thread.run_sync(lambda: store._init_staging(table_name))
                    await anyio.to_thread.run_sync(
                        lambda: store._write_chunk(table_name, full_df, is_first=True)
                    )
                    await anyio.to_thread.run_sync(lambda: store._swap_staging(table_name))

        rows = 0
        if store._has_internal_table(table_name):
            rows = store.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0

        return SyncResult(table_name, rows, time.time() - start, "success", truncated=truncated)

    except Exception as e:
        logger.exception(f"Internal table sync failed for {table_name}")
        await anyio.to_thread.run_sync(lambda: store._cleanup_staging(table_name))
        return SyncResult(table_name, 0, time.time() - start, "error", str(e))
    finally:
        _cleanup_sync_dir(sync_uuid)


async def _build_join_view(
    store: DuckDBStore,
    view_name: str,
    dataset_table: str,
    results_table: str,
) -> None:
    """Create a DuckDB view joining a dataset and results table on dataset_id."""
    dataset_cols = store.get_table_columns(dataset_table)
    results_cols = store.get_table_columns(results_table)
    overlap = (dataset_cols & results_cols) - {"dataset_id"}

    r_cols = [f'r."{c}"' for c in sorted(results_cols)]
    d_cols = []
    for c in sorted(dataset_cols):
        if c == "dataset_id":
            continue
        if c in overlap:
            d_cols.append(f'd."{c}" AS "dataset_{c}"')
        else:
            d_cols.append(f'd."{c}"')

    select_sql = (
        f"SELECT {', '.join(r_cols + d_cols)} "
        f"FROM {results_table} r "
        f"JOIN {dataset_table} d ON r.dataset_id = d.dataset_id"
    )

    def _create() -> None:
        store._drop_table_or_view(view_name)
        store._create_view(view_name, select_sql)

    await anyio.to_thread.run_sync(_create)


async def _sync_split(
    config: Any,
    table_name: str,
    store: DuckDBStore,
    force_full: bool = False,
) -> SyncResult:
    """Orchestrate the two-table split sync: dataset + results → DuckDB view.

    Supports incremental mode when:
    - force_full is False
    - incremental_column is configured
    - Both sub-tables already exist in DuckDB
    - Watermarks are stored from a previous sync
    Otherwise falls back to full rebuild.
    """
    dataset_table, results_table = _SPLIT_TABLE_MAP[table_name]

    start = time.time()
    current = store.get_sync_status(table_name)
    if current.state == "syncing":
        return SyncResult(table_name, 0, 0, "skipped", "Sync already running")

    store._sync_status[table_name] = SyncStatus(state="syncing")

    incremental_column = getattr(config, "incremental_column", None)

    # Determine if incremental sync is possible — log the reason
    has_tables = store._has_internal_table(dataset_table) and store._has_internal_table(
        results_table
    )
    has_watermarks = (
        store.get_watermark(dataset_table) is not None
        and store.get_watermark(results_table) is not None
    )

    if force_full:
        fallback_reason = "force_full=True requested"
    elif not incremental_column:
        fallback_reason = "no incremental_column configured"
    elif not has_tables:
        fallback_reason = "DuckDB tables don't exist yet (first sync)"
    elif not has_watermarks:
        fallback_reason = "no watermarks stored (first sync or after reset)"
    else:
        fallback_reason = None

    use_incremental = fallback_reason is None
    sync_type = "incremental" if use_incremental else "full"

    if use_incremental:
        logger.info(f"[{table_name}] Starting INCREMENTAL sync (column={incremental_column})")
    else:
        logger.info(f"[{table_name}] Starting FULL sync — reason: {fallback_reason}")

    # Capture row counts before sync so we can compute the delta for incremental
    rows_before = 0
    if use_incremental and store._has_internal_table(table_name):
        rows_before = store.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0

    try:
        dataset_query = config.dataset_query
        results_query = config.results_query

        if use_incremental:
            assert isinstance(incremental_column, str)
            dataset_wm = store.get_watermark(dataset_table)
            results_wm = store.get_watermark(results_table)
            logger.info(
                f"[{table_name}] Watermarks: "
                f"{dataset_table}={dataset_wm}, {results_table}={results_wm}"
            )
            dataset_query = _wrap_query_incremental(
                dataset_query,
                incremental_column,
                dataset_wm,  # type: ignore[arg-type]
            )
            results_query = _wrap_query_incremental(
                results_query,
                incremental_column,
                results_wm,  # type: ignore[arg-type]
            )

        dataset_cfg = _SubQueryConfig(config, dataset_query)
        results_cfg = _SubQueryConfig(config, results_query)

        try:
            r1, r2 = await asyncio.gather(
                _sync_internal_table(
                    dataset_cfg, dataset_table, store, append_mode=use_incremental
                ),
                _sync_internal_table(
                    results_cfg, results_table, store, append_mode=use_incremental
                ),
            )
        except Exception:
            if use_incremental:
                # Incremental failed — clear watermarks so next sync does full rebuild
                logger.warning(f"Incremental sync failed for {table_name}, clearing watermarks")
                store.clear_watermark(dataset_table)
                store.clear_watermark(results_table)
            raise

        if r1.status == "error":
            if use_incremental:
                logger.warning(f"[{table_name}] {dataset_table} failed, clearing watermarks")
                store.clear_watermark(dataset_table)
                store.clear_watermark(results_table)
            raise RuntimeError(f"{dataset_table} failed: {r1.error}")
        if r2.status == "error":
            if use_incremental:
                logger.warning(f"[{table_name}] {results_table} failed, clearing watermarks")
                store.clear_watermark(dataset_table)
                store.clear_watermark(results_table)
            raise RuntimeError(f"{results_table} failed: {r2.error}")

        # Log sub-table row counts
        logger.info(
            f"[{table_name}] Sub-table rows: "
            f"{dataset_table}={r1.rows_synced}, {results_table}={r2.rows_synced}"
        )
        if use_incremental and r1.rows_synced == 0 and r2.rows_synced == 0:
            logger.info(f"[{table_name}] Incremental returned 0 new rows — no changes in source")

        # Rebuild join view only on full sync (views auto-reflect appended rows)
        if not use_incremental:
            await _build_join_view(store, table_name, dataset_table, results_table)

        # Always recompute metadata
        if store._has_internal_table(table_name):
            await anyio.to_thread.run_sync(lambda: store._compute_and_persist_metadata(table_name))

        # Update watermarks after successful sync
        if incremental_column:
            for sub_table in (dataset_table, results_table):
                if store._has_internal_table(sub_table):
                    max_val = store.query_value(
                        f'SELECT MAX("{incremental_column}") FROM {sub_table}'
                    )
                    if max_val is not None:
                        old_wm = store.get_watermark(sub_table)
                        store.set_watermark(sub_table, str(max_val))
                        logger.info(
                            f"[{table_name}] Watermark saved: " f"{sub_table}={old_wm} → {max_val}"
                        )

        # Human signals post-processing: always rebuild derived tables
        if table_name == "human_signals_raw" and store._has_internal_table("human_signals_raw"):
            sync_id = str(uuid.uuid4())
            await _build_human_signals_derived_tables(store, sync_id)

        duration = time.time() - start
        rows = store.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0
        incremental_rows = max(rows - rows_before, 0) if use_incremental else 0
        now = datetime.now(tz=UTC)
        store._sync_status[table_name] = SyncStatus(
            state="ready",
            rows=rows,
            last_sync=now,
            truncated=r1.truncated or r2.truncated,
            sync_type=sync_type,
            last_incremental=now if use_incremental else None,
            incremental_rows=incremental_rows,
        )
        if use_incremental:
            logger.info(
                f"[{table_name}] INCREMENTAL sync complete: "
                f"+{incremental_rows} new rows, {rows} total, {duration:.1f}s"
            )
        else:
            logger.info(
                f"[{table_name}] FULL sync complete: " f"{rows} total rows, {duration:.1f}s"
            )
        return SyncResult(
            table_name,
            rows,
            duration,
            "success",
            truncated=r1.truncated or r2.truncated,
        )
    except Exception as e:
        logger.exception(f"Split sync failed for {table_name}")
        store._sync_status[table_name] = SyncStatus(state="error", error=str(e))
        return SyncResult(table_name, 0, time.time() - start, "error", str(e))


# ------------------------------------------------------------------
# Single-table (non-split) sync
# ------------------------------------------------------------------


async def _sync_single_table(
    config: Any,
    table_name: str,
    store: DuckDBStore,
) -> SyncResult:
    """Sync a single non-split table: full rebuild via staging + atomic swap.

    Used for datasets like kpi_data that have a single query (no dataset/results split).
    """
    start = time.time()
    current = store.get_sync_status(table_name)
    if current.state == "syncing":
        return SyncResult(table_name, 0, 0, "skipped", "Sync already running")

    store._sync_status[table_name] = SyncStatus(state="syncing")

    try:
        result = await _sync_internal_table(config, table_name, store, append_mode=False)

        if result.status == "error":
            raise RuntimeError(f"{table_name} sync failed: {result.error}")

        # Compute and persist metadata
        if store._has_internal_table(table_name):
            await anyio.to_thread.run_sync(lambda: store._compute_and_persist_metadata(table_name))

        duration = time.time() - start
        rows = store.query_value(f"SELECT COUNT(*) FROM {table_name}") or 0
        now = datetime.now(tz=UTC)
        store._sync_status[table_name] = SyncStatus(
            state="ready",
            rows=rows,
            last_sync=now,
            truncated=result.truncated,
            sync_type="full",
        )
        logger.info(f"[{table_name}] FULL sync complete: {rows} total rows, {duration:.1f}s")
        return SyncResult(table_name, rows, duration, "success", truncated=result.truncated)
    except Exception as e:
        logger.exception(f"Single-table sync failed for {table_name}")
        store._sync_status[table_name] = SyncStatus(state="error", error=str(e))
        return SyncResult(table_name, 0, time.time() - start, "error", str(e))


# ------------------------------------------------------------------
# Core sync logic
# ------------------------------------------------------------------


def _build_url(config: Any) -> str:
    """Build a connection URL from config using the appropriate backend."""
    from app.services.db import get_backend

    db_type = getattr(config, "db_type", "postgres")
    return get_backend(db_type).build_url(config)


async def sync_dataset(
    config: Any,
    table_name: str,
    store: DuckDBStore,
    force_full: bool = False,
) -> SyncResult:
    """Sync one dataset to DuckDB.

    Split datasets (monitoring, eval, human_signals) use the two-table split path.
    Non-split datasets (kpi) use a direct single-table sync.
    """
    if table_name in _SPLIT_TABLE_MAP:
        return await _sync_split(config, table_name, store, force_full=force_full)
    return await _sync_single_table(config, table_name, store)


# ------------------------------------------------------------------
# Sync orchestration
# ------------------------------------------------------------------


async def sync_all(
    store: DuckDBStore | None = None,
    force_full: bool = False,
) -> list[SyncResult]:
    """Sync all configured datasets. Skips datasets not eligible for this trigger."""
    return await sync_all_for_reason(reason="manual", store=store, force_full=force_full)


async def sync_all_for_reason(
    reason: str,
    store: DuckDBStore | None = None,
    force_full: bool = False,
) -> list[SyncResult]:
    """Sync datasets based on trigger reason — concurrently.

    Eligible datasets sync in parallel via asyncio.gather. Each dataset
    reads from Postgres concurrently; DuckDB writes serialize through
    the store's write lock (held briefly per dataset).

    reason:
    - "startup": requires per-dataset auto_load/auto_connect + enabled
    - "manual": requires configured query + enabled
    """
    from app.config import (
        eval_db_config,
        human_signals_db_config,
        kpi_db_config,
        monitoring_db_config,
    )

    if store is None:
        store = get_store()

    datasets: list[tuple[Any, str]] = [
        (monitoring_db_config, "monitoring_data"),
        (human_signals_db_config, "human_signals_raw"),
        (eval_db_config, "eval_data"),
        (kpi_db_config, "kpi_data"),
    ]

    coros = []
    coro_labels = []
    for config, table in datasets:
        is_configured = getattr(config, "is_configured", False)
        has_query = getattr(config, "has_query", False)
        is_enabled = getattr(config, "enabled", True)
        should_auto_load = getattr(config, "should_auto_load", False)

        if not is_enabled:
            logger.info(f"Skipping {table}: disabled in config")
            continue
        if not has_query or not is_configured:
            logger.info(f"Skipping {table}: not configured or no query")
            continue
        if reason == "startup" and not should_auto_load:
            logger.info(f"Skipping {table}: auto_load/auto_connect disabled")
            continue

        coros.append(sync_dataset(config, table, store, force_full=force_full))
        coro_labels.append(table)

    if not coros:
        return []

    logger.info(f"Starting concurrent sync for {len(coros)} dataset(s): {coro_labels}")
    raw_results = await asyncio.gather(*coros, return_exceptions=True)

    results: list[SyncResult] = []
    for label, raw in zip(coro_labels, raw_results, strict=False):
        if isinstance(raw, BaseException):
            logger.exception(f"Sync task for {label} raised an exception", exc_info=raw)
            results.append(SyncResult(label, 0, 0, "error", str(raw)))
        else:
            results.append(raw)

    return results


async def sync_single(
    dataset: str,
    store: DuckDBStore | None = None,
    force_full: bool = False,
) -> SyncResult:
    """Sync a single dataset by name."""
    from app.config import (
        eval_db_config,
        human_signals_db_config,
        kpi_db_config,
        monitoring_db_config,
    )

    if store is None:
        store = get_store()

    config_map: dict[str, tuple[Any, str]] = {
        "monitoring": (monitoring_db_config, "monitoring_data"),
        "human_signals": (human_signals_db_config, "human_signals_raw"),
        "eval": (eval_db_config, "eval_data"),
        "kpi": (kpi_db_config, "kpi_data"),
    }

    if dataset not in config_map:
        return SyncResult(dataset, 0, 0, "error", f"Unknown dataset: {dataset}")

    config, table = config_map[dataset]
    if not getattr(config, "enabled", True):
        return SyncResult(table, 0, 0, "error", f"Dataset {dataset} is disabled")
    if not config.has_query or not getattr(config, "is_configured", False):
        return SyncResult(table, 0, 0, "error", f"Dataset {dataset} not configured")

    return await sync_dataset(config, table, store, force_full=force_full)


# ------------------------------------------------------------------
# Leader-only file lock for multi-worker
# ------------------------------------------------------------------


async def sync_with_lock(
    store: DuckDBStore | None = None,
    reason: str = "manual",
    force_full: bool = False,
) -> list[SyncResult]:
    """Acquire OS file lock, run sync, release.

    Uses fcntl.flock (LOCK_EX | LOCK_NB) — non-blocking exclusive lock.
    Lock released when fd closed (including on process crash).
    """
    if store is None:
        store = get_store()

    lock_path = f"{store.db_path}.lock"
    Path(lock_path).touch(exist_ok=True)

    fd = Path(lock_path).open("w")  # noqa: SIM115
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fd.close()
        logger.info("Another worker holds sync lock, skipping")
        return []

    try:
        return await sync_all_for_reason(reason=reason, store=store, force_full=force_full)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        fd.close()


# ------------------------------------------------------------------
# Periodic incremental sync scheduler
# ------------------------------------------------------------------


async def periodic_sync_loop(store: DuckDBStore) -> None:
    """Periodically sync datasets that have refresh_interval_minutes > 0.

    Runs forever until cancelled. Each iteration sleeps until the next
    dataset is due, then syncs all due datasets concurrently.
    """
    from app.config import (
        eval_db_config,
        human_signals_db_config,
        kpi_db_config,
        monitoring_db_config,
    )

    datasets: list[tuple[Any, str, str]] = [
        (monitoring_db_config, "monitoring_data", "monitoring"),
        (human_signals_db_config, "human_signals_raw", "human_signals"),
        (eval_db_config, "eval_data", "eval"),
        (kpi_db_config, "kpi_data", "kpi"),
    ]

    # Filter to datasets with periodic refresh enabled and configured
    scheduled: list[tuple[Any, str, str, int]] = []
    for config, table, dataset_name in datasets:
        interval = getattr(config, "refresh_interval_minutes", 0)
        is_configured = getattr(config, "is_configured", False)
        has_query = getattr(config, "has_query", False)
        is_enabled = getattr(config, "enabled", True)
        if interval > 0 and is_configured and has_query and is_enabled:
            scheduled.append((config, table, dataset_name, interval))

    if not scheduled:
        logger.info("No datasets configured for periodic refresh, scheduler exiting")
        return

    names = [f"{name} (every {iv}m)" for _, _, name, iv in scheduled]
    logger.info(f"Periodic sync scheduler started for: {', '.join(names)}")

    # Seed with current time so the first periodic tick waits the full interval
    # (startup sync already ran moments ago — no need to duplicate immediately)
    last_run: dict[str, float] = {table: time.time() for _, table, _, _ in scheduled}

    try:
        while True:
            now = time.time()
            min_wait = float("inf")
            due: list[tuple[Any, str, str]] = []

            for config, table, dataset_name, interval_minutes in scheduled:
                interval_secs = interval_minutes * 60
                elapsed = now - last_run[table]
                if elapsed >= interval_secs:
                    due.append((config, table, dataset_name))
                else:
                    remaining = interval_secs - elapsed
                    min_wait = min(min_wait, remaining)

            if due:
                due_names = [name for _, _, name in due]
                logger.info(f"Periodic sync triggering for: {due_names}")
                coros = []
                for config, table, _name in due:
                    coros.append(sync_dataset(config, table, store))
                results = await asyncio.gather(*coros, return_exceptions=True)
                for (_, table, dataset_name), result in zip(due, results, strict=False):
                    last_run[table] = time.time()
                    if isinstance(result, BaseException):
                        logger.error(f"Periodic sync failed for {dataset_name}: {result}")
                    elif result.status == "error":
                        logger.error(f"Periodic sync error for {dataset_name}: {result.error}")
                    else:
                        logger.info(
                            f"Periodic sync complete for {dataset_name}: "
                            f"{result.rows_synced} rows, {result.duration_seconds:.1f}s"
                        )
                # Recalculate min_wait after running
                now = time.time()
                min_wait = float("inf")
                for _, table, _, interval_minutes in scheduled:
                    interval_secs = interval_minutes * 60
                    remaining = interval_secs - (now - last_run[table])
                    min_wait = min(min_wait, max(remaining, 0))

            if min_wait == float("inf"):
                min_wait = 60  # Safety fallback

            logger.info(f"Periodic sync scheduler sleeping {min_wait:.0f}s until next check")
            await asyncio.sleep(min_wait)
    except asyncio.CancelledError:
        logger.info("Periodic sync scheduler shutting down")
        return
