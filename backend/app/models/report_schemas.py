from pydantic import BaseModel, Field

from app.models.align_schemas import LearningArtifactSchema, PipelineResultSchema


class InsightPatternSchema(BaseModel):
    """A cross-metric pattern discovered from evaluation issues."""

    category: str
    description: str
    count: int
    issue_ids: list[str] = Field(default_factory=list)
    metrics_involved: list[str] = Field(default_factory=list)
    is_cross_metric: bool = False
    distinct_test_cases: int = 0
    examples: list[str] = Field(default_factory=list)
    confidence: float | None = None


class InsightResultSchema(BaseModel):
    """Structured insight result from InsightExtractor analysis."""

    patterns: list[InsightPatternSchema] = Field(default_factory=list)
    learnings: list[LearningArtifactSchema] = Field(default_factory=list)
    total_issues_analyzed: int = 0
    pipeline_metadata: PipelineResultSchema | None = None
