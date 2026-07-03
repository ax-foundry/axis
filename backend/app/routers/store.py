import asyncio
import logging
import math
import re
import time
from typing import Any, Literal

import anyio
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.config.env import settings
from app.services.duckdb_store import ALLOWED_TABLES, DATASET_TABLE_MAP, get_store
from app.services.export_service import (
    ExportStorageNotConfiguredError,
    sanitize_export_filename,
    stage_csv_export,
)

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


def _dataset_auto_loads(table: str) -> bool:
    """True if this table belongs to an active dataset that syncs at startup.

    For such datasets, a missing table means data is on its way (or a sync
    failed and the periodic scheduler will retry) — never "there is no data".
    """
    from app.config.db.duckdb import duckdb_config
    from app.config.db.eval_db import eval_db_config
    from app.config.db.human_signals import human_signals_db_config
    from app.config.db.kpi import kpi_db_config
    from app.config.db.monitoring import monitoring_db_config

    config = {
        "monitoring_data": monitoring_db_config,
        "human_signals_data": human_signals_db_config,
        "human_signals_cases": human_signals_db_config,
        "eval_data": eval_db_config,
        "kpi_data": kpi_db_config,
    }.get(table)
    if config is None or duckdb_config.sync_mode != "startup":
        return False
    return bool(
        getattr(config, "enabled", False)
        and getattr(config, "is_configured", False)
        and getattr(config, "has_query", False)
        and getattr(config, "should_auto_load", False)
    )


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
        "human_signals_data": (human_signals_db_config, "human_signals"),
        "human_signals_cases": (None, None),
        "eval_data": (eval_db_config, "eval"),
        "kpi_data": (kpi_db_config, "kpi"),
    }
    split_table_map = {
        "monitoring_data": ("monitoring_dataset", "monitoring_results"),
        "human_signals_data": ("human_signals_dataset", "human_signals_results"),
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
async def get_dataset_metadata(
    dataset: str,
    source_name: str | None = Query(None, description="Filter filter_values to this source"),
) -> dict[str, Any]:
    """Columns, time range, filter values for a dataset.

    Filter values are pre-computed at sync time for low-cardinality fields.
    When source_name is provided, filter_values are computed live for that source.
    """
    table = _resolve_table(dataset)
    store = get_store()
    metadata = await anyio.to_thread.run_sync(
        lambda: store.get_metadata(table),
        limiter=store.query_limiter,
    )
    if source_name:
        filtered_fv = await anyio.to_thread.run_sync(
            lambda: store.get_filter_values_for_source(table, source_name),
            limiter=store.query_limiter,
        )
        if filtered_fv:
            metadata = {**metadata, "filter_values": filtered_fv}
    return {"success": True, "dataset": dataset, "metadata": metadata}


# ------------------------------------------------------------------
# Paginated data endpoint
# ------------------------------------------------------------------


# Allowed sort columns (validated per-request against actual schema)
ALLOWED_SORT_DIRS = {"asc", "desc"}
NUMERIC_RESPONSE_COLUMNS = frozenset({"metric_score", "latency", "threshold", "cost_estimate"})


def _coerce_numeric_response_values(rows: list[dict[str, Any]]) -> None:
    """Normalize numeric store values before JSON serialization.

    DuckDB can infer sparse BigQuery/COPY columns such as ``metric_score`` as
    VARCHAR in one environment and DOUBLE in another. The monitoring UI treats
    these fields as numbers, so coerce numeric strings at the API boundary while
    preserving genuinely non-numeric values.
    """
    for row in rows:
        for col in NUMERIC_RESPONSE_COLUMNS:
            value = row.get(col)
            if isinstance(value, str):
                stripped = value.strip()
                if not stripped:
                    continue
                try:
                    numeric = float(stripped)
                except ValueError:
                    continue
                row[col] = numeric if math.isfinite(numeric) else None


@router.get("/data/{dataset}")
async def get_dataset_data(
    dataset: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=10000),
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
        # A sync in flight (e.g. the backgrounded startup full sync) builds the
        # table/view at the end, so during that ~minutes-long window the table
        # is genuinely absent. Returning an empty 200 here makes the UI treat
        # the dataset as "ready but empty" and fall back to partial client-side
        # data. Surface a 503 dataset_warming instead — matching GET
        # /store/query — so the frontend's retry config waits for the real data.
        # For auto-load datasets the 503 also covers "not_synced" (a process
        # that hasn't seeded/started its sync yet) and "error" (the periodic
        # scheduler will retry) — an empty 200 would be a lie in both. A
        # dataset that is genuinely inactive (disabled/unconfigured/manual)
        # keeps the existing empty payload.
        state = store.get_sync_status(table).state
        if state == "syncing" or (_dataset_auto_loads(table) and state in ("not_synced", "error")):
            raise HTTPException(
                status_code=503,
                detail={"code": "dataset_warming", "table": table},
            )
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
    data_sql = f"SELECT {select_clause} FROM {table} WHERE {where_clause} {order} LIMIT ? OFFSET ?"
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
    if dataset == "monitoring":
        _coerce_numeric_response_values(rows)

    return {
        "success": True,
        "data": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ------------------------------------------------------------------
# Export endpoint (ephemeral CSV — no persistent table created)
# ------------------------------------------------------------------


class ExportRequest(BaseModel):
    """Request body for a one-shot CSV export."""

    sql: str
    filename: str = "export.csv"
    max_rows: int | None = None


class ExportResponse(BaseModel):
    """Response body for a staged CSV export."""

    success: bool
    download_url: str
    filename: str
    expires_at: str
    row_count: int
    size_bytes: int


_EXPORT_SQL_UNSAFE_RE = re.compile(
    r"\b(DROP|INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|"
    r"GRANT|REVOKE|ATTACH|DETACH|COPY|EXPORT|IMPORT|INSTALL|LOAD)\b",
    re.IGNORECASE,
)


def _has_export_sql_separator_or_comment(sql: str) -> bool:
    """Return True when SQL contains statement separators or comments outside strings."""
    in_single_quote = False
    in_double_quote = False
    i = 0
    while i < len(sql):
        char = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""

        if char == "'" and not in_double_quote:
            if in_single_quote and nxt == "'":
                i += 2
                continue
            in_single_quote = not in_single_quote
            i += 1
            continue

        if char == '"' and not in_single_quote:
            if in_double_quote and nxt == '"':
                i += 2
                continue
            in_double_quote = not in_double_quote
            i += 1
            continue

        if not in_single_quote and not in_double_quote and (
            char == ";" or (char == "-" and nxt == "-") or (char == "/" and nxt == "*")
        ):
            return True

        i += 1

    return False


@router.post("/export", response_model=None)
async def export_sql_as_csv(req: ExportRequest) -> ExportResponse | Response:
    """Execute a SELECT and return a CSV download.

    When AXIS_EXPORT_BUCKET is configured, large exports are staged in GCS and
    returned as signed URLs. Otherwise, fall back to the original direct CSV
    response for local/OSS deployments.
    """
    sql_stripped = req.sql.strip().rstrip(";")

    if _has_export_sql_separator_or_comment(sql_stripped):
        raise HTTPException(status_code=400, detail="SQL comments and multiple statements are not permitted.")

    # Safety: block DDL/DML
    if _EXPORT_SQL_UNSAFE_RE.search(
        re.sub(r"--[^\n]*", " ", re.sub(r"/\*.*?\*/", " ", sql_stripped, flags=re.DOTALL))
    ):
        raise HTTPException(status_code=400, detail="Only SELECT statements are permitted.")
    if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
        raise HTTPException(status_code=400, detail="Only SELECT statements are permitted.")

    max_rows = req.max_rows if req.max_rows is not None else settings.export_max_rows
    if max_rows <= 0:
        raise HTTPException(status_code=400, detail="max_rows must be greater than 0.")
    max_rows = min(max_rows, settings.export_max_rows)

    store = get_store()
    try:
        result = await stage_csv_export(
            store=store,
            sql=sql_stripped,
            filename=req.filename,
            max_rows=max_rows,
        )
    except ExportStorageNotConfiguredError:
        try:
            csv = await anyio.to_thread.run_sync(
                lambda: store.sql_to_csv(sql_stripped, max_rows=max_rows),
                limiter=store.query_limiter,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Export failed: {exc}") from exc

        safe_filename = sanitize_export_filename(req.filename)
        return Response(
            content=csv,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
        )
    except Exception as exc:
        logger.exception("Failed to stage CSV export")
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc

    return ExportResponse(
        success=True,
        download_url=result.download_url,
        filename=result.filename,
        expires_at=result.expires_at.isoformat(),
        row_count=result.row_count,
        size_bytes=result.size_bytes,
    )


# ------------------------------------------------------------------
# Structured query endpoint (typed JSON, no client SQL)
# ------------------------------------------------------------------


BLOCKED_BLOB_COLUMNS = frozenset(
    {"evaluation_metadata", "metric_metadata", "signals", "dataset_metadata"}
)
QUERY_TIMEOUT_SECONDS = 10


class Filter(BaseModel):
    """A single WHERE-clause filter on a column."""

    col: str
    op: Literal["eq", "neq", "in", "gte", "lte", "gt", "lt", "is_null", "is_not_null"]
    value: Any | None = None


class Aggregate(BaseModel):
    """An aggregate expression (e.g., AVG(score) AS avg_score)."""

    fn: Literal["count", "avg", "sum", "max", "min", "count_distinct"]
    col: str
    as_: str = Field(alias="as")

    model_config = {"populate_by_name": True}


class OrderBy(BaseModel):
    """An ORDER BY clause entry. ``col`` may be a base column or an aggregate alias."""

    col: str
    dir: Literal["asc", "desc"] = "asc"


class DateTrunc(BaseModel):
    """Bucket a timestamp column into day/week/month and alias it."""

    col: str
    unit: Literal["day", "week", "month"]
    as_: str = Field(alias="as")

    model_config = {"populate_by_name": True}


class StoreQueryRequest(BaseModel):
    """Structured query request — server builds parameterized SQL from these fields."""

    select: list[str] | None = None
    date_trunc: DateTrunc | None = None
    filters: list[Filter] = Field(default_factory=list, max_length=6)
    group_by: list[str] = Field(default_factory=list)
    aggregates: list[Aggregate] = Field(default_factory=list, max_length=4)
    order_by: list[OrderBy] = Field(default_factory=list)
    limit: int = Field(default=1000, ge=1, le=10_000)


_FILTER_OP_SQL = {
    "eq": "=",
    "neq": "!=",
    "gte": ">=",
    "lte": "<=",
    "gt": ">",
    "lt": "<",
}


def _bad_request(code: str, message: str, **details: Any) -> HTTPException:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return HTTPException(status_code=400, detail=payload)


def _check_col(col: str, allowed: set[str], where: str) -> None:
    if col not in allowed:
        raise _bad_request("invalid_column", f"Unknown column '{col}' in {where}", column=col)


def _check_not_blob(col: str) -> None:
    if col in BLOCKED_BLOB_COLUMNS:
        raise _bad_request(
            "forbidden_select_blob",
            f"Column '{col}' is a JSON blob and may not be selected",
            column=col,
        )


def build_sql(req: StoreQueryRequest, table: str, allowed: set[str]) -> tuple[str, list[Any]]:
    """Build a parameterized SELECT for the structured-query endpoint.

    All identifiers are validated against `allowed` before being quoted into
    SQL. All values are bound positionally via ``?`` placeholders.
    """
    has_aggregates = bool(req.aggregates)
    select_cols = list(req.select or [])
    trunc_alias: str | None = None

    select_pieces: list[str] = []
    group_pieces: list[str] = []

    if req.date_trunc is not None:
        _check_col(req.date_trunc.col, allowed, "date_trunc.col")
        trunc_alias = req.date_trunc.as_
        select_pieces.append(
            f"DATE_TRUNC('{req.date_trunc.unit}', \"{req.date_trunc.col}\")::text "
            f'AS "{trunc_alias}"'
        )

    for col in select_cols:
        _check_col(col, allowed, "select")
        _check_not_blob(col)
        select_pieces.append(f'"{col}"')

    for col in req.group_by:
        _check_col(col, allowed, "group_by")

    if has_aggregates:
        # Auto-project group_by columns that aren't already in select/date_trunc.
        existing = set(select_cols) | ({trunc_alias} if trunc_alias else set())
        for col in req.group_by:
            if col not in existing:
                select_pieces.append(f'"{col}"')
                existing.add(col)
        for agg in req.aggregates:
            if agg.fn == "count" and agg.col == "*":
                expr = "COUNT(*)"
            elif agg.fn == "count_distinct":
                _check_col(agg.col, allowed, "aggregate.col")
                expr = f'COUNT(DISTINCT "{agg.col}")'
            else:
                _check_col(agg.col, allowed, "aggregate.col")
                expr = f'{agg.fn.upper()}("{agg.col}")'
            select_pieces.append(f'{expr} AS "{agg.as_}"')

        for col in req.group_by:
            group_pieces.append(f'"{col}"')
        if trunc_alias:
            group_pieces.append(f'"{trunc_alias}"')
    else:
        if not select_pieces:
            raise _bad_request(
                "invalid_query",
                "select or date_trunc must be present when no aggregates are given",
            )
        if req.group_by:
            raise _bad_request(
                "invalid_column",
                "group_by requires at least one aggregate",
            )

    where_pieces: list[str] = []
    params: list[Any] = []
    for f in req.filters:
        _check_col(f.col, allowed, "filters.col")
        if f.op in _FILTER_OP_SQL:
            where_pieces.append(f'"{f.col}" {_FILTER_OP_SQL[f.op]} ?')
            params.append(f.value)
        elif f.op == "in":
            if not isinstance(f.value, list) or not f.value:
                raise _bad_request(
                    "invalid_filter_op",
                    "'in' requires a non-empty list",
                    column=f.col,
                )
            placeholders = ", ".join(["?"] * len(f.value))
            where_pieces.append(f'"{f.col}" IN ({placeholders})')
            params.extend(f.value)
        elif f.op == "is_null":
            where_pieces.append(f'"{f.col}" IS NULL')
        elif f.op == "is_not_null":
            where_pieces.append(f'"{f.col}" IS NOT NULL')

    order_pieces: list[str] = []
    valid_aliases = {a.as_ for a in req.aggregates} | ({trunc_alias} if trunc_alias else set())
    for o in req.order_by:
        # Aggregate/trunc aliases take precedence over base column names of the same name —
        # in aggregate mode, ordering by the base column is almost never what callers want.
        if o.col in valid_aliases:
            order_pieces.append(f'"{o.col}" {o.dir.upper()}')
        else:
            _check_col(o.col, allowed, "order_by.col")
            order_pieces.append(f'"{o.col}" {o.dir.upper()}')

    sql = "SELECT " + ", ".join(select_pieces) + f' FROM "{table}"'
    if where_pieces:
        sql += " WHERE " + " AND ".join(where_pieces)
    if group_pieces:
        sql += " GROUP BY " + ", ".join(group_pieces)
    if order_pieces:
        sql += " ORDER BY " + ", ".join(order_pieces)
    sql += f" LIMIT {min(req.limit, 10_000)}"
    return sql, params


@router.post("/query/{dataset}")
async def query_dataset(
    dataset: str,
    req: StoreQueryRequest,
    debug: bool = Query(False),
) -> dict[str, Any]:
    """Execute a structured (no-SQL) analytical query against a dataset.

    Datasets resolve to DuckDB tables via DATASET_TABLE_MAP. All identifiers
    are validated against the live table schema; values are parameter-bound.
    """
    table = _resolve_table(dataset)
    store = get_store()

    if not store.has_table(table):
        raise HTTPException(
            status_code=503,
            detail={"code": "dataset_warming", "table": table},
        )

    allowed = store.get_table_columns(table)
    sql, params = build_sql(req, table, allowed)

    started = time.perf_counter()
    try:
        rows = await anyio.to_thread.run_sync(
            lambda: store.query_list_interruptible(sql, params, QUERY_TIMEOUT_SECONDS),
            limiter=store.query_limiter,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail={"code": "query_timeout", "timeout_seconds": QUERY_TIMEOUT_SECONDS},
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("store_query failed for table=%s", table)
        raise HTTPException(
            status_code=500,
            detail={"code": "internal_error", "message": str(exc)},
        ) from exc

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "store_query table=%s filter_cols=%s group_by=%s row_count=%d elapsed_ms=%d",
        table,
        [f.col for f in req.filters],
        req.group_by,
        len(rows),
        elapsed_ms,
    )

    return {
        "rows": rows,
        "row_count": len(rows),
        "elapsed_ms": elapsed_ms,
        "sql": sql if debug else None,
    }
