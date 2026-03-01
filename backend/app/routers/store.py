import asyncio
import logging
from typing import Any

import anyio
from fastapi import APIRouter, HTTPException, Query

from app.services.duckdb_store import ALLOWED_TABLES, DATASET_TABLE_MAP, get_store

logger = logging.getLogger(__name__)

router = APIRouter()

# Allowed dataset names for path params
ALLOWED_DATASETS = frozenset({"monitoring", "human_signals", "eval", "kpi"})


def _resolve_table(dataset: str) -> str:
    """Map dataset name to DuckDB table name. Raises 404 if unknown."""
    table = DATASET_TABLE_MAP.get(dataset)
    if not table or table not in ALLOWED_TABLES:
        raise HTTPException(404, f"Unknown dataset: {dataset}. Allowed: {sorted(ALLOWED_DATASETS)}")
    return table


# ------------------------------------------------------------------
# Sync endpoints
# ------------------------------------------------------------------


@router.post("/sync")
async def trigger_sync_all(
    full: bool = Query(False, description="Force full rebuild (ignore watermarks)"),
) -> dict[str, Any]:
    """Trigger sync of all configured datasets (background task).

    By default uses incremental sync when watermarks are available.
    Pass full=true to force a full rebuild (staging + atomic swap).

    Returns 409 if any sync is already running.
    """
    from app.services.sync_engine import sync_with_lock

    store = get_store()

    # Check if any sync is already running
    for table in ALLOWED_TABLES:
        status = store.get_sync_status(table)
        if status.state == "syncing":
            raise HTTPException(409, f"Sync already running for {table}")

    task = asyncio.create_task(sync_with_lock(store, reason="manual", force_full=full))
    task.add_done_callback(lambda t: t.result() if not t.cancelled() else None)
    mode = "full rebuild" if full else "incremental (if available)"
    return {"success": True, "message": f"Sync started in background ({mode})"}


@router.post("/sync/{dataset}")
async def trigger_sync_dataset(
    dataset: str,
    full: bool = Query(False, description="Force full rebuild (ignore watermarks)"),
) -> dict[str, Any]:
    """Trigger sync for a single dataset (background task).

    By default uses incremental sync when watermarks are available.
    Pass full=true to force a full rebuild.

    Returns 409 if sync already running for this dataset.
    """
    if dataset not in ALLOWED_DATASETS:
        raise HTTPException(404, f"Unknown dataset: {dataset}")

    from app.services.sync_engine import sync_single

    store = get_store()
    table = _resolve_table(dataset)

    status = store.get_sync_status(table)
    if status.state == "syncing":
        raise HTTPException(409, f"Sync already running for {dataset}")

    task = asyncio.create_task(sync_single(dataset, store, force_full=full))
    task.add_done_callback(lambda t: t.result() if not t.cancelled() else None)
    mode = "full rebuild" if full else "incremental (if available)"
    return {"success": True, "message": f"Sync started for {dataset} ({mode})"}


# ------------------------------------------------------------------
# Status endpoints
# ------------------------------------------------------------------


@router.get("/status")
async def get_store_status() -> dict[str, Any]:
    """Per-table sync status with incremental refresh info."""
    from app.config.db.duckdb import duckdb_config
    from app.config.db.eval_db import eval_db_config
    from app.config.db.human_signals import human_signals_db_config
    from app.config.db.kpi import kpi_db_config
    from app.config.db.monitoring import monitoring_db_config

    store = get_store()
    datasets_status = store.get_all_sync_status()

    # Enrich with per-dataset config info and watermarks
    config_map = {
        "monitoring_data": (monitoring_db_config, "monitoring"),
        "human_signals_raw": (human_signals_db_config, "human_signals"),
        "human_signals_cases": (None, None),
        "eval_data": (eval_db_config, "eval"),
        "kpi_data": (kpi_db_config, "kpi"),
    }
    split_table_map = {
        "monitoring_data": ("monitoring_dataset", "monitoring_results"),
        "human_signals_raw": ("human_signals_dataset", "human_signals_results"),
        "eval_data": ("eval_dataset", "eval_results"),
    }

    for table, status_dict in datasets_status.items():
        cfg_info = config_map.get(table, (None, None))
        config = cfg_info[0]
        if config is not None:
            status_dict["refresh_interval_minutes"] = getattr(config, "refresh_interval_minutes", 0)
            status_dict["incremental_column"] = getattr(config, "incremental_column", None)
            # Include watermarks for sub-tables
            sub_tables = split_table_map.get(table)
            if sub_tables:
                status_dict["watermarks"] = {
                    sub_tables[0]: store.get_watermark(sub_tables[0]),
                    sub_tables[1]: store.get_watermark(sub_tables[1]),
                }

    return {
        "success": True,
        "enabled": duckdb_config.enabled,
        "datasets": datasets_status,
    }


@router.post("/sync/{dataset}/reset-watermark")
async def reset_dataset_watermark(dataset: str) -> dict[str, Any]:
    """Clear watermarks for a dataset, forcing the next sync to do a full rebuild."""
    if dataset not in ALLOWED_DATASETS:
        raise HTTPException(404, f"Unknown dataset: {dataset}")

    from app.services.sync_engine import _SPLIT_TABLE_MAP

    table = _resolve_table(dataset)
    store = get_store()

    sub_tables = _SPLIT_TABLE_MAP.get(table)
    if sub_tables:
        dataset_table, results_table = sub_tables
        store.clear_watermark(dataset_table)
        store.clear_watermark(results_table)
        return {
            "success": True,
            "message": f"Watermarks cleared for {dataset}. Next sync will do a full rebuild.",
        }

    return {"success": False, "message": f"No split tables found for {dataset}"}


# ------------------------------------------------------------------
# Metadata endpoints
# ------------------------------------------------------------------


@router.get("/metadata/{dataset}")
async def get_dataset_metadata(dataset: str) -> dict[str, Any]:
    """Columns, time range, filter values for a dataset.

    Filter values are pre-computed at sync time for low-cardinality fields.
    """
    table = _resolve_table(dataset)
    store = get_store()
    metadata = await anyio.to_thread.run_sync(
        lambda: store.get_metadata(table),
        limiter=store.query_limiter,
    )
    return {"success": True, "dataset": dataset, "metadata": metadata}


# ------------------------------------------------------------------
# Paginated data endpoint
# ------------------------------------------------------------------


# Allowed sort columns (validated per-request against actual schema)
ALLOWED_SORT_DIRS = {"asc", "desc"}


@router.get("/data/{dataset}")
async def get_dataset_data(
    dataset: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str | None = None,
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    columns: str | None = Query(None, description="Comma-separated column names to return"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    metric_name: str | None = None,
    metric_category: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """Paginated data access with filters and sorting.

    All filter values are parameterized — never interpolated into SQL.
    sort_by is validated against actual table columns.
    Pass `columns` to select only specific columns (reduces payload size).
    """
    table = _resolve_table(dataset)
    store = get_store()

    if not store.has_table(table):
        return {
            "success": True,
            "data": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
        }

    # Validate sort_by against actual columns
    table_cols = store.get_table_columns(table)
    if sort_by and sort_by not in table_cols:
        sort_by = None

    # Build column projection (validated against actual schema)
    select_clause = "*"
    if columns:
        requested = [c.strip() for c in columns.split(",") if c.strip()]
        valid_cols = [c for c in requested if c in table_cols]
        if valid_cols:
            # Ensure sort column is included so ORDER BY works
            effective_sort = sort_by or ("timestamp" if "timestamp" in table_cols else None)
            if effective_sort and effective_sort not in valid_cols:
                valid_cols.append(effective_sort)
            select_clause = ", ".join(valid_cols)

    # Build WHERE clause
    conditions: list[str] = []
    params: list[Any] = []

    filter_map = {
        "environment": environment,
        "source_name": source_name,
        "source_component": source_component,
        "source_type": source_type,
        "metric_name": metric_name,
        "metric_category": metric_category,
    }

    for col, val in filter_map.items():
        if val and col in table_cols:
            if col == "metric_category":
                cat_upper = val.upper()
                if cat_upper == "SCORE":
                    # SCORE is the default bucket: match explicit SCORE or NULL/missing
                    conditions.append(f"(UPPER(CAST({col} AS VARCHAR)) = ? OR {col} IS NULL)")
                    params.append(cat_upper)
                else:
                    conditions.append(f"UPPER(CAST({col} AS VARCHAR)) = ?")
                    params.append(cat_upper)
            else:
                conditions.append(f"{col} = ?")
                params.append(val)

    if time_start and "timestamp" in table_cols:
        conditions.append("timestamp >= ?")
        params.append(time_start)
    if time_end and "timestamp" in table_cols:
        conditions.append("timestamp <= ?")
        params.append(time_end)

    if search:
        search_conds = []
        # Check both standard and dataset-prefixed column names (from JOIN view)
        for col in ["query", "trace_id", "actual_output", "dataset_query", "dataset_actual_output"]:
            if col in table_cols:
                search_conds.append(f"{col} ILIKE ?")
                params.append(f"%{search}%")
        if search_conds:
            conditions.append(f"({' OR '.join(search_conds)})")

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    has_filters = bool(conditions)

    # Data query with sort + pagination
    order = ""
    if sort_by:
        direction = sort_dir if sort_dir in ALLOWED_SORT_DIRS else "desc"
        order = f"ORDER BY {sort_by} {direction} NULLS LAST"
    elif "timestamp" in table_cols:
        order = "ORDER BY timestamp DESC NULLS LAST"

    offset = (page - 1) * page_size
    data_sql = (
        f"SELECT {select_clause} FROM {table} " f"WHERE {where_clause} {order} LIMIT ? OFFSET ?"
    )
    data_params = [*params, page_size, offset]

    def _run_query() -> tuple[int, list[dict[str, Any]]]:
        # Skip COUNT query when unfiltered — use cached row_count from metadata
        total: int
        if not has_filters:
            meta = store.get_metadata(table)
            cached_count = meta.get("row_count") if meta else None
            if cached_count is not None:
                total = int(cached_count)
            else:
                count_sql = f"SELECT COUNT(*) FROM {table}"
                total = store.query_value(count_sql) or 0
        else:
            count_sql = f"SELECT COUNT(*) FROM {table} WHERE {where_clause}"
            total = store.query_value(count_sql, params) or 0
        rows = store.query_list(data_sql, data_params)
        return total, rows

    total, rows = await anyio.to_thread.run_sync(_run_query, limiter=store.query_limiter)

    return {
        "success": True,
        "data": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
