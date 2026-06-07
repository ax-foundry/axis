import logging

import anyio
from fastapi import APIRouter, Query

from app.models.kpi_schemas import (
    KpiCaseProfileResponse,
    KpiCategoriesResponse,
    KpiDistributionResponse,
    KpiDrillDownResponse,
    KpiFiltersResponse,
    KpiSankeyResponse,
    KpiSegmentComparisonResponse,
    KpiTrendsResponse,
)
from app.services.duckdb_store import get_store
from app.services.kpi_service import (
    get_kpi_case_profile,
    get_kpi_categories,
    get_kpi_distribution,
    get_kpi_drill_down,
    get_kpi_filters,
    get_kpi_sankey,
    get_kpi_segment_comparison,
    get_kpi_trends,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/categories", response_model=KpiCategoriesResponse)
async def kpi_categories(
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiCategoriesResponse:
    """Category panels with KPI cards, sparklines, and trend directions."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_categories(
            store,
            source_name=source_name,
            kpi_category=kpi_category,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/trends", response_model=KpiTrendsResponse)
async def kpi_trends(
    kpi_names: str | None = Query(None, description="Comma-separated KPI names"),
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiTrendsResponse:
    """Trend data for expanded category panels (lazy-loaded)."""
    store = get_store()
    names = [n.strip() for n in kpi_names.split(",") if n.strip()] if kpi_names else None
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_trends(
            store,
            kpi_names=names,
            source_name=source_name,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/filters", response_model=KpiFiltersResponse)
async def kpi_filters(
    source_component: str | None = None,
    source_name: str | None = None,
) -> KpiFiltersResponse:
    """Available filter values for dropdowns."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_filters(store, source_component=source_component, source_name=source_name),
        limiter=store.query_limiter,
    )


@router.get("/sankey", response_model=KpiSankeyResponse)
async def kpi_sankey(
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiSankeyResponse:
    """Sankey flow diagrams for decision flow KPIs."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_sankey(
            store,
            source_name=source_name,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/drill-down", response_model=KpiDrillDownResponse)
async def kpi_drill_down(
    kpi_name: str = Query(..., description="KPI name to drill down into"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    date_filter: str | None = Query(None, description="Single day YYYY-MM-DD"),
    value_min: float | None = Query(None, description="Min numeric_value (inclusive)"),
    value_max: float | None = Query(None, description="Max numeric_value (exclusive)"),
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiDrillDownResponse:
    """Paginated case-level rows for a single KPI."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_drill_down(
            store,
            kpi_name=kpi_name,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_dir=sort_dir,
            date_filter=date_filter,
            value_min=value_min,
            value_max=value_max,
            source_name=source_name,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/case-profile", response_model=KpiCaseProfileResponse)
async def kpi_case_profile(
    dataset_id: str = Query(..., description="Case dataset ID"),
    source_name: str | None = None,
) -> KpiCaseProfileResponse:
    """All KPI values for a single case."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_case_profile(
            store,
            dataset_id=dataset_id,
            source_name=source_name,
        ),
        limiter=store.query_limiter,
    )


@router.get("/distribution", response_model=KpiDistributionResponse)
async def kpi_distribution(
    kpi_name: str = Query(..., description="KPI name"),
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiDistributionResponse:
    """Histogram and percentiles for a single KPI's value distribution."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_distribution(
            store,
            kpi_name=kpi_name,
            source_name=source_name,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/segment-comparison", response_model=KpiSegmentComparisonResponse)
async def kpi_segment_comparison(
    kpi_name: str = Query(..., description="KPI name"),
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiSegmentComparisonResponse:
    """Per-segment aggregated values for a single KPI."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_segment_comparison(
            store,
            kpi_name=kpi_name,
            source_name=source_name,
            environment=environment,
            source_type=source_type,
            source_component=source_component,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )
