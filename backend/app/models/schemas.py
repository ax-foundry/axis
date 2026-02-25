from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class DataFormat(StrEnum):
    """Supported evaluation data formats."""

    TREE = "tree"
    FLAT_SCORES = "flat_scores"
    SIMPLE_JUDGMENT = "simple_judgment"
    FRESH_ANNOTATION = "fresh_annotation"
    UNKNOWN = "unknown"


class UploadResponse(BaseModel):
    """Response after uploading evaluation data."""

    success: bool
    format: str
    row_count: int
    columns: list[str]
    preview: list[dict[str, Any]]
    message: str | None = None
    data: list[dict[str, Any]] | None = None


class DataFormatResponse(BaseModel):
    """Response for data format detection."""

    format: str
    columns: list[str]
    row_count: int


class DataPreviewResponse(BaseModel):
    """Preview of uploaded data with column info."""

    columns: list[str]
    row_count: int
    preview: list[dict[str, Any]]


class MetricSummary(BaseModel):
    """Summary statistics for a single metric."""

    metric_name: str
    mean: float
    std: float
    min: float
    max: float
    count: int
    passing_rate: float


class SummaryResponse(BaseModel):
    """Aggregated summary of all metrics."""

    success: bool
    summary: list[MetricSummary]
    total_records: int


class DistributionStats(BaseModel):
    """Descriptive statistics for a metric distribution."""

    mean: float
    median: float
    std: float
    q25: float
    q75: float


class Histogram(BaseModel):
    """Histogram bin counts and edges."""

    counts: list[int]
    bin_edges: list[float]


class DistributionResponse(BaseModel):
    """Full distribution data for a single metric."""

    success: bool
    metric: str
    values: list[float]
    histogram: Histogram
    stats: DistributionStats


class EvaluationRecord(BaseModel):
    """A single evaluation record with input/output fields."""

    id: str
    query: str | None = None
    actual_output: str | None = None
    expected_output: str | None = None
    evaluation_name: str | None = None
    conversation: str | None = None
    retrieved_content: str | None = None

    class Config:
        """Pydantic config allowing extra fields."""

        extra = "allow"


class TreeMetric(BaseModel):
    """A metric in the tree-format evaluation structure."""

    id: str
    metric_name: str
    metric_score: float
    weight: float = 1.0
    metric_type: str = "score"
    parent: str | None = None
    explanation: str | None = None
    signals: list[str] | None = None


class Annotation(BaseModel):
    """A human annotation on an evaluation record."""

    id: str
    record_id: str
    score: float | None = None
    tags: list[str] | None = None
    critique: str | None = None
    annotated_at: str
    annotated_by: str | None = None


class Persona(BaseModel):
    """A simulation persona with traits."""

    id: str
    name: str
    description: str
    traits: list[str] = []


class SimulationConfig(BaseModel):
    """Configuration for running a simulation."""

    personas: list[Persona]
    conversation_count: int = 10
    agent_endpoint: str | None = None


class SimulationResult(BaseModel):
    """Result of a single simulation run."""

    id: str
    persona: Persona
    conversation: str
    metrics: dict[str, float] | None = None


class CalibrationResult(BaseModel):
    """Inter-annotator agreement calibration results."""

    cohens_kappa: float
    agreement: float
    correlation: float
    confusion_matrix: list[list[int]]


class ChatMessage(BaseModel):
    """A single chat message."""

    role: str
    content: str


class AnalysisInsight(BaseModel):
    """An automated insight from data analysis."""

    type: str  # "warning", "success", "info"
    metric: str
    message: str
