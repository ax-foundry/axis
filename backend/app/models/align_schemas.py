from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class LLMProvider(StrEnum):
    """Supported LLM providers."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class FewShotExample(BaseModel):
    """A few-shot example for the judge prompt."""

    query: str
    actual_output: str
    expected_output: str | None = None
    score: int = Field(..., ge=0, le=1)  # Binary: 0 or 1
    reasoning: str


class JudgeConfig(BaseModel):
    """Configuration for the LLM judge."""

    model: str = "gpt-4"
    provider: LLMProvider = LLMProvider.OPENAI
    system_prompt: str = ""
    evaluation_criteria: str = ""
    few_shot_examples: list[FewShotExample] = []
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    name: str | None = None  # Config name for saving/loading


class AlignmentMetrics(BaseModel):
    """Computed alignment metrics between human and LLM scores."""

    cohens_kappa: float
    f1_score: float
    precision: float
    recall: float
    specificity: float
    accuracy: float  # Overall alignment score
    confusion_matrix: list[list[int]]  # [[TN, FP], [FN, TP]]
    total_samples: int
    agreement_count: int


class AlignmentResult(BaseModel):
    """Result for a single evaluated record."""

    record_id: str
    query: str
    actual_output: str
    expected_output: str | None = None
    human_score: int  # 0 or 1
    llm_score: int  # 0 or 1
    llm_reasoning: str
    is_aligned: bool


class EvaluationRequest(BaseModel):
    """Request to run LLM evaluation on a dataset."""

    records: list[dict[str, Any]]
    human_annotations: dict[str, int]  # record_id -> 0 or 1
    judge_config: JudgeConfig


class EvaluationResponse(BaseModel):
    """Response from running LLM evaluation."""

    success: bool
    results: list[AlignmentResult]
    metrics: AlignmentMetrics
    message: str | None = None


class MetricsRequest(BaseModel):
    """Request to calculate alignment metrics."""

    human_scores: list[int]
    llm_scores: list[int]


class MetricsResponse(BaseModel):
    """Response with computed alignment metrics."""

    success: bool
    metrics: AlignmentMetrics


class MisalignmentPattern(BaseModel):
    """A pattern identified in misaligned cases."""

    pattern_type: str  # e.g., "false_positive", "false_negative"
    description: str
    count: int
    examples: list[str]  # record IDs


class MisalignmentAnalysis(BaseModel):
    """Analysis of misalignment patterns."""

    total_misaligned: int
    false_positives: int  # LLM accepted, human rejected
    false_negatives: int  # LLM rejected, human accepted
    patterns: list[MisalignmentPattern]
    summary: str
    recommendations: list[str]


class MisalignmentAnalysisRequest(BaseModel):
    """Request to analyze misalignment patterns."""

    results: list[AlignmentResult]
    judge_config: JudgeConfig


class MisalignmentAnalysisResponse(BaseModel):
    """Response with misalignment analysis."""

    success: bool
    analysis: MisalignmentAnalysis


class PromptSuggestion(BaseModel):
    """A suggested improvement to the judge prompt."""

    aspect: str  # What aspect this improves (e.g., "criteria clarity", "edge cases")
    suggestion: str
    rationale: str


class OptimizedPrompt(BaseModel):
    """Optimized prompt with suggestions."""

    original_prompt: str
    optimized_prompt: str
    evaluation_criteria: str
    suggestions: list[PromptSuggestion]
    expected_improvement: str


class OptimizePromptRequest(BaseModel):
    """Request to optimize the judge prompt."""

    results: list[AlignmentResult]
    current_config: JudgeConfig


class OptimizePromptResponse(BaseModel):
    """Response with optimized prompt."""

    success: bool
    optimized: OptimizedPrompt
    message: str | None = None


class ExampleSelectionStrategy(StrEnum):
    """Strategy for selecting few-shot examples."""

    REPRESENTATIVE = "representative"  # Balanced examples
    EDGE_CASES = "edge_cases"  # Misaligned or difficult cases
    DIVERSE = "diverse"  # Maximum diversity
    RECENT = "recent"  # Most recently annotated


class SuggestExamplesRequest(BaseModel):
    """Request to suggest few-shot examples."""

    records: list[dict[str, Any]]
    human_annotations: dict[str, int]
    strategy: ExampleSelectionStrategy = ExampleSelectionStrategy.DIVERSE
    count: int = Field(default=4, ge=1, le=10)


class SuggestExamplesResponse(BaseModel):
    """Response with suggested few-shot examples."""

    success: bool
    examples: list[FewShotExample]
    strategy_used: str
    message: str | None = None


class ModelInfo(BaseModel):
    """Information about an available LLM model."""

    id: str
    name: str
    provider: LLMProvider
    context_window: int
    supports_function_calling: bool = True


class ModelsResponse(BaseModel):
    """Response with available models."""

    success: bool
    models: list[ModelInfo]


class SavedConfig(BaseModel):
    """A saved judge configuration."""

    id: str
    name: str
    config: JudgeConfig
    created_at: str
    updated_at: str
    metrics: AlignmentMetrics | None = None  # Last known metrics


class SaveConfigRequest(BaseModel):
    """Request to save a judge configuration."""

    name: str
    config: JudgeConfig
    metrics: AlignmentMetrics | None = None


class SaveConfigResponse(BaseModel):
    """Response after saving configuration."""

    success: bool
    config_id: str
    message: str | None = None


class ConfigsListResponse(BaseModel):
    """Response with list of saved configurations."""

    success: bool
    configs: list[SavedConfig]


# ============================================
# Pattern Clustering Schemas (Truesight Feature)
# ============================================


class ClusteringMethod(StrEnum):
    """Method for clustering annotation patterns."""

    LLM = "llm"  # Use LLM to categorize patterns
    BERTOPIC = "bertopic"  # Use BERTopic for topic modeling
    HYBRID = "hybrid"  # Combine BERTopic clustering with LLM labeling


class AnnotationWithNotes(BaseModel):
    """Annotation with optional notes for Truesight pattern discovery."""

    score: int = Field(..., ge=0, le=1)  # Binary: 0 or 1
    notes: str | None = None
    timestamp: str | None = None


class ErrorPattern(BaseModel):
    """AI-clustered error pattern from annotation notes."""

    category: str  # AI-generated category name
    count: int  # How many records match
    examples: list[str]  # Sample notes
    record_ids: list[str]  # Records in this category


class LearningArtifactSchema(BaseModel):
    """A distilled learning artifact from the EvidencePipeline."""

    title: str
    content: str
    tags: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0.0, le=1.0)
    supporting_item_ids: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    counterexamples: list[str] = Field(default_factory=list)
    scope: str | None = None
    when_not_to_apply: str | None = None


class PipelineResultSchema(BaseModel):
    """Metadata from the EvidencePipeline run."""

    filtered_count: int = 0
    deduplicated_count: int = 0
    validation_repairs: int = 0
    total_analyzed: int = 0
    clustering_method: str | None = None


class ClusterPatternsRequest(BaseModel):
    """Request to cluster annotation notes into patterns."""

    annotations: dict[str, AnnotationWithNotes]  # record_id -> annotation
    judge_config: JudgeConfig | None = None  # Optional - uses default if not provided
    method: ClusteringMethod = ClusteringMethod.LLM  # Clustering method to use
    domain_context: str | None = None  # Domain context for distillation


class ClusterPatternsResponse(BaseModel):
    """Response with clustered patterns."""

    success: bool
    patterns: list[ErrorPattern]
    uncategorized: list[str]  # Record IDs that couldn't be categorized
    learnings: list[LearningArtifactSchema] = Field(default_factory=list)
    pipeline_metadata: PipelineResultSchema | None = None
    message: str | None = None


# Default judge prompt template
DEFAULT_JUDGE_PROMPT = """You are an expert evaluator assessing the quality of AI-generated responses.

## Evaluation Criteria
{evaluation_criteria}

## Instructions
1. Carefully read the query and response
2. Apply the evaluation criteria strictly
3. Provide your judgment as ACCEPT (score 1) or REJECT (score 0)
4. Explain your reasoning briefly

## Output Format
You must respond in exactly this format:
Score: [0 or 1]
Reasoning: [Your explanation in 1-2 sentences]"""


DEFAULT_EVALUATION_CRITERIA = """Evaluate whether the response:
1. Directly addresses the user's query
2. Provides accurate and factual information
3. Is clear, coherent, and well-structured
4. Is free from harmful, biased, or inappropriate content

Accept (1) if the response meets all criteria satisfactorily.
Reject (0) if the response fails any criteria significantly."""
