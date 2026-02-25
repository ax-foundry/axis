import logging

import anyio
from fastapi import APIRouter, Query

from app.models.kpi_schemas import KpiCategoriesResponse, KpiFiltersResponse, KpiTrendsResponse
from app.services.duckdb_store import get_store
from app.services.kpi_service import get_kpi_categories, get_kpi_filters, get_kpi_trends

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/categories", response_model=KpiCategoriesResponse)
async def kpi_categories(
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
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
            segment=segment,
            time_start=time_start,
            time_end=time_end,
        ),
        limiter=store.query_limiter,
    )


@router.get("/filters", response_model=KpiFiltersResponse)
async def kpi_filters() -> KpiFiltersResponse:
    """Available filter values for dropdowns."""
    store = get_store()
    return await anyio.to_thread.run_sync(
        lambda: get_kpi_filters(store),
        limiter=store.query_limiter,
    )
