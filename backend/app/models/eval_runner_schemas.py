from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class AgentType(StrEnum):
    """Type of agent connection for generating outputs."""

    NONE = "none"  # Use actual_output from dataset
    API = "api"  # Call external HTTP API
    PROMPT = "prompt"  # Use LLM with prompt template


class LLMProvider(StrEnum):
    """Supported LLM providers for evaluation metrics."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class MetricInfo(BaseModel):
    """Information about an available evaluation metric."""

    key: str
    name: str
    description: str
    required_fields: list[str]
    optional_fields: list[str] = []
    default_threshold: float = 0.5
    score_range: tuple[float, float] = (0.0, 1.0)
    tags: list[str] = []
    is_llm_based: bool = False


class MetricsResponse(BaseModel):
    """Response with available metrics."""

    success: bool
    metrics: list[MetricInfo]


class ColumnMapping(BaseModel):
    """Mapping of canonical field names to actual column names in the dataset."""

    # Required fields
    dataset_id: str = "dataset_id"
    query: str = "query"

    # Optional output fields
    actual_output: str | None = None
    expected_output: str | None = None

    # Optional context fields
    retrieved_content: str | None = None
    conversation: str | None = None
    additional_input: str | None = None
    document_text: str | None = None

    # Optional reference fields
    actual_reference: str | None = None
    expected_reference: str | None = None

    # Optional tool fields
    tools_called: str | None = None
    expected_tools: str | None = None
    acceptance_criteria: str | None = None

    # Optional observability fields
    latency: str | None = None
    trace_id: str | None = None
    observation_id: str | None = None


class DatasetInfo(BaseModel):
    """Information about an uploaded dataset."""

    columns: list[str]
    preview: list[dict[str, Any]]
    row_count: int


class UploadResponse(BaseModel):
    """Response from dataset upload."""

    success: bool
    dataset: DatasetInfo
    suggested_mapping: ColumnMapping | None = None
    message: str | None = None


class AgentAPIConfig(BaseModel):
    """Configuration for Agent API connection."""

    endpoint_url: str
    headers: dict[str, str] = {}
    request_template: str = '{"message": "{{query}}"}'
    response_path: str = ".response"


class PromptTemplateConfig(BaseModel):
    """Configuration for LLM prompt template."""

    model: str = "gpt-4o"
    provider: LLMProvider = LLMProvider.OPENAI
    system_prompt: str = "You are a helpful assistant."
    user_prompt_template: str = "{{query}}"


class AgentConfig(BaseModel):
    """Configuration for agent connection."""

    type: AgentType = AgentType.NONE
    api_config: AgentAPIConfig | None = None
    prompt_config: PromptTemplateConfig | None = None


class TestConnectionRequest(BaseModel):
    """Request to test agent connection."""

    agent_config: AgentConfig
    sample_query: str = "Hello, how are you?"


class TestConnectionResponse(BaseModel):
    """Response from testing agent connection."""

    success: bool
    sample_output: str | None = None
    error: str | None = None
    latency_ms: float | None = None


class DatasetConfig(BaseModel):
    """Dataset configuration including column mapping and data."""

    columns: ColumnMapping
    data: list[dict[str, Any]]


class EvaluationRunRequest(BaseModel):
    """Request to run an evaluation."""

    evaluation_name: str
    dataset: DatasetConfig
    agent_config: AgentConfig | None = None
    metrics: list[str]  # metric keys
    model_name: str = "gpt-4o"
    llm_provider: LLMProvider = LLMProvider.OPENAI
    max_concurrent: int = Field(default=5, ge=1, le=20)
    thresholds: dict[str, float] | None = None


class MetricResult(BaseModel):
    """Result for a single metric across all items."""

    metric_key: str
    metric_name: str
    average_score: float
    median_score: float
    min_score: float
    max_score: float
    pass_rate: float
    threshold: float
    passed: bool
    scores: list[float]  # Individual scores per item


class ItemResult(BaseModel):
    """Result for a single evaluation item."""

    item_id: str
    query: str
    actual_output: str
    expected_output: str | None = None
    metric_scores: dict[str, float]
    metric_reasons: dict[str, str] = {}
    passed: bool


class EvaluationSummary(BaseModel):
    """Summary of evaluation results."""

    evaluation_name: str
    run_id: str
    total_items: int
    metrics_count: int
    average_score: float
    overall_pass_rate: float
    metric_results: list[MetricResult]
    item_results: list[ItemResult]
    # Full dataframe from results.to_dataframe() for export/visualization
    dataframe_records: list[dict[str, Any]] = []
    dataframe_columns: list[str] = []


class EvaluationResultResponse(BaseModel):
    """Full response from completed evaluation."""

    success: bool
    summary: EvaluationSummary
    message: str | None = None


# SSE Progress Event Models
class ProgressEvent(BaseModel):
    """Progress update during evaluation."""

    current: int
    total: int
    metric: str | None = None
    item_id: str | None = None
    status: str = "running"


class LogEvent(BaseModel):
    """Log message during evaluation."""

    timestamp: str
    level: str
    message: str


class CompleteEvent(BaseModel):
    """Completion event with results."""

    run_id: str
    summary: EvaluationSummary


class ErrorEvent(BaseModel):
    """Error event during evaluation."""

    message: str
    details: str | None = None
