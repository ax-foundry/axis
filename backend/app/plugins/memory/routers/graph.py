import logging

from fastapi import APIRouter, HTTPException, Query

from app.plugins.memory.models.graph_schemas import (
    GraphNeighborhoodResponse,
    GraphResponse,
    GraphSearchResponse,
    GraphStatusResponse,
    GraphSummaryResponse,
)
from app.plugins.memory.services import graph_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/status", response_model=GraphStatusResponse)
async def get_status() -> GraphStatusResponse:
    """Check FalkorDB connection health."""
    result = graph_service.check_connection()
    return GraphStatusResponse(success=True, **result)


@router.get("/summary", response_model=GraphSummaryResponse)
async def get_summary() -> GraphSummaryResponse:
    """Get graph summary statistics (node/edge counts, rules by action/product)."""
    try:
        summary = graph_service.get_summary()
        return GraphSummaryResponse(success=True, **summary)
    except Exception as e:
        logger.exception("Failed to get graph summary")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=GraphResponse)
async def get_graph(
    limit: int = Query(default=500, le=2000),
    risk_factor: str | None = Query(default=None),
    product_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    node_type: str | None = Query(default=None),
) -> GraphResponse:
    """Fetch the full graph or a filtered subset.

    Optional filters:
    - risk_factor: show subgraph connected to this risk factor
    - product_type: filter rules by product type
    - action: filter rules by action (decline, refer, etc.)
    - node_type: filter to only show nodes of this type
    """
    try:
        data = graph_service.get_full_graph(
            limit=limit,
            risk_factor=risk_factor,
            product_type=product_type,
            action=action,
            node_type=node_type,
        )
        return GraphResponse(success=True, data=data)
    except Exception as e:
        logger.exception("Failed to get graph data")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search", response_model=GraphSearchResponse)
async def search_graph(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, le=100),
) -> GraphSearchResponse:
    """Search nodes by name (case-insensitive substring match)."""
    try:
        results = graph_service.search_nodes(q, limit=limit)
        return GraphSearchResponse(
            success=True,
            results=results,
            query=q,
            total=len(results),
        )
    except Exception as e:
        logger.exception("Graph search failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/neighborhood", response_model=GraphNeighborhoodResponse)
async def get_neighborhood(
    node_id: str = Query(...),
    depth: int = Query(default=1, ge=1, le=3),
) -> GraphNeighborhoodResponse:
    """Get the neighborhood subgraph around a specific node.

    Parameters:
    - node_id: Node ID in format "Label:slug" (e.g. "Rule:high_risk_decline")
    - depth: Number of hops (1-3)
    """
    try:
        result = graph_service.get_neighborhood(node_id, depth=depth)
        return GraphNeighborhoodResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to get neighborhood")
        raise HTTPException(status_code=500, detail=str(e))
