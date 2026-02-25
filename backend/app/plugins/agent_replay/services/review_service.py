from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from app.plugins.agent_replay.models.review_schemas import (
    DatasetInfo,
    DatasetListResponse,
    ReviewCreateRequest,
    ReviewResponse,
    ReviewScoreItem,
    ReviewVerdict,
    TraceReviewsResponse,
)
from app.plugins.agent_replay.services.replay_service import _get_loader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Score name constants (versioned to avoid future conflicts)
# ---------------------------------------------------------------------------

VERDICT_SCORE = "review.verdict.v1"
TOOLING_NEEDS_SCORE = "review.tooling_needs.v1"
RATIONALE_SCORE = "review.rationale.v1"
EXPECTED_OUTPUT_SCORE = "review.expected_output.v1"
FAILURE_STEP_SCORE = "review.failure_step.v1"

VERDICT_VALUES = {
    ReviewVerdict.positive: 1,
    ReviewVerdict.negative: -1,
    ReviewVerdict.neutral: 0,
}


def _get_client(agent_name: str | None = None) -> Any:
    loader = _get_loader(agent_name)
    return loader.client


def _default_dataset_name(agent: str | None) -> str:
    prefix = agent or "default"
    month = datetime.now(tz=UTC).strftime("%Y-%m")
    return f"{prefix}-golden-{month}"


def _create_score(
    client: Any,
    *,
    trace_id: str,
    name: str,
    value: float | str,
    comment: str | None = None,
    observation_id: str | None = None,
    data_type: str | None = None,
) -> ReviewScoreItem:
    kwargs: dict[str, Any] = {
        "trace_id": trace_id,
        "name": name,
        "value": value,
        "comment": comment,
    }
    if observation_id:
        kwargs["observation_id"] = observation_id
    if data_type:
        kwargs["data_type"] = data_type

    client.create_score(**kwargs)

    # create_score returns None; build our own item
    numeric_value = value if isinstance(value, int | float) else None
    string_value = comment or (value if isinstance(value, str) else str(value))

    return ReviewScoreItem(
        id="",
        name=name,
        value=numeric_value,
        string_value=string_value,
        observation_id=observation_id,
    )


def _save_review_sync(request: ReviewCreateRequest) -> ReviewResponse:
    client = _get_client(request.agent)
    created_scores: list[ReviewScoreItem] = []

    obs_id = request.failure_observation_id

    # 1. Verdict score (always created)
    created_scores.append(
        _create_score(
            client,
            trace_id=request.trace_id,
            name=VERDICT_SCORE,
            value=VERDICT_VALUES[request.verdict],
            comment=request.verdict.value,
        )
    )

    # 2. Tooling needs (if non-empty)
    if request.tooling_needs.strip():
        created_scores.append(
            _create_score(
                client,
                trace_id=request.trace_id,
                name=TOOLING_NEEDS_SCORE,
                value=request.tooling_needs,
                observation_id=obs_id,
                data_type="CATEGORICAL",
            )
        )

    # 3. Rationale (if non-empty)
    if request.rationale.strip():
        created_scores.append(
            _create_score(
                client,
                trace_id=request.trace_id,
                name=RATIONALE_SCORE,
                value=request.rationale,
                observation_id=obs_id,
                data_type="CATEGORICAL",
            )
        )

    # 4. Expected output (if non-empty)
    if request.expected_output.strip():
        created_scores.append(
            _create_score(
                client,
                trace_id=request.trace_id,
                name=EXPECTED_OUTPUT_SCORE,
                value=request.expected_output,
                observation_id=obs_id,
                data_type="CATEGORICAL",
            )
        )

    # 5. Failure step (if provided)
    if obs_id:
        failure_comment = request.failure_observation_name or obs_id
        created_scores.append(
            _create_score(
                client,
                trace_id=request.trace_id,
                name=FAILURE_STEP_SCORE,
                value=failure_comment,
                observation_id=obs_id,
                data_type="CATEGORICAL",
            )
        )

    # 6. Dataset item (optional)
    dataset_item_created = False
    dataset_name: str | None = None

    if request.add_to_dataset:
        # agent_label = display name (trace name or selected agent)
        # agent = credential key (may be None for global creds)
        label = request.agent_label or request.agent

        # Dataset name = failure step name (e.g. "recommendation")
        # Falls back to user-provided name or agent-based default
        dataset_name = (
            request.failure_observation_name or request.dataset_name or _default_dataset_name(label)
        )
        client.create_dataset(name=dataset_name)

        # Item ID = {agent}-golden-YYYY-MM for grouping by review batch
        item_id = _default_dataset_name(label)

        # Build metadata from review fields
        item_metadata: dict[str, str] = {"verdict": request.verdict.value}
        if request.tooling_needs.strip():
            item_metadata["tooling_needs"] = request.tooling_needs
        if request.rationale.strip():
            item_metadata["rationale"] = request.rationale

        client.create_dataset_item(
            dataset_name=dataset_name,
            id=item_id,
            source_trace_id=request.trace_id,
            source_observation_id=obs_id,
            input=request.trace_input,
            expected_output=request.expected_output or None,
            metadata=item_metadata,
        )
        dataset_item_created = True
        logger.info("Created dataset item in %r for trace %s", dataset_name, request.trace_id)

    # Flush to ensure scores are sent
    client.flush()

    return ReviewResponse(
        success=True,
        trace_id=request.trace_id,
        scores_created=len(created_scores),
        dataset_item_created=dataset_item_created,
        dataset_name=dataset_name,
        scores=created_scores,
    )


async def save_review(request: ReviewCreateRequest) -> ReviewResponse:
    return await asyncio.to_thread(_save_review_sync, request)


def _get_trace_reviews_sync(trace_id: str, agent_name: str | None) -> TraceReviewsResponse:
    client = _get_client(agent_name)
    trace_data = client.api.trace.get(trace_id)

    scores: list[ReviewScoreItem] = []
    raw_scores = getattr(trace_data, "scores", []) or []
    for s in raw_scores:
        name = getattr(s, "name", "")
        if not name.startswith("review."):
            continue
        scores.append(
            ReviewScoreItem(
                id=str(getattr(s, "id", "")),
                name=name,
                value=getattr(s, "value", None),
                string_value=getattr(s, "comment", None),
                observation_id=getattr(s, "observation_id", None)
                or getattr(s, "observationId", None),
                created_at=str(getattr(s, "created_at", "") or getattr(s, "createdAt", "") or ""),
                source=getattr(s, "source", None),
            )
        )

    return TraceReviewsResponse(trace_id=trace_id, scores=scores)


async def get_trace_reviews(trace_id: str, agent_name: str | None) -> TraceReviewsResponse:
    return await asyncio.to_thread(_get_trace_reviews_sync, trace_id, agent_name)


def _list_datasets_sync(agent_name: str | None) -> DatasetListResponse:
    client = _get_client(agent_name)
    raw = client.api.datasets.list()
    datasets_raw = getattr(raw, "data", []) or []

    datasets: list[DatasetInfo] = []
    for ds in datasets_raw:
        datasets.append(
            DatasetInfo(
                name=getattr(ds, "name", ""),
                id=str(getattr(ds, "id", "")),
                item_count=getattr(ds, "item_count", 0) or getattr(ds, "itemCount", 0) or 0,
                created_at=str(getattr(ds, "created_at", "") or getattr(ds, "createdAt", "") or ""),
            )
        )
    return DatasetListResponse(datasets=datasets)


async def list_datasets(agent_name: str | None) -> DatasetListResponse:
    return await asyncio.to_thread(_list_datasets_sync, agent_name)
