from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.plugins.agent_replay.models.replay_schemas import (
    ObservationNodeResponse,
    RecentTracesResponse,
    ReplayStatusResponse,
    StepSummary,
    TraceDetailResponse,
)
from app.plugins.agent_replay.models.review_schemas import (
    DatasetListResponse,
    ReviewCreateRequest,
    ReviewResponse,
    TraceReviewsResponse,
)
from app.plugins.agent_replay.services import replay_service, review_service
from app.plugins.agent_replay.services.search_db import (
    SearchDBNotConfiguredError,
    SearchDBQueryError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_enabled() -> None:
    if not settings.agent_replay_enabled:
        raise HTTPException(
            status_code=403,
            detail="Agent Replay is disabled. Set AGENT_REPLAY_ENABLED=true to enable.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/status", response_model=ReplayStatusResponse)
async def get_status() -> ReplayStatusResponse:
    return replay_service.get_status()


@router.get("/agents")
async def get_agents() -> dict[str, list[str]]:
    return {"agents": replay_service.get_configured_agents()}


@router.get("/search", response_model=RecentTracesResponse)
async def search_traces(
    query: str = Query(..., min_length=1, description="Trace ID or metadata search value"),
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
    limit: int = Query(default=10, ge=1, le=100),
    days_back: int = Query(default=30, ge=1, le=90),
    search_by: str = Query(
        default="trace_id", description="Search mode: trace_id or a configured column name"
    ),
) -> RecentTracesResponse:
    _check_enabled()
    try:
        return await replay_service.search_traces(
            query=query,
            agent_name=agent,
            limit=limit,
            days_back=days_back,
            search_by=search_by,
        )
    except SearchDBNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except SearchDBQueryError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error searching traces")
        raise HTTPException(status_code=500, detail=f"Failed to search traces: {e}")


@router.get("/traces", response_model=RecentTracesResponse)
async def list_traces(
    limit: int = Query(default=20, ge=1, le=100),
    days_back: int = Query(default=7, ge=1, le=90),
    name: str | None = Query(default=None),
    tags: str | None = Query(default=None, description="Comma-separated tags"),
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> RecentTracesResponse:
    _check_enabled()
    try:
        tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
        return await replay_service.get_recent_traces(
            limit=limit,
            days_back=days_back,
            name=name,
            tags=tags_list,
            agent_name=agent,
        )
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching recent traces")
        raise HTTPException(status_code=500, detail=f"Failed to fetch traces: {e}")


@router.get("/traces/{trace_id}", response_model=TraceDetailResponse)
async def get_trace_detail(
    trace_id: str,
    max_chars: int = Query(default=50000, ge=1, le=200000),
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> TraceDetailResponse:
    _check_enabled()
    try:
        return await replay_service.get_trace_detail(
            trace_id=trace_id,
            max_chars=max_chars,
            agent_name=agent,
        )
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except replay_service.ReplayServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching trace detail")
        raise HTTPException(status_code=500, detail=f"Failed to fetch trace: {e}")


@router.get("/traces/{trace_id}/nodes/{node_id}", response_model=ObservationNodeResponse)
async def get_node_detail(
    trace_id: str,
    node_id: str,
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> ObservationNodeResponse:
    _check_enabled()
    try:
        return await replay_service.get_node_detail(
            trace_id=trace_id,
            node_id=node_id,
            agent_name=agent,
        )
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except replay_service.NodeNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except replay_service.ReplayServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching node detail")
        raise HTTPException(status_code=500, detail=f"Failed to fetch node: {e}")


@router.get("/traces/{trace_id}/steps/{index}", response_model=StepSummary)
async def get_step_detail(
    trace_id: str,
    index: int,
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> StepSummary:
    _check_enabled()
    try:
        return await replay_service.get_step_detail(
            trace_id=trace_id,
            step_index=index,
            agent_name=agent,
        )
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except replay_service.StepNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except replay_service.ReplayServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching step detail")
        raise HTTPException(status_code=500, detail=f"Failed to fetch step: {e}")


# ---------------------------------------------------------------------------
# Review endpoints
# ---------------------------------------------------------------------------


@router.post("/reviews", response_model=ReviewResponse)
async def create_review(request: ReviewCreateRequest) -> ReviewResponse:
    _check_enabled()
    try:
        return await review_service.save_review(request)
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error saving review")
        raise HTTPException(status_code=500, detail=f"Failed to save review: {e}")


@router.get("/traces/{trace_id}/reviews", response_model=TraceReviewsResponse)
async def get_trace_reviews(
    trace_id: str,
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> TraceReviewsResponse:
    _check_enabled()
    try:
        return await review_service.get_trace_reviews(trace_id, agent)
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error fetching trace reviews")
        raise HTTPException(status_code=500, detail=f"Failed to fetch reviews: {e}")


@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets(
    agent: str | None = Query(default=None, description="Agent name for per-agent credentials"),
) -> DatasetListResponse:
    _check_enabled()
    try:
        return await review_service.list_datasets(agent)
    except replay_service.LangfuseNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Error listing datasets")
        raise HTTPException(status_code=500, detail=f"Failed to list datasets: {e}")
