from typing import Any

from pydantic import BaseModel, ConfigDict


class RuleRecord(BaseModel):
    """A single extracted rule. Only `id` is typed; all other role-keyed fields are extras."""

    model_config = ConfigDict(extra="allow")

    id: str


class ActionCount(BaseModel):
    """Count of rules per action type."""

    action: str
    count: int
    color: str


class ProductCount(BaseModel):
    """Count of rules per product type."""

    product: str
    count: int


class SummaryResponse(BaseModel):
    """Summary statistics for the rule memory."""

    rules_count: int
    risk_factors_count: int
    mitigants_count: int
    hard_stops_count: int
    rules_by_action: list[ActionCount]
    rules_by_product: list[ProductCount]


class RulesResponse(BaseModel):
    """Paginated list of rules with available filters."""

    data: list[RuleRecord]
    total: int
    filters_available: dict[str, list[str]]


class QualityResponse(BaseModel):
    """Decision quality breakdown into aligned, divergent, and partial."""

    aligned: list[RuleRecord]
    divergent: list[RuleRecord]
    partial: list[RuleRecord]


class SoftThresholdsResponse(BaseModel):
    """Rules with soft thresholds."""

    data: list[RuleRecord]


class HardStopsResponse(BaseModel):
    """Rules classified as hard stops."""

    data: list[RuleRecord]


class BatchInfo(BaseModel):
    """Metadata for a single extraction batch."""

    batch_id: str
    rules_count: int
    created_at: str
    statuses: dict[str, int]
    risk_categories: list[str]


class BatchesResponse(BaseModel):
    """List of extraction batches."""

    data: list[BatchInfo]


class TraceResponse(BaseModel):
    """Trace detail for a single rule — all fields are dynamic."""

    model_config = ConfigDict(extra="allow")


class ConflictInfo(BaseModel):
    """Information about conflicting rules for a risk factor."""

    risk_factor: str
    conflicting_rules: list[dict[str, str]]
    description: str


class ConflictsResponse(BaseModel):
    """Response containing detected rule conflicts."""

    data: list[ConflictInfo]
    has_conflicts: bool


class StatusCountsResponse(BaseModel):
    """Counts of rules grouped by ingestion status."""

    data: dict[str, int]


class RuleCreateRequest(BaseModel):
    """Create a new rule — accepts any role-keyed fields."""

    model_config = ConfigDict(extra="allow")


class RuleUpdateRequest(BaseModel):
    """Partial update for a rule — only provided fields are changed."""

    model_config = ConfigDict(extra="allow")


class RuleUpdateResponse(BaseModel):
    """Response after creating or updating a rule."""

    success: bool
    data: dict[str, Any]


class RuleDeleteResponse(BaseModel):
    """Response after deleting a rule."""

    success: bool
    id: str


class MemoryUploadResponse(BaseModel):
    """Response after uploading memory data."""

    success: bool
    format: str
    row_count: int
    columns: list[str]
    data: list[dict[str, Any]]
    filters_available: dict[str, list[str]]
    summary: SummaryResponse
    message: str | None = None
