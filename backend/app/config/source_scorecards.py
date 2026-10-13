"""Validated configuration for generic source scorecards."""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

from app.config.paths import resolve_config_path


class SourceMetricSpec(BaseModel):
    """One metric bound to a scorecard table and one or more views."""

    key: str
    table: str
    label: str
    sections: list[Literal["overview", "flow", "quality", "reliability"]]


class SourceScorecardSpec(BaseModel):
    """Allowlisted result contract for a source scorecard."""

    metrics: list[SourceMetricSpec] = Field(min_length=1)
    metric_key_column: str = "metric_key"
    value_column: str = "value"
    contributor_id_column: str
    timestamp_column: str
    version_column: str
    unit_column: str
    numerator_column: str
    denominator_column: str
    sample_size_column: str
    availability_column: str
    availability_reason_column: str
    cohort_column: str
    observation_window_column: str
    comparison_window_column: str
    source_watermark_column: str
    instrumentation_horizon_column: str
    filter_dimensions: list[str] = Field(default_factory=list)
    detail_columns: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_metric_keys(self) -> SourceScorecardSpec:
        """Reject duplicate metric keys."""
        keys = [metric.key for metric in self.metrics]
        if len(keys) != len(set(keys)):
            raise ValueError("metric keys must be unique")
        return self


class SourceScorecardsConfig(BaseModel):
    """Top-level source scorecard configuration."""

    source_scorecards: dict[str, SourceScorecardSpec] = Field(default_factory=dict)


@functools.lru_cache(maxsize=8)
def _load_cached(path_str: str, mtime_ns: int) -> SourceScorecardsConfig:
    """Load a scorecard configuration keyed by its modification time."""
    with Path(path_str).open() as file:
        return SourceScorecardsConfig.model_validate(yaml.safe_load(file) or {})


def get_source_scorecards() -> SourceScorecardsConfig:
    """Load source_scorecards.yaml, or no scorecards when it is absent."""
    path = resolve_config_path("source_scorecards.yaml")
    if not path.exists():
        return SourceScorecardsConfig()
    return _load_cached(str(path), path.stat().st_mtime_ns)
