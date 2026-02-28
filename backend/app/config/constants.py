from dataclasses import dataclass
from typing import ClassVar


class Columns:
    """Column names for data processing. Mirrors Dash Config class."""

    # Identifiers
    DATASET_ID = "dataset_id"
    METRIC_ID = "metric_id"
    RUN_ID = "run_id"

    # Core evaluation fields
    EXPERIMENT_NAME = "evaluation_name"
    QUERY = "query"
    ACTUAL_OUTPUT = "actual_output"
    EXPECTED_OUTPUT = "expected_output"
    CONVERSATION = "conversation"
    RETRIEVED_CONTENT = "retrieved_content"
    ADDITIONAL_INPUT = "additional_input"
    ACCEPTANCE_CRITERIA = "acceptance_criteria"

    # Reference fields
    DOCUMENT_TEXT = "document_text"
    ACTUAL_REFERENCE = "actual_reference"
    EXPECTED_REFERENCE = "expected_reference"

    # Metric fields
    METRIC_NAME = "metric_name"
    METRIC_SCORE = "metric_score"
    METRIC_TYPE = "metric_type"
    METRIC_CATEGORY = "metric_category"
    WEIGHT = "weight"
    PARENT = "parent"

    # Result fields
    JUDGMENT = "judgment"
    PASSED = "passed"
    THRESHOLD = "threshold"
    EXPLANATION = "explanation"
    SIGNALS = "signals"
    CRITIQUE = "critique"
    ADDITIONAL_OUTPUT = "additional_output"

    # Observability fields
    TRACE = "trace"
    TRACE_ID = "trace_id"
    OBSERVATION_ID = "observation_id"
    LATENCY = "Latency"
    COST_ESTIMATE = "cost_estimate"

    # Metadata fields
    SOURCE = "source"
    METADATA = "data_metadata"
    EXPERIMENT_METADATA = "evaluation_metadata"
    DATASET_METADATA = "dataset_metadata"
    METRIC_METADATA = "metric_metadata"
    USER_TAGS = "user_tags"

    # Configuration fields
    MODEL_NAME = "model_name"
    LLM_PROVIDER = "llm_provider"

    # Status fields
    HAS_ERRORS = "has_errors"
    VERSION = "version"
    TIMESTAMP = "timestamp"

    # UI Configuration
    ITEMS_PER_PAGE = 3
    CONTENT_TRUNC_LENGTH = 200
    SPANS_PER_PAGE = 10

    # Analytics
    DROP_LATENCY = True
    ADD_DEFAULT_PRODUCT = True

    # Index columns for aggregation (ClassVar for mutable class attributes)
    INDEX_COLUMNS: ClassVar[list[str]] = [
        DATASET_ID,
        QUERY,
        ACTUAL_OUTPUT,
        EXPERIMENT_NAME,
        EXPERIMENT_METADATA,
    ]
    AGG_METRICS: ClassVar[list[str]] = ["mean", "std", "count"]


@dataclass(frozen=True)
class Thresholds:
    """Evaluation thresholds."""

    PASSING_RATE: float = 0.5
    GREEN_THRESHOLD: float = 0.7
    RED_THRESHOLD: float = 0.3


@dataclass(frozen=True)
class Colors:
    """Color palette for charts and UI."""

    PALETTE: ClassVar[dict[str, str]] = {
        "primary": "#8B9F4F",
        "primary_light": "#A4B86C",
        "primary_dark": "#6B7A3A",
        "primary_soft": "#B8C78A",
        "primary_pale": "#D4E0B8",
        "accent_gold": "#D4AF37",
        "accent_silver": "#B8C5D3",
        "text_primary": "#2C3E50",
        "text_secondary": "#34495E",
        "text_muted": "#7F8C8D",
        "success": "#27AE60",
        "warning": "#F39C12",
        "error": "#E74C3C",
    }

    CHART_COLORS: ClassVar[list[str]] = [
        "#8B9F4F",
        "#A4B86C",
        "#6B7A3A",
        "#B8C78A",
        "#D4AF37",
        "#B8C5D3",
        "#D4E0B8",
        "#1f77b4",
        "#ff7f0e",
        "#2ca02c",
    ]

    @classmethod
    def get(cls, name: str) -> str:
        """Get color by name."""
        if name not in cls.PALETTE:
            raise ValueError(f"Color '{name}' not found in palette.")
        return cls.PALETTE[name]
