import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile

from app.plugins.memory.config import memory_config
from app.plugins.memory.models.memory_schemas import (
    BatchesResponse,
    ConflictsResponse,
    HardStopsResponse,
    MemoryUploadResponse,
    QualityResponse,
    RuleCreateRequest,
    RuleDeleteResponse,
    RulesResponse,
    RuleUpdateRequest,
    RuleUpdateResponse,
    SoftThresholdsResponse,
    StatusCountsResponse,
    SummaryResponse,
)
from app.plugins.memory.services import memory_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_memory_config_response() -> dict[str, Any]:
    """Build the memory config response dict (shared with deprecation proxy)."""
    result = memory_config.to_api_dict()
    result["config_hash"] = memory_config.config_hash
    return result


@router.get("/config")
async def get_memory_config() -> dict[str, Any]:
    """Get the memory module configuration.

    Returns field role mappings, filter config, labels, quality values,
    action colors, contradictory pairs, and a config hash for cache invalidation.
    """
    return _build_memory_config_response()


@router.get("/summary", response_model=SummaryResponse)
async def get_summary() -> SummaryResponse:
    """Aggregate summary: counts, action distribution, product distribution."""
    try:
        return SummaryResponse(**memory_service.get_summary())
    except Exception:
        logger.exception("Error fetching memory summary")
        raise HTTPException(status_code=500, detail="Failed to fetch summary")


@router.get("/rules", response_model=RulesResponse)
async def get_rules(request: Request) -> RulesResponse:
    """Filterable list of all extracted rules.

    Allowed query params are determined by config.filter_roles + 'batch'.
    Unknown params are ignored with a debug log.
    """
    try:
        allowed = set(memory_config.filter_roles) | {"batch"}
        filters: dict[str, str] = {}
        for k, v in request.query_params.items():
            if k in allowed:
                filters[k] = v
            else:
                logger.debug("Ignoring unknown filter param: %s", k)
        return RulesResponse(**memory_service.get_all_rules(filters))
    except Exception:
        logger.exception("Error fetching rules")
        raise HTTPException(status_code=500, detail="Failed to fetch rules")


@router.get("/rules/quality", response_model=QualityResponse)
async def get_decision_quality() -> QualityResponse:
    """Split rules by decision quality: aligned, divergent, partial."""
    try:
        return QualityResponse(**memory_service.get_decision_quality())
    except Exception:
        logger.exception("Error fetching decision quality")
        raise HTTPException(status_code=500, detail="Failed to fetch decision quality")


@router.get("/rules/soft-thresholds", response_model=SoftThresholdsResponse)
async def get_soft_thresholds() -> SoftThresholdsResponse:
    """Rules with soft thresholds."""
    try:
        return SoftThresholdsResponse(**memory_service.get_soft_thresholds())
    except Exception:
        logger.exception("Error fetching soft thresholds")
        raise HTTPException(status_code=500, detail="Failed to fetch soft thresholds")


@router.get("/hard-stops", response_model=HardStopsResponse)
async def get_hard_stops() -> HardStopsResponse:
    """Unmitigated decline rules (hard stops)."""
    try:
        return HardStopsResponse(**memory_service.get_hard_stops())
    except Exception:
        logger.exception("Error fetching hard stops")
        raise HTTPException(status_code=500, detail="Failed to fetch hard stops")


@router.get("/batches", response_model=BatchesResponse)
async def get_batches() -> BatchesResponse:
    """Pipeline batch history."""
    try:
        return BatchesResponse(**memory_service.get_batches())
    except Exception:
        logger.exception("Error fetching batches")
        raise HTTPException(status_code=500, detail="Failed to fetch batches")


@router.get("/trace")
async def get_trace(rule_id: str = Query(...)) -> dict[str, Any]:
    """Decision trace path for a single rule."""
    try:
        result = memory_service.get_trace(rule_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching trace for rule %s", rule_id)
        raise HTTPException(status_code=500, detail="Failed to fetch trace")


@router.get("/conflicts", response_model=ConflictsResponse)
async def get_conflicts() -> ConflictsResponse:
    """Detect contradictory actions within the same risk factor."""
    try:
        return ConflictsResponse(**memory_service.get_conflicts())
    except Exception:
        logger.exception("Error fetching conflicts")
        raise HTTPException(status_code=500, detail="Failed to fetch conflicts")


@router.get("/status-counts", response_model=StatusCountsResponse)
async def get_status_counts() -> StatusCountsResponse:
    """Count rules by ingestion status."""
    try:
        return StatusCountsResponse(**memory_service.get_status_counts())
    except Exception:
        logger.exception("Error fetching status counts")
        raise HTTPException(status_code=500, detail="Failed to fetch status counts")


@router.post("/upload", response_model=MemoryUploadResponse)
async def upload_memory_file(file: UploadFile = File(...)) -> MemoryUploadResponse:
    """Upload a CSV file containing rule extractions."""
    try:
        content = await file.read()
        csv_text = content.decode("utf-8")
        result = memory_service.process_uploaded_csv(csv_text)
        return MemoryUploadResponse(**result)
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded CSV")
    except Exception:
        logger.exception("Error processing memory upload")
        raise HTTPException(status_code=500, detail="Failed to process uploaded file")


@router.post("/rules", response_model=RuleUpdateResponse)
async def create_rule(body: RuleCreateRequest) -> RuleUpdateResponse:
    """Create a new rule (mock — writes to in-memory cache only)."""
    try:
        data = body.model_dump(exclude_none=True)
        result = memory_service.create_rule(data)
        return RuleUpdateResponse(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Error creating rule")
        raise HTTPException(status_code=500, detail="Failed to create rule")


@router.delete("/rules/{rule_id}", response_model=RuleDeleteResponse)
async def delete_rule(rule_id: str) -> RuleDeleteResponse:
    """Delete a rule (mock — removes from in-memory cache only)."""
    try:
        success = memory_service.delete_rule(rule_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        return RuleDeleteResponse(success=True, id=rule_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error deleting rule %s", rule_id)
        raise HTTPException(status_code=500, detail="Failed to delete rule")


@router.put("/rules/{rule_id}", response_model=RuleUpdateResponse)
async def update_rule(rule_id: str, body: RuleUpdateRequest) -> RuleUpdateResponse:
    """Update an extracted rule (mock — writes to in-memory cache only)."""
    try:
        updates = body.model_dump(exclude_none=True)
        result = memory_service.update_rule(rule_id, updates)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        return RuleUpdateResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating rule %s", rule_id)
        raise HTTPException(status_code=500, detail="Failed to update rule")
