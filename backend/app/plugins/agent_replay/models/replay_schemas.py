from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class TokenUsage(BaseModel):
    input: int = 0
    output: int = 0
    total: int = 0


class ObservationSummary(BaseModel):
    id: str
    name: str | None = None
    type: str | None = None
    model: str | None = None
    input: Any = None
    output: Any = None
    input_truncated: bool = False
    output_truncated: bool = False
    metadata: dict[str, Any] | None = None
    usage: TokenUsage | None = None
    latency_ms: float | None = None
    start_time: str | None = None
    end_time: str | None = None


class ObservationNodeResponse(BaseModel):
    id: str
    name: str | None = None
    type: str | None = None
    model: str | None = None
    input: Any = None
    output: Any = None
    input_truncated: bool = False
    output_truncated: bool = False
    metadata: dict[str, Any] | None = None
    usage: TokenUsage | None = None
    latency_ms: float | None = None
    start_time: str | None = None
    end_time: str | None = None
    depth: int = 0
    children: list[ObservationNodeResponse] = Field(default_factory=list)


# Required for Pydantic v2 self-reference
ObservationNodeResponse.model_rebuild()


class StepSummary(BaseModel):
    name: str
    index: int
    observation_types: list[str] = Field(default_factory=list)
    generation: ObservationSummary | None = None
    observations: list[ObservationSummary] = Field(default_factory=list)
    variables: dict[str, str] | None = None


class TraceSummary(BaseModel):
    id: str
    name: str | None = None
    tags: list[str] = Field(default_factory=list)
    timestamp: str | None = None
    step_count: int = 0
    step_names: list[str] = Field(default_factory=list)


class TraceDetailResponse(BaseModel):
    id: str
    name: str | None = None
    tags: list[str] = Field(default_factory=list)
    timestamp: str | None = None
    trace_input: Any = None
    trace_output: Any = None
    trace_metadata: dict[str, Any] | None = None
    steps: list[StepSummary] = Field(default_factory=list)
    tree: list[ObservationNodeResponse] = Field(default_factory=list)
    total_tokens: TokenUsage = Field(default_factory=TokenUsage)
    total_latency_ms: float | None = None
    total_cost: float | None = None
    schema_version: str = "2.0"


class RecentTracesResponse(BaseModel):
    traces: list[TraceSummary] = Field(default_factory=list)
    total: int = 0


class SearchFieldOption(BaseModel):
    value: str
    label: str


class ReplayStatusResponse(BaseModel):
    enabled: bool = False
    configured: bool = False
    langfuse_host: str = ""
    default_limit: int = 20
    default_days_back: int = 7
    agents: list[str] = Field(default_factory=list)
    search_fields: list[SearchFieldOption] = Field(default_factory=list)
    agent_search_fields: dict[str, list[SearchFieldOption]] = Field(default_factory=dict)
