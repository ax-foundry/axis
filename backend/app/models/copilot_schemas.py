from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ThoughtType(StrEnum):
    """Types of thoughts the copilot can emit."""

    REASONING = "reasoning"
    TOOL_USE = "tool_use"
    OBSERVATION = "observation"
    PLANNING = "planning"
    REFLECTION = "reflection"
    DECISION = "decision"
    ERROR = "error"
    SUCCESS = "success"


class ThoughtSchema(BaseModel):
    """Schema for a copilot thought in API responses."""

    id: str
    type: ThoughtType
    content: str
    node_name: str | None = None
    skill_name: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: str  # ISO format
    color: str


class DataContext(BaseModel):
    """Context about the currently loaded data."""

    format: str | None = None
    row_count: int = 0
    metric_columns: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)


class CopilotRequest(BaseModel):
    """Request to the copilot streaming endpoint."""

    message: str = Field(..., min_length=1, description="User's message to the copilot")
    data_context: DataContext | None = None
    data: list[dict[str, Any]] | None = Field(
        default=None, description="Evaluation data rows for analysis"
    )
    session_id: str | None = Field(default=None, description="Optional session ID for continuity")


class CopilotResponse(BaseModel):
    """Final response from the copilot."""

    success: bool
    response: str
    thoughts: list[ThoughtSchema] = Field(default_factory=list)
    skills_used: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SkillParameterSchema(BaseModel):
    """Schema for a skill parameter."""

    name: str
    type: str  # string, integer, float, boolean, array, object
    description: str | None = None
    required: bool = False
    default: Any = None


class SkillInfoSchema(BaseModel):
    """Schema for skill information in API responses."""

    name: str
    description: str
    version: str = "1.0.0"
    parameters: list[SkillParameterSchema] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    enabled: bool = True


class SkillsListResponse(BaseModel):
    """Response with list of available skills."""

    success: bool
    skills: list[SkillInfoSchema]
    total: int


class SSEEvent(BaseModel):
    """Server-Sent Event data structure."""

    event: str  # thought, response, error, done
    data: str  # JSON-encoded payload


# Event types for SSE streaming
class SSEEventType(StrEnum):
    """Types of SSE events."""

    THOUGHT = "thought"  # A thought was emitted
    RESPONSE = "response"  # Final response ready
    INSIGHTS = "insights"  # Structured insight patterns
    ERROR = "error"  # An error occurred
    DONE = "done"  # Stream complete
    PING = "ping"  # Keep-alive ping


# ============================================
# Report Generation Schemas
# ============================================


class ReportMode(StrEnum):
    """Mode for selecting which issues to extract."""

    LOW = "low"  # Low-scoring metrics (below threshold)
    HIGH = "high"  # High-scoring metrics (above threshold)
    OVERALL = "overall"  # All metrics regardless of score


class ReportType(StrEnum):
    """Type of report to generate."""

    SUMMARY = "summary"  # Brief overview
    DETAILED = "detailed"  # Comprehensive analysis
    GROUPED = "grouped"  # Issues grouped by pattern/category
    RECOMMENDATIONS = "recommendations"  # Actionable improvement suggestions


class ReportRequest(BaseModel):
    """Request schema for report generation."""

    mode: ReportMode = Field(default=ReportMode.LOW, description="Which issues to extract")
    report_type: ReportType = Field(default=ReportType.SUMMARY, description="Type of report")
    metric_filter: str | None = Field(default=None, description="Optional metric name to filter by")
    score_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Score threshold")
    max_issues: int = Field(default=100, ge=1, le=500, description="Maximum issues to analyze")
    data: list[dict[str, Any]] = Field(default_factory=list, description="Evaluation data")
    model: str = Field(default="gpt-4o-mini", description="LLM model to use")
    provider: str = Field(default="openai", description="LLM provider")


class ReportResponse(BaseModel):
    """Response schema for report generation."""

    success: bool
    report_text: str = ""
    issues_analyzed: int = 0
    metrics_covered: list[str] = Field(default_factory=list)
