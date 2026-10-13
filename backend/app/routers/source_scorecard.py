"""Generic, bounded source scorecard endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import anyio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config.source_scorecards import (
    SourceMetricSpec,
    SourceScorecardSpec,
    get_source_scorecards,
)
from app.services.duckdb_store import get_store

router = APIRouter()

View = Literal["overview", "flow", "quality", "reliability"]
_IDENTITY_METADATA = {
    "version_column": "definition_version",
    "unit_column": "unit",
    "availability_column": "availability",
    "availability_reason_column": "availability_reason",
    "cohort_column": "cohort",
    "observation_window_column": "observation_window",
    "comparison_window_column": "comparison_window",
    "source_watermark_column": "source_watermark",
    "instrumentation_horizon_column": "instrumentation_horizon",
}
_ADDITIVE_METADATA = {
    "numerator_column": "numerator",
    "denominator_column": "denominator",
    "sample_size_column": "sample_size",
}


class SourceScorecardRequest(BaseModel):
    """Bounded request with only configured equality filters."""

    lookback_days: int = Field(default=30, ge=1, le=365)
    comparison_days: int | None = Field(default=None, ge=1, le=365)
    filters: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class ContributorRequest(SourceScorecardRequest):
    """Bounded drill-down request for one configured metric."""

    metric_key: str
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=50, ge=1, le=100)


def _config(name: str) -> SourceScorecardSpec:
    """Return one named source scorecard configuration."""
    spec = get_source_scorecards().source_scorecards.get(name)
    if spec is None:
        raise HTTPException(status_code=404, detail={"code": "source_scorecard_not_found"})
    return spec


def _columns(table: str) -> set[str]:
    """Return an explicitly configured table's live column set."""
    store = get_store()
    columns = store.get_table_columns(table)
    if not columns:
        raise HTTPException(status_code=503, detail={"code": "dataset_warming", "table": table})
    return columns


def _column(name: str, columns: set[str], table: str) -> str:
    """Quote one configured identifier after checking the live schema."""
    if name not in columns:
        raise HTTPException(
            status_code=400,
            detail={"code": "source_scorecard_config_error", "column": name, "table": table},
        )
    return f'"{name}"'


def _metrics(spec: SourceScorecardSpec, view: View) -> list[SourceMetricSpec]:
    """Return only metrics explicitly configured for the requested view."""
    result = [metric for metric in spec.metrics if view in metric.sections]
    if not result:
        raise HTTPException(status_code=400, detail={"code": "unconfigured_view", "view": view})
    return result


def _where(
    spec: SourceScorecardSpec,
    table: str,
    columns: set[str],
    request: SourceScorecardRequest,
    keys: list[str],
    *,
    end: datetime,
    window_days: int,
) -> tuple[str, list[Any]]:
    """Build parameterized filtering shared by aggregate and contributor queries."""
    invalid = set(request.filters) - set(spec.filter_dimensions)
    if invalid:
        raise HTTPException(
            status_code=400, detail={"code": "unconfigured_filter", "filters": sorted(invalid)}
        )
    timestamp = _column(spec.timestamp_column, columns, table)
    clauses = [
        f"{_column(spec.metric_key_column, columns, table)} IN ({', '.join('?' for _ in keys)})",
        f"{timestamp} >= ? AND {timestamp} < ?",
    ]
    params: list[Any] = [*keys, end - timedelta(days=window_days), end]
    for key, value in request.filters.items():
        clauses.append(f"{_column(key, columns, table)} IS NOT DISTINCT FROM ?")
        params.append(value)
    return " AND ".join(clauses), params


async def _query(sql: str, params: list[Any]) -> list[dict[str, Any]]:
    """Execute a bounded DuckDB query without exposing database details."""
    store = get_store()
    try:
        return await anyio.to_thread.run_sync(
            lambda: store.query_list_interruptible(sql, params, 10), limiter=store.query_limiter
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail={"code": "source_scorecard_query_error"}
        ) from exc


def _metadata_select(spec: SourceScorecardSpec, columns: set[str], table: str) -> str:
    """Select result identities and consistently aggregate their additive fields."""
    identities = [
        f"{_column(getattr(spec, field), columns, table)} AS {alias}"
        for field, alias in _IDENTITY_METADATA.items()
    ]
    additive = [
        f"SUM({_column(getattr(spec, field), columns, table)}) AS {alias}"
        for field, alias in _ADDITIVE_METADATA.items()
    ]
    return ", ".join([*identities, *additive])


def _metadata_group_by(spec: SourceScorecardSpec, columns: set[str], table: str) -> str:
    """Return the fixed result-contract identity used for aggregate grouping."""
    return ", ".join(_column(getattr(spec, field), columns, table) for field in _IDENTITY_METADATA)


@router.post("/{name}/{view}")
async def view(name: str, view: View, request: SourceScorecardRequest) -> dict[str, Any]:
    """Return aggregate rows for one of the configured four views."""
    spec = _config(name)
    selected = _metrics(spec, view)
    by_table: dict[str, list[SourceMetricSpec]] = {}
    for metric in selected:
        by_table.setdefault(metric.table, []).append(metric)
    now = datetime.now(UTC)
    current_start = now - timedelta(days=request.lookback_days)
    rows: list[dict[str, Any]] = []
    comparisons: dict[str, float | None] = {}
    for table, metrics in by_table.items():
        columns = _columns(table)
        keys = [metric.key for metric in metrics]
        key = _column(spec.metric_key_column, columns, table)
        value = f"AVG(CAST({_column(spec.value_column, columns, table)} AS DOUBLE)) AS value"
        where, params = _where(
            spec, table, columns, request, keys, end=now, window_days=request.lookback_days
        )
        sql = f'''SELECT {key} AS metric_key, {value},
                          {_metadata_select(spec, columns, table)}
                   FROM "{table}" WHERE {where}
                   GROUP BY {key}, {_metadata_group_by(spec, columns, table)}'''
        rows.extend(await _query(sql, params))
        if request.comparison_days:
            where, params = _where(
                spec,
                table,
                columns,
                request,
                keys,
                end=current_start,
                window_days=request.comparison_days,
            )
            sql = f'''SELECT {key} AS metric_key, {value}
                      FROM "{table}" WHERE {where} GROUP BY {key}'''
            comparisons.update(
                {row["metric_key"]: row["value"] for row in await _query(sql, params)}
            )
    labels = {metric.key: metric.label for metric in selected}
    for row in rows:
        row["label"] = labels[row["metric_key"]]
        row["status"] = row["availability"] or "unavailable"
        row["comparison_value"] = comparisons.get(row["metric_key"])
    return {"view": view, "rows": rows, "row_count": len(rows)}


@router.post("/{name}/{view}/contributors")
async def contributors(name: str, view: View, request: ContributorRequest) -> dict[str, Any]:
    """Return exact stable contributor IDs and only configured detail fields."""
    spec = _config(name)
    metric = {item.key: item for item in _metrics(spec, view)}.get(request.metric_key)
    if metric is None:
        raise HTTPException(status_code=400, detail={"code": "unconfigured_metric"})
    columns = _columns(metric.table)
    projection = list(
        dict.fromkeys([spec.contributor_id_column, spec.value_column, *spec.detail_columns])
    )
    select = ", ".join(_column(column, columns, metric.table) for column in projection)
    where, params = _where(
        spec,
        metric.table,
        columns,
        request,
        [metric.key],
        end=datetime.now(UTC),
        window_days=request.lookback_days,
    )
    sql = f'''SELECT {select} FROM "{metric.table}" WHERE {where}
              ORDER BY {_column(spec.timestamp_column, columns, metric.table)} DESC,
                       {_column(spec.contributor_id_column, columns, metric.table)}
              LIMIT ? OFFSET ?'''
    rows = await _query(sql, [*params, request.page_size, (request.page - 1) * request.page_size])
    return {"rows": rows, "page": request.page, "page_size": request.page_size}
