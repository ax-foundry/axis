"""Scorecard configuration: YAML-driven dashboard definitions.

A scorecard names a (source_table, group_column) pair plus the metric list,
anomaly rules, sentiment value-map, and detail-view projection that the
``/api/scorecard/{name}/{view}`` endpoints render. Every dataset-specific
choice (which metric names matter, how 'critical' is defined, what to call
sentiment) lives here in ``custom/config/scorecards.yaml`` — the router
itself is generic and ships in OSS axis.
"""

from __future__ import annotations

import functools
import logging
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field

from app.config.paths import resolve_config_path

logger = logging.getLogger(__name__)


# Subset of /api/store/query Filter that's safe to use as a config-side WHERE clause.
# We deliberately don't accept arbitrary boolean expressions here — only column-op-value
# triples, materialized into "<col>" <op> ? at SQL build time.
class ConfigFilter(BaseModel):
    """A column/op/value filter expressed in YAML config."""

    col: str
    op: Literal["eq", "neq", "in", "gte", "lte", "gt", "lt", "is_null", "is_not_null"]
    value: Any | None = None


class MetricSpec(BaseModel):
    """A single aggregated metric in the summary view."""

    name: str  # output column name (e.g. "uw_faithfulness")
    match: str  # value to match in metric_name column
    agg: Literal["avg", "sum", "max", "min", "count"] = "avg"
    col: str  # column to aggregate (e.g. "metric_score")


class AnomalyConfig(BaseModel):
    """Defines what counts as a failure and what's 'critical' vs 'warning'."""

    failure_filter: list[ConfigFilter] = Field(
        default_factory=list,
        description="Rows matching ALL of these are anomalies. Empty = match nothing.",
    )
    critical_rule: list[ConfigFilter] = Field(
        default_factory=list,
        description="Among anomalies, those matching ALL of these are 'critical'.",
    )


class SentimentConfig(BaseModel):
    """How to score sentiment: which column, what values map to what."""

    table: str | None = None  # if None, falls back to ScorecardSpec.sentiment_table
    column: str
    timestamp_column: str = "Timestamp"
    value_map: dict[str, float]


class ScorecardSpec(BaseModel):
    """A single scorecard definition."""

    source_table: str
    sentiment_table: str | None = None
    base_filters: list[ConfigFilter] = Field(default_factory=list)
    group_column: str
    timestamp_column: str = "timestamp"
    metric_label_column: str = "metric_name"
    score_column: str = "metric_score"
    metrics: list[MetricSpec] = Field(default_factory=list)
    anomaly: AnomalyConfig | None = None
    sentiment: SentimentConfig | None = None
    detail_columns: list[str] = Field(default_factory=list)


class ScorecardsConfig(BaseModel):
    """Top-level YAML schema."""

    scorecards: dict[str, ScorecardSpec] = Field(default_factory=dict)


@functools.lru_cache(maxsize=8)
def _load_cached(path_str: str, mtime_ns: int) -> ScorecardsConfig:
    # mtime_ns is part of the cache key — when the file changes, we get a fresh load.
    with Path(path_str).open() as f:
        raw = yaml.safe_load(f) or {}
    return ScorecardsConfig.model_validate(raw)


def get_scorecards() -> ScorecardsConfig:
    """Return the parsed scorecards.yaml, or an empty config if the file is absent."""
    path = resolve_config_path("scorecards.yaml")
    if not path.exists():
        return ScorecardsConfig()
    mtime_ns = path.stat().st_mtime_ns
    return _load_cached(str(path), mtime_ns)


def validate_at_startup() -> None:
    """Validate scorecards.yaml at app boot — log + raise on structural error.

    Column existence is *not* checked here (tables may not be synced yet).
    Per-request validation handles that.
    """
    try:
        cfg = get_scorecards()
    except Exception:
        logger.exception("scorecards.yaml failed to load")
        raise
    if cfg.scorecards:
        logger.info("Loaded %d scorecard(s): %s", len(cfg.scorecards), sorted(cfg.scorecards))
    else:
        logger.info("No scorecards configured (custom/config/scorecards.yaml absent or empty)")
