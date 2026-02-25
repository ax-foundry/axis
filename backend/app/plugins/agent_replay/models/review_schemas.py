from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ReviewVerdict(StrEnum):
    positive = "positive"
    negative = "negative"
    neutral = "neutral"


class ReviewCreateRequest(BaseModel):
    trace_id: str
    agent: str | None = None
    agent_label: str | None = None
    verdict: ReviewVerdict
    failure_observation_id: str | None = None
    failure_observation_name: str | None = None
    tooling_needs: str = Field(default="", max_length=2000)
    rationale: str = Field(default="", max_length=2000)
    expected_output: str = Field(default="", max_length=2000)
    trace_input: dict[str, Any] | list[Any] | str | None = None
    add_to_dataset: bool = False
    dataset_name: str | None = Field(default=None, max_length=200)


class ReviewScoreItem(BaseModel):
    id: str = ""
    name: str
    value: float | None = None
    string_value: str | None = None
    comment: str | None = None
    observation_id: str | None = None
    created_at: str | None = None
    source: str | None = None


class ReviewResponse(BaseModel):
    success: bool
    trace_id: str
    scores_created: int = 0
    dataset_item_created: bool = False
    dataset_name: str | None = None
    scores: list[ReviewScoreItem] = Field(default_factory=list)


class TraceReviewsResponse(BaseModel):
    trace_id: str
    scores: list[ReviewScoreItem] = Field(default_factory=list)
    datasets: list[str] = Field(default_factory=list)


class DatasetInfo(BaseModel):
    name: str
    id: str = ""
    item_count: int = 0
    created_at: str | None = None


class DatasetListResponse(BaseModel):
    datasets: list[DatasetInfo] = Field(default_factory=list)
