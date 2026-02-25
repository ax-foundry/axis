import asyncio
import contextlib
import json
import logging
from typing import Any, cast

import anyio
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import monitoring_db_config
from app.services.duckdb_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter()

TABLE = "monitoring_data"

# Allowlisted identifiers for GROUP BY / ORDER BY
ALLOWED_GROUP_BY = frozenset(
    {
        "environment",
        "source_name",
        "source_component",
        "source_type",
        "metric_name",
        "evaluation_name",
        "model_name",
    }
)

ALLOWED_GRANULARITIES = frozenset({"hourly", "daily", "weekly"})

# DuckDB date_trunc intervals
GRANULARITY_MAP = {"hourly": "hour", "daily": "day", "weekly": "week"}


# ============================================
# Shared Utilities
# ============================================


def _validate_group_by(group_by: str | None) -> str | None:
    """Validate group_by against allowlist."""
    if group_by and group_by not in ALLOWED_GROUP_BY:
        raise HTTPException(
            400, f"Invalid group_by: {group_by}. Allowed: {sorted(ALLOWED_GROUP_BY)}"
        )
    return group_by


def _build_where(
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    metric_category: str | None = None,
    metric_name: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> tuple[str, list[Any]]:
    """Build parameterized WHERE clause. DuckDB uses ? for positional params."""
    conds: list[str] = []
    vals: list[Any] = []

    if environment:
        conds.append("environment = ?")
        vals.append(environment)
    if source_name:
        conds.append("source_name = ?")
        vals.append(source_name)
    if source_component:
        conds.append("source_component = ?")
        vals.append(source_component)
    if source_type:
        conds.append("source_type = ?")
        vals.append(source_type)
    if metric_category:
        conds.append("UPPER(CAST(metric_category AS VARCHAR)) = ?")
        vals.append(metric_category.upper())
    if metric_name:
        conds.append("metric_name = ?")
        vals.append(metric_name)
    elif monitoring_db_config.visible_metrics:
        placeholders = ", ".join("?" for _ in monitoring_db_config.visible_metrics)
        conds.append(f"metric_name IN ({placeholders})")
        vals.extend(monitoring_db_config.visible_metrics)
    if time_start:
        conds.append("timestamp >= CAST(? AS TIMESTAMP)")
        vals.append(time_start)
    if time_end:
        conds.append("timestamp <= CAST(? AS TIMESTAMP)")
        vals.append(time_end)

    return (" AND ".join(conds) or "1=1"), vals


def _clean_value(v: Any) -> float | None:
    """Clean NaN/Inf for JSON serialization."""
    return get_store().clean_value(v)


def _ensure_table() -> None:
    """Raise 503 if monitoring_data table not ready."""
    get_store().ensure_ready(TABLE, "Monitoring data")


def _str_or_none(row: dict[str, Any], key: str) -> str | None:
    """Return str(value) if present and truthy, else None."""
    v = row.get(key)
    return str(v) if v else None


# ============================================
# Request/Response Models (same API contracts)
# ============================================


class TrendPoint(BaseModel):
    """Single trend data point."""

    timestamp: str
    metric: str
    avg: float
    p50: float
    p95: float
    p99: float
    count: int


class TrendResponse(BaseModel):
    """Response for trend analytics."""

    success: bool
    data: list[TrendPoint]
    metrics: list[str]
    granularity: str


class LatencyDistributionResponse(BaseModel):
    """Response for latency distribution analytics."""

    success: bool
    histogram: dict[str, Any]
    percentiles: dict[str, float]
    by_group: dict[str, Any] | None = None


class ClassDistributionGroup(BaseModel):
    """Distribution data for a single group."""

    group: str
    values: list[float]
    stats: dict[str, float]


class ClassDistributionResponse(BaseModel):
    """Response for class-level distribution analytics."""

    success: bool
    data: list[ClassDistributionGroup]
    metric: str
    group_by: str


class MetricBreakdownItem(BaseModel):
    """Breakdown data for a single metric."""

    name: str
    pass_rate: float
    avg: float
    count: int
    by_group: dict[str, dict[str, float]] | None = None


class MetricBreakdownResponse(BaseModel):
    """Response for metric breakdown analytics."""

    success: bool
    metrics: list[MetricBreakdownItem]


class CorrelationResponse(BaseModel):
    """Response for correlation analytics."""

    success: bool
    matrix: list[list[float]]
    metrics: list[str]


class CategoryCount(BaseModel):
    """Count for a single category value."""

    value: str
    count: int
    percentage: float


class ClassificationBreakdownItem(BaseModel):
    """Breakdown for a single classification metric."""

    metric_name: str
    categories: list[CategoryCount]
    total_count: int


class ClassificationBreakdownResponse(BaseModel):
    """Response for classification breakdown."""

    success: bool
    metrics: list[ClassificationBreakdownItem]


class ClassificationTrendPoint(BaseModel):
    """Single trend point for classification metrics."""

    timestamp: str
    categories: dict[str, int]


class ClassificationTrendResponse(BaseModel):
    """Response for classification trends."""

    success: bool
    data: list[ClassificationTrendPoint]
    metric_name: str
    granularity: str
    unique_categories: list[str]


class AnalysisRecordItem(BaseModel):
    """Single analysis record with signals."""

    dataset_id: str
    timestamp: str | None
    metric_name: str
    query: str | None
    actual_output: str | None
    signals: dict[str, Any] | list[Any] | str | None
    explanation: str | None
    source_info: dict[str, str | None]


class AnalysisInsightsResponse(BaseModel):
    """Response for analysis insights."""

    success: bool
    records: list[AnalysisRecordItem]
    total_count: int
    page: int
    limit: int
    metric_names: list[str]


# ============================================
# Endpoints
# ============================================


# ============================================
# Summary KPI endpoint (lightweight, loads before charts)
# ============================================


class SummaryKPIs(BaseModel):
    """KPI values for the monitoring dashboard."""

    total_records: int
    avg_score: float
    pass_rate: float
    p50_latency: float
    p95_latency: float
    p99_latency: float


class SummaryResponse(BaseModel):
    """Response for the summary KPI endpoint."""

    success: bool
    kpis: SummaryKPIs


@router.get("/summary", response_model=SummaryResponse)
async def get_monitoring_summary(
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    metric_category: str | None = None,
    metric_name: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> SummaryResponse:
    """Lightweight summary KPIs for the monitoring dashboard.

    Returns total records, avg score, pass rate, and latency percentiles.
    When unfiltered, uses pre-computed metadata cache for instant response.
    """
    _ensure_table()
    store = get_store()

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        metric_category=metric_category,
        metric_name=metric_name,
        time_start=time_start,
        time_end=time_end,
    )

    has_filters = where != "1=1"

    # Fast path: serve from metadata cache when unfiltered
    if not has_filters:
        meta = store.get_metadata(TABLE)
        summary_stats = meta.get("summary_stats") if meta else None
        if summary_stats:
            return SummaryResponse(
                success=True,
                kpis=SummaryKPIs(
                    total_records=summary_stats.get("total_records", 0),
                    avg_score=summary_stats.get("avg_score", 0),
                    pass_rate=summary_stats.get("pass_rate", 0),
                    p50_latency=summary_stats.get("p50_latency", 0),
                    p95_latency=summary_stats.get("p95_latency", 0),
                    p99_latency=summary_stats.get("p99_latency", 0),
                ),
            )

    # Fallback: compute via SQL
    table_cols = store.get_table_columns(TABLE)
    latency_col = None
    for alias in ["latency", "latency_ms", "response_time", "duration", "duration_ms"]:
        if alias in table_cols:
            latency_col = alias
            break

    latency_select = ""
    if latency_col:
        latency_select = f""",
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.5) AS p50_lat,
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.95) AS p95_lat,
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.99) AS p99_lat"""

    sql = f"""
        SELECT
            COUNT(*) AS total_records,
            AVG(CAST(metric_score AS DOUBLE)) AS avg_score,
            COUNT(*) FILTER (WHERE CAST(metric_score AS DOUBLE) >= 0.5) * 100.0
                / NULLIF(COUNT(*), 0) AS pass_rate{latency_select}
        FROM {TABLE}
        WHERE {where} AND metric_score IS NOT NULL
    """

    def _query() -> dict[str, Any]:
        rows = store.query_list(sql, params)
        return rows[0] if rows else {}

    try:
        row = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Summary KPI error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    if not row or row.get("total_records", 0) == 0:
        return SummaryResponse(
            success=True,
            kpis=SummaryKPIs(
                total_records=0,
                avg_score=0,
                pass_rate=0,
                p50_latency=0,
                p95_latency=0,
                p99_latency=0,
            ),
        )

    return SummaryResponse(
        success=True,
        kpis=SummaryKPIs(
            total_records=int(row["total_records"]),
            avg_score=_clean_value(row.get("avg_score")) or 0.0,
            pass_rate=_clean_value(row.get("pass_rate")) or 0.0,
            p50_latency=_clean_value(row.get("p50_lat")) or 0.0,
            p95_latency=_clean_value(row.get("p95_lat")) or 0.0,
            p99_latency=_clean_value(row.get("p99_lat")) or 0.0,
        ),
    )


@router.get("/trends", response_model=TrendResponse)
async def get_monitoring_trends(
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly)$"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> TrendResponse:
    """Compute time-series trend data for monitoring metrics.

    Supports long format data (metric_name + metric_score).
    Groups by timestamp bucket and metric_name, computing avg/p50/p95/p99.
    """
    _ensure_table()
    store = get_store()

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        time_start=time_start,
        time_end=time_end,
    )

    interval = GRANULARITY_MAP.get(granularity, "day")

    # Check if data is long format (has metric_name + metric_score)
    table_cols = store.get_table_columns(TABLE)
    is_long = "metric_name" in table_cols and "metric_score" in table_cols

    if not is_long:
        # Wide format: detect score columns and pivot
        score_cols = [c for c in table_cols if c.endswith("_score") and c != "metric_score"]
        if not score_cols:
            return TrendResponse(success=True, data=[], metrics=[], granularity=granularity)

        # For wide format, compute trends per score column
        all_points: list[TrendPoint] = []
        for col in score_cols:
            sql = f"""
                SELECT
                    date_trunc('{interval}', timestamp) AS ts,
                    AVG(CAST({col} AS DOUBLE)) AS avg_val,
                    quantile_cont(CAST({col} AS DOUBLE), 0.5) AS p50,
                    quantile_cont(CAST({col} AS DOUBLE), 0.95) AS p95,
                    quantile_cont(CAST({col} AS DOUBLE), 0.99) AS p99,
                    COUNT(*) AS cnt
                FROM {TABLE}
                WHERE {where} AND {col} IS NOT NULL AND timestamp IS NOT NULL
                GROUP BY ts
                ORDER BY ts
            """

            def _wide_query(s: str = sql, p: list[Any] = params) -> list[dict[str, Any]]:
                return store.query_list(s, p)

            rows = await anyio.to_thread.run_sync(_wide_query, limiter=store.query_limiter)
            for row in rows:
                all_points.append(
                    TrendPoint(
                        timestamp=str(row["ts"]),
                        metric=col,
                        avg=_clean_value(row["avg_val"]) or 0.0,
                        p50=_clean_value(row["p50"]) or 0.0,
                        p95=_clean_value(row["p95"]) or 0.0,
                        p99=_clean_value(row["p99"]) or 0.0,
                        count=int(row["cnt"]),
                    )
                )

        return TrendResponse(
            success=True,
            data=all_points,
            metrics=score_cols,
            granularity=granularity,
        )

    # Long format query
    sql = f"""
        SELECT
            date_trunc('{interval}', timestamp) AS ts,
            metric_name,
            AVG(CAST(metric_score AS DOUBLE)) AS avg_val,
            quantile_cont(CAST(metric_score AS DOUBLE), 0.5) AS p50,
            quantile_cont(CAST(metric_score AS DOUBLE), 0.95) AS p95,
            quantile_cont(CAST(metric_score AS DOUBLE), 0.99) AS p99,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where}
          AND metric_score IS NOT NULL
          AND timestamp IS NOT NULL
        GROUP BY ts, metric_name
        ORDER BY ts
    """

    def _query() -> list[dict[str, Any]]:
        return store.query_list(sql, params)

    try:
        rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Trend analytics error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    points: list[TrendPoint] = []
    metrics_seen: set[str] = set()

    for row in rows:
        metric = str(row["metric_name"])
        metrics_seen.add(metric)
        points.append(
            TrendPoint(
                timestamp=str(row["ts"]),
                metric=metric,
                avg=_clean_value(row["avg_val"]) or 0.0,
                p50=_clean_value(row["p50"]) or 0.0,
                p95=_clean_value(row["p95"]) or 0.0,
                p99=_clean_value(row["p99"]) or 0.0,
                count=int(row["cnt"]),
            )
        )

    return TrendResponse(
        success=True,
        data=points,
        metrics=sorted(metrics_seen),
        granularity=granularity,
    )


@router.get("/latency-distribution", response_model=LatencyDistributionResponse)
async def get_latency_distribution(
    bins: int = Query(20, ge=5, le=100),
    group_by: str | None = None,
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> LatencyDistributionResponse:
    """Compute latency distribution histogram and percentiles."""
    _ensure_table()
    store = get_store()
    group_by = _validate_group_by(group_by)

    table_cols = store.get_table_columns(TABLE)
    latency_col = None
    for alias in ["latency", "latency_ms", "response_time", "duration", "duration_ms"]:
        if alias in table_cols:
            latency_col = alias
            break

    if not latency_col:
        return LatencyDistributionResponse(
            success=True,
            histogram={"counts": [], "edges": []},
            percentiles={"p50": 0, "p95": 0, "p99": 0},
            by_group=None,
        )

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        time_start=time_start,
        time_end=time_end,
    )

    # Get overall percentiles and min/max for histogram
    sql = f"""
        SELECT
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.5) AS p50,
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.95) AS p95,
            quantile_cont(CAST({latency_col} AS DOUBLE), 0.99) AS p99,
            MIN(CAST({latency_col} AS DOUBLE)) AS min_val,
            MAX(CAST({latency_col} AS DOUBLE)) AS max_val,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where} AND {latency_col} IS NOT NULL
    """

    def _query() -> dict[str, Any]:
        rows = store.query_list(sql, params)
        return rows[0] if rows else {}

    try:
        stats = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Latency distribution error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    if not stats or stats.get("cnt", 0) == 0:
        return LatencyDistributionResponse(
            success=True,
            histogram={"counts": [], "edges": []},
            percentiles={"p50": 0, "p95": 0, "p99": 0},
            by_group=None,
        )

    percentiles = {
        "p50": _clean_value(stats["p50"]) or 0.0,
        "p95": _clean_value(stats["p95"]) or 0.0,
        "p99": _clean_value(stats["p99"]) or 0.0,
    }

    # Histogram via width_bucket
    min_val = float(stats["min_val"])
    max_val = float(stats["max_val"])
    if min_val == max_val:
        max_val = min_val + 1

    bin_range = max_val - min_val
    hist_sql = f"""
        SELECT
            GREATEST(1, LEAST(?,
                CAST(FLOOR((CAST({latency_col} AS DOUBLE) - ?) / ? * ?) + 1 AS INTEGER)
            )) AS bucket,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where} AND {latency_col} IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket
    """
    hist_params = [bins, min_val, bin_range, bins, *params]

    # Build histogram edges
    bin_width = (max_val - min_val) / bins
    edges = [min_val + i * bin_width for i in range(bins + 1)]
    counts = [0] * bins

    def _hist_query() -> list[dict[str, Any]]:
        return store.query_list(hist_sql, hist_params)

    hist_rows = await anyio.to_thread.run_sync(_hist_query, limiter=store.query_limiter)
    for row in hist_rows:
        bucket = int(row["bucket"])
        if 1 <= bucket <= bins:
            counts[bucket - 1] = int(row["cnt"])

    histogram = {
        "counts": counts,
        "edges": [float(e) for e in edges],
    }

    # Group by if requested
    by_group = None
    if group_by and group_by in table_cols:
        # Per-group percentiles (GROUP BY grp only)
        pct_sql = f"""
            SELECT
                CAST({group_by} AS VARCHAR) AS grp,
                quantile_cont(CAST({latency_col} AS DOUBLE), 0.5) AS p50,
                quantile_cont(CAST({latency_col} AS DOUBLE), 0.95) AS p95,
                quantile_cont(CAST({latency_col} AS DOUBLE), 0.99) AS p99
            FROM {TABLE}
            WHERE {where} AND {latency_col} IS NOT NULL
            GROUP BY grp
        """

        def _pct_query() -> list[dict[str, Any]]:
            return store.query_list(pct_sql, params)

        # Per-group histogram counts using the same bins as overall
        grp_hist_sql = f"""
            SELECT
                CAST({group_by} AS VARCHAR) AS grp,
                GREATEST(1, LEAST(?,
                    CAST(FLOOR((CAST({latency_col} AS DOUBLE) - ?) / ? * ?) + 1 AS INTEGER)
                )) AS bucket,
                COUNT(*) AS cnt
            FROM {TABLE}
            WHERE {where} AND {latency_col} IS NOT NULL
            GROUP BY grp, bucket
            ORDER BY grp, bucket
        """
        grp_hist_params = [bins, min_val, bin_range, bins, *params]

        def _grp_hist_query() -> list[dict[str, Any]]:
            return store.query_list(grp_hist_sql, grp_hist_params)

        pct_rows, hist_group_rows = await asyncio.gather(
            anyio.to_thread.run_sync(_pct_query, limiter=store.query_limiter),
            anyio.to_thread.run_sync(_grp_hist_query, limiter=store.query_limiter),
        )

        by_group = {}
        for row in pct_rows:
            by_group[str(row["grp"])] = {
                "counts": [0] * bins,
                "percentiles": {
                    "p50": _clean_value(row["p50"]) or 0.0,
                    "p95": _clean_value(row["p95"]) or 0.0,
                    "p99": _clean_value(row["p99"]) or 0.0,
                },
            }
        for row in hist_group_rows:
            grp = str(row["grp"])
            if grp not in by_group:
                by_group[grp] = {"counts": [0] * bins, "percentiles": {}}
            bucket = int(row["bucket"])
            if 1 <= bucket <= bins:
                grp_counts = cast("list[int]", by_group[grp]["counts"])
                grp_counts[bucket - 1] = int(row["cnt"])

    return LatencyDistributionResponse(
        success=True,
        histogram=histogram,
        percentiles=percentiles,
        by_group=by_group,
    )


@router.get("/class-distribution", response_model=ClassDistributionResponse)
async def get_class_distribution(
    metric: str = Query(..., description="Metric column name"),
    group_by: str = Query(..., description="Group by column"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> ClassDistributionResponse:
    """Compute score distributions grouped by model, environment, or evaluation name."""
    _ensure_table()
    store = get_store()
    group_by = _validate_group_by(group_by) or group_by

    table_cols = store.get_table_columns(TABLE)
    if metric not in table_cols:
        raise HTTPException(400, f"Missing metric column: {metric}")
    if group_by not in table_cols:
        raise HTTPException(400, f"Missing group_by column: {group_by}")

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        time_start=time_start,
        time_end=time_end,
    )

    sql = f"""
        SELECT
            CAST({group_by} AS VARCHAR) AS grp,
            AVG(CAST({metric} AS DOUBLE)) AS mean_val,
            STDDEV_SAMP(CAST({metric} AS DOUBLE)) AS std_val,
            MIN(CAST({metric} AS DOUBLE)) AS min_val,
            MAX(CAST({metric} AS DOUBLE)) AS max_val,
            quantile_cont(CAST({metric} AS DOUBLE), 0.5) AS median_val,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where} AND {metric} IS NOT NULL
        GROUP BY grp
    """

    # Also fetch raw values per group for violin/box plots
    values_sql = f"""
        SELECT
            CAST({group_by} AS VARCHAR) AS grp,
            CAST({metric} AS DOUBLE) AS val
        FROM {TABLE}
        WHERE {where} AND {metric} IS NOT NULL
    """

    def _query() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        stats = store.query_list(sql, params)
        values = store.query_list(values_sql, params)
        return stats, values

    try:
        stats_rows, value_rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Class distribution error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    # Group values by group name
    values_by_group: dict[str, list[float]] = {}
    for row in value_rows:
        grp = str(row["grp"])
        val = _clean_value(row["val"])
        if val is not None:
            values_by_group.setdefault(grp, []).append(val)

    groups_data: list[ClassDistributionGroup] = []
    for row in stats_rows:
        grp = str(row["grp"])
        groups_data.append(
            ClassDistributionGroup(
                group=grp,
                values=values_by_group.get(grp, []),
                stats={
                    "mean": _clean_value(row["mean_val"]) or 0.0,
                    "std": _clean_value(row["std_val"]) or 0.0,
                    "min": _clean_value(row["min_val"]) or 0.0,
                    "max": _clean_value(row["max_val"]) or 0.0,
                    "median": _clean_value(row["median_val"]) or 0.0,
                    "count": int(row["cnt"]),
                },
            )
        )

    return ClassDistributionResponse(
        success=True,
        data=groups_data,
        metric=metric,
        group_by=group_by,
    )


@router.get("/metric-breakdown", response_model=MetricBreakdownResponse)
async def get_metric_breakdown(
    threshold: float = Query(0.5),
    group_by: str | None = None,
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> MetricBreakdownResponse:
    """Compute pass/fail rates and averages for each metric.

    Supports long format (metric_name + metric_score).
    """
    _ensure_table()
    store = get_store()
    group_by = _validate_group_by(group_by)

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        time_start=time_start,
        time_end=time_end,
    )

    table_cols = store.get_table_columns(TABLE)
    is_long = "metric_name" in table_cols and "metric_score" in table_cols

    if not is_long:
        # Wide format: detect score columns
        score_cols = [c for c in table_cols if c.endswith("_score") and c != "metric_score"]
        metrics_data: list[MetricBreakdownItem] = []
        for col in score_cols:
            sql = f"""
                SELECT
                    COUNT(*) FILTER (WHERE CAST({col} AS DOUBLE) >= ?) * 100.0 / NULLIF(COUNT(*), 0) AS pass_rate,
                    AVG(CAST({col} AS DOUBLE)) AS avg_val,
                    COUNT(*) AS cnt
                FROM {TABLE}
                WHERE {where} AND {col} IS NOT NULL
            """

            def _q(s: str = sql, p: tuple[Any, ...] = (threshold, *params)) -> list[dict[str, Any]]:
                return store.query_list(s, list(p))

            rows = await anyio.to_thread.run_sync(_q, limiter=store.query_limiter)
            if rows and rows[0]["cnt"] > 0:
                metrics_data.append(
                    MetricBreakdownItem(
                        name=col,
                        pass_rate=_clean_value(rows[0]["pass_rate"]) or 0.0,
                        avg=_clean_value(rows[0]["avg_val"]) or 0.0,
                        count=int(rows[0]["cnt"]),
                        by_group=None,
                    )
                )
        return MetricBreakdownResponse(success=True, metrics=metrics_data)

    # Long format
    sql = f"""
        SELECT
            metric_name,
            COUNT(*) FILTER (WHERE CAST(metric_score AS DOUBLE) >= ?) * 100.0 / NULLIF(COUNT(*), 0) AS pass_rate,
            AVG(CAST(metric_score AS DOUBLE)) AS avg_val,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where} AND metric_score IS NOT NULL
        GROUP BY metric_name
    """
    all_params = [threshold, *params]

    def _query() -> list[dict[str, Any]]:
        return store.query_list(sql, all_params)

    try:
        rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Metric breakdown error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    metrics_data = []
    for row in rows:
        by_group_data = None
        if group_by and group_by in table_cols:
            group_sql = f"""
                SELECT
                    CAST({group_by} AS VARCHAR) AS grp,
                    COUNT(*) FILTER (WHERE CAST(metric_score AS DOUBLE) >= ?) * 100.0 / NULLIF(COUNT(*), 0) AS pass_rate,
                    AVG(CAST(metric_score AS DOUBLE)) AS avg_val,
                    COUNT(*) AS cnt
                FROM {TABLE}
                WHERE {where} AND metric_score IS NOT NULL AND metric_name = ?
                GROUP BY grp
            """
            group_params = [threshold, *params, row["metric_name"]]

            def _gq(s: str = group_sql, p: list[Any] = group_params) -> list[dict[str, Any]]:
                return store.query_list(s, p)

            group_rows = await anyio.to_thread.run_sync(_gq, limiter=store.query_limiter)
            by_group_data = {
                str(gr["grp"]): {
                    "pass_rate": _clean_value(gr["pass_rate"]) or 0.0,
                    "avg": _clean_value(gr["avg_val"]) or 0.0,
                    "count": int(gr["cnt"]),
                }
                for gr in group_rows
            }

        metrics_data.append(
            MetricBreakdownItem(
                name=str(row["metric_name"]),
                pass_rate=_clean_value(row["pass_rate"]) or 0.0,
                avg=_clean_value(row["avg_val"]) or 0.0,
                count=int(row["cnt"]),
                by_group=by_group_data,
            )
        )

    return MetricBreakdownResponse(success=True, metrics=metrics_data)


@router.get("/correlation", response_model=CorrelationResponse)
async def get_metric_correlation(
    metrics: str = Query(..., description="Comma-separated metric names"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> CorrelationResponse:
    """Compute correlation matrix between metrics."""
    _ensure_table()
    store = get_store()

    metric_list = [m.strip() for m in metrics.split(",") if m.strip()]
    if len(metric_list) < 2:
        return CorrelationResponse(success=True, matrix=[], metrics=metric_list)

    table_cols = store.get_table_columns(TABLE)
    valid_metrics = [m for m in metric_list if m in table_cols]
    if len(valid_metrics) < 2:
        return CorrelationResponse(success=True, matrix=[], metrics=valid_metrics)

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        time_start=time_start,
        time_end=time_end,
    )

    # Build correlation pairs using corr()
    n = len(valid_metrics)
    matrix = [[0.0] * n for _ in range(n)]

    # Fetch all relevant data and compute correlation in DuckDB
    select_cols = ", ".join(f"CAST({m} AS DOUBLE) AS {m}" for m in valid_metrics)
    sql = f"SELECT {select_cols} FROM {TABLE} WHERE {where}"

    def _query() -> list[list[float]]:
        df = store.query_df(sql, params)
        corr = df.corr()
        result = []
        for i in range(n):
            row = []
            for j in range(n):
                val = corr.iloc[i, j]
                row.append(_clean_value(val) or 0.0)
            result.append(row)
        return result

    try:
        matrix = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Correlation error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    return CorrelationResponse(success=True, matrix=matrix, metrics=valid_metrics)


# ============================================
# Classification Metric Endpoints
# ============================================


@router.get("/classification-breakdown", response_model=ClassificationBreakdownResponse)
async def get_classification_breakdown(
    metric_name: str | None = None,
    group_by: str | None = None,
    category_source: str = Query("explanation"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> ClassificationBreakdownResponse:
    """Get value counts for CLASSIFICATION metrics."""
    _ensure_table()
    store = get_store()

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        metric_category="CLASSIFICATION",
        metric_name=metric_name,
        time_start=time_start,
        time_end=time_end,
    )

    table_cols = store.get_table_columns(TABLE)

    # Determine category column
    if category_source in table_cols:
        cat_col = category_source
    elif "actual_output" in table_cols:
        cat_col = "actual_output"
    elif "metric_score" in table_cols:
        cat_col = "metric_score"
    else:
        return ClassificationBreakdownResponse(success=True, metrics=[])

    # Get metric names
    if metric_name:
        metric_names = [metric_name]
    else:
        names_sql = f"""
            SELECT DISTINCT metric_name FROM {TABLE}
            WHERE {where} AND metric_name IS NOT NULL
        """

        def _names_q() -> list[str]:
            return [r["metric_name"] for r in store.query_list(names_sql, params)]

        metric_names = await anyio.to_thread.run_sync(_names_q, limiter=store.query_limiter)

    metrics_data: list[ClassificationBreakdownItem] = []

    for mn in metric_names:
        where_m, params_m = _build_where(
            environment=environment,
            source_name=source_name,
            source_component=source_component,
            source_type=source_type,
            metric_category="CLASSIFICATION",
            metric_name=mn,
            time_start=time_start,
            time_end=time_end,
        )

        sql = f"""
            SELECT
                CAST({cat_col} AS VARCHAR) AS category_value,
                COUNT(*) AS cnt
            FROM {TABLE}
            WHERE {where_m} AND {cat_col} IS NOT NULL
            GROUP BY category_value
            ORDER BY cnt DESC
        """

        def _q(s: str = sql, p: list[Any] = params_m) -> list[dict[str, Any]]:
            return store.query_list(s, p)

        rows = await anyio.to_thread.run_sync(_q, limiter=store.query_limiter)

        total = sum(r["cnt"] for r in rows)
        if total == 0:
            continue

        categories = [
            CategoryCount(
                value=str(r["category_value"]),
                count=int(r["cnt"]),
                percentage=round((r["cnt"] / total) * 100, 1),
            )
            for r in rows
        ]

        metrics_data.append(
            ClassificationBreakdownItem(
                metric_name=mn,
                categories=categories,
                total_count=total,
            )
        )

    return ClassificationBreakdownResponse(success=True, metrics=metrics_data)


@router.get("/classification-trends", response_model=ClassificationTrendResponse)
async def get_classification_trends(
    metric_name: str = Query(...),
    granularity: str = Query("daily", pattern="^(hourly|daily|weekly)$"),
    category_source: str = Query("explanation"),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> ClassificationTrendResponse:
    """Get time-series trends for CLASSIFICATION metrics."""
    _ensure_table()
    store = get_store()

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        metric_category="CLASSIFICATION",
        metric_name=metric_name,
        time_start=time_start,
        time_end=time_end,
    )

    table_cols = store.get_table_columns(TABLE)
    interval = GRANULARITY_MAP.get(granularity, "day")

    if category_source in table_cols:
        cat_col = category_source
    elif "actual_output" in table_cols:
        cat_col = "actual_output"
    else:
        cat_col = "metric_score"

    sql = f"""
        SELECT
            date_trunc('{interval}', timestamp) AS ts,
            CAST({cat_col} AS VARCHAR) AS category_value,
            COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where} AND timestamp IS NOT NULL AND {cat_col} IS NOT NULL
        GROUP BY ts, category_value
        ORDER BY ts
    """

    def _query() -> list[dict[str, Any]]:
        return store.query_list(sql, params)

    try:
        rows = await anyio.to_thread.run_sync(_query, limiter=store.query_limiter)
    except Exception as e:
        logger.exception("Classification trends error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    # Group by timestamp
    points_map: dict[str, dict[str, int]] = {}
    unique_cats: set[str] = set()

    for row in rows:
        ts = str(row["ts"])
        cat = str(row["category_value"])
        unique_cats.add(cat)
        if ts not in points_map:
            points_map[ts] = {}
        points_map[ts][cat] = int(row["cnt"])

    trend_points = [
        ClassificationTrendPoint(timestamp=ts, categories=cats)
        for ts, cats in sorted(points_map.items())
    ]

    return ClassificationTrendResponse(
        success=True,
        data=trend_points,
        metric_name=metric_name,
        granularity=granularity,
        unique_categories=sorted(unique_cats),
    )


# ============================================
# Analysis Metric Endpoints
# ============================================


@router.get("/analysis-insights", response_model=AnalysisInsightsResponse)
async def get_analysis_insights(
    metric_name: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    environment: str | None = None,
    source_name: str | None = None,
    source_component: str | None = None,
    source_type: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> AnalysisInsightsResponse:
    """Get records with ANALYSIS metrics including their signals field."""
    _ensure_table()
    store = get_store()

    where, params = _build_where(
        environment=environment,
        source_name=source_name,
        source_component=source_component,
        source_type=source_type,
        metric_category="ANALYSIS",
        metric_name=metric_name,
        time_start=time_start,
        time_end=time_end,
    )

    # Count total
    count_sql = f"SELECT COUNT(*) FROM {TABLE} WHERE {where}"

    # Get metric names
    names_sql = f"""
        SELECT DISTINCT metric_name FROM {TABLE}
        WHERE {where} AND metric_name IS NOT NULL
    """

    # Data query
    offset = (page - 1) * limit
    data_sql = f"""
        SELECT * FROM {TABLE}
        WHERE {where}
        ORDER BY timestamp DESC NULLS LAST
        LIMIT ? OFFSET ?
    """
    data_params = [*params, limit, offset]

    def _query() -> tuple[int, list[str], list[dict[str, Any]]]:
        total = store.query_value(count_sql, params) or 0
        names = [r["metric_name"] for r in store.query_list(names_sql, params)]
        rows = store.query_list(data_sql, data_params)
        return total, names, rows

    try:
        total_count, metric_names, rows = await anyio.to_thread.run_sync(
            _query, limiter=store.query_limiter
        )
    except Exception as e:
        logger.exception("Analysis insights error")
        raise HTTPException(500, f"Analytics error: {e!s}")

    records: list[AnalysisRecordItem] = []
    for row in rows:
        # Parse signals
        signals = row.get("signals")
        if isinstance(signals, str):
            with contextlib.suppress(json.JSONDecodeError, ValueError):
                signals = json.loads(signals)

        timestamp = row.get("timestamp")
        if timestamp is not None:
            timestamp = str(timestamp)

        records.append(
            AnalysisRecordItem(
                dataset_id=str(row.get("dataset_id", "")),
                timestamp=timestamp,
                metric_name=str(row.get("metric_name", "")),
                query=_str_or_none(row, "query"),
                actual_output=_str_or_none(row, "actual_output"),
                signals=signals,
                explanation=_str_or_none(row, "explanation"),
                source_info={
                    "environment": _str_or_none(row, "environment"),
                    "source_name": _str_or_none(row, "source_name"),
                    "source_component": _str_or_none(row, "source_component"),
                },
            )
        )

    return AnalysisInsightsResponse(
        success=True,
        records=records,
        total_count=total_count,
        page=page,
        limit=limit,
        metric_names=metric_names,
    )
