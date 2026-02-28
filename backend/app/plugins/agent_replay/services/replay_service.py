from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any

from app.config.env import settings
from app.plugins.agent_replay.config import get_replay_config
from app.plugins.agent_replay.models.replay_schemas import (
    ObservationNodeResponse,
    ObservationSummary,
    RecentTracesResponse,
    ReplayStatusResponse,
    SearchFieldOption,
    StepSummary,
    TokenUsage,
    TraceDetailResponse,
    TraceSummary,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class LangfuseNotConfiguredError(Exception):
    pass


class ReplayServiceError(Exception):
    pass


class StepNotFoundError(Exception):
    pass


class NodeNotFoundError(Exception):
    pass


# ---------------------------------------------------------------------------
# Metadata redaction
# ---------------------------------------------------------------------------

SENSITIVE_KEY_PATTERN = re.compile(
    r"(?:^|[_-])(?:api[_-]?key|token|secret|password|credential|authorization|bearer)(?:$|[_-])",
    re.IGNORECASE,
)

# Pattern to detect trace IDs: UUIDs or long hex strings (32+ chars)
_TRACE_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32,}$",
    re.IGNORECASE,
)


def _redact_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    if metadata is None:
        return None
    redacted: dict[str, Any] = {}
    for key, value in metadata.items():
        if SENSITIVE_KEY_PATTERN.search(key):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = _redact_metadata(value)
        else:
            redacted[key] = value
    return redacted


# ---------------------------------------------------------------------------
# Content truncation
# ---------------------------------------------------------------------------


def _truncate_content(content: Any, max_chars: int | None) -> tuple[Any, bool]:
    if max_chars is None or content is None:
        return content, False

    if isinstance(content, str):
        if len(content) > max_chars:
            return content[:max_chars] + " [...truncated]", True
        return content, False

    # For dicts/lists, serialize to check length
    try:
        serialized = json.dumps(content, default=str)
        if len(serialized) > max_chars:
            return serialized[:max_chars] + " [...truncated]", True
        return content, False
    except (TypeError, ValueError):
        return content, False


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _to_plain_dict(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    # SmartDict stores its data in ``_data``
    raw = getattr(obj, "_data", None)
    if isinstance(raw, dict):
        return dict(raw)
    # Last resort — JSON round-trip (handles anything serializable)
    try:
        return dict(json.loads(json.dumps(obj, default=str)))
    except Exception:
        return None


def _extract_usage(raw_usage: Any) -> TokenUsage | None:
    if raw_usage is None:
        return None
    try:
        input_tokens = getattr(raw_usage, "input", 0) or getattr(raw_usage, "promptTokens", 0) or 0
        output_tokens = (
            getattr(raw_usage, "output", 0) or getattr(raw_usage, "completionTokens", 0) or 0
        )
        total_tokens = getattr(raw_usage, "total", 0) or getattr(raw_usage, "totalTokens", 0) or 0
        if total_tokens == 0:
            total_tokens = input_tokens + output_tokens
        return TokenUsage(input=input_tokens, output=output_tokens, total=total_tokens)
    except (AttributeError, TypeError):
        return None


def _compute_latency_ms(start_time: Any, end_time: Any) -> float | None:
    if start_time and end_time:
        try:
            delta = end_time - start_time
            return float(delta.total_seconds() * 1000)
        except (TypeError, AttributeError):
            pass
    return None


# ---------------------------------------------------------------------------
# Tree serialization
# ---------------------------------------------------------------------------


def _serialize_tree_node(
    node: Any,
    max_chars: int | None,
    depth: int = 0,
) -> ObservationNodeResponse:
    # Use SmartAccess on the node directly (delegates to node.observation)
    obs = getattr(node, "observation", node)
    node_id = str(getattr(obs, "id", "") or "")
    name = getattr(obs, "name", None)
    obs_type = getattr(obs, "type", None)
    model = getattr(obs, "model", None)

    # Input/output
    obs_input = getattr(obs, "input", None)
    obs_output = getattr(obs, "output", None)
    obs_input, input_truncated = _truncate_content(obs_input, max_chars)
    obs_output, output_truncated = _truncate_content(obs_output, max_chars)

    # Metadata — convert SmartDict to plain dict for Pydantic
    metadata = _redact_metadata(_to_plain_dict(getattr(obs, "metadata", None)))

    # Usage — try observation first, then node
    raw_usage = getattr(obs, "usage", None)
    usage = _extract_usage(raw_usage)

    # Timing — ObservationNode exposes .start_time / .end_time properties
    start_time = getattr(node, "start_time", None)
    end_time = getattr(node, "end_time", None)

    # Fallback to observation-level startTime/endTime
    if start_time is None:
        start_time = getattr(obs, "startTime", None) or getattr(obs, "start_time", None)
    if end_time is None:
        end_time = getattr(obs, "endTime", None) or getattr(obs, "end_time", None)

    latency_ms = _compute_latency_ms(start_time, end_time)

    # Also check node.duration (timedelta property on ObservationNode)
    if latency_ms is None:
        duration = getattr(node, "duration", None)
        if duration is not None:
            with contextlib.suppress(TypeError, ValueError, AttributeError):
                # duration is a timedelta
                latency_ms = duration.total_seconds() * 1000

    # Recursively serialize children
    children_raw = getattr(node, "children", []) or []
    children = [_serialize_tree_node(child, max_chars, depth + 1) for child in children_raw]

    return ObservationNodeResponse(
        id=node_id,
        name=name,
        type=obs_type,
        model=model,
        input=obs_input,
        output=obs_output,
        input_truncated=input_truncated,
        output_truncated=output_truncated,
        metadata=metadata,
        usage=usage,
        latency_ms=latency_ms,
        start_time=str(start_time) if start_time else None,
        end_time=str(end_time) if end_time else None,
        depth=depth,
        children=children,
    )


def _walk_tree(
    nodes: list[ObservationNodeResponse],
) -> list[ObservationNodeResponse]:
    result: list[ObservationNodeResponse] = []
    for node in nodes:
        result.append(node)
        result.extend(_walk_tree(node.children))
    return result


def _accumulate_tree_tokens(
    nodes: list[ObservationNodeResponse],
) -> tuple[int, int, int, float]:
    total_input = 0
    total_output = 0
    total_total = 0
    total_latency: float = 0

    for node in _walk_tree(nodes):
        # Only count tokens from leaf-ish nodes (GENERATION, TOOL) to avoid double-counting
        if node.type and node.type.upper() in ("GENERATION", "TOOL"):
            if node.usage:
                total_input += node.usage.input
                total_output += node.usage.output
                total_total += node.usage.total
            if node.latency_ms is not None:
                total_latency += node.latency_ms

    return total_input, total_output, total_total, total_latency


# ---------------------------------------------------------------------------
# In-process trace cache
# ---------------------------------------------------------------------------

_CACHE_TTL_SECONDS = 300  # 5 minutes
_CACHE_MAX_ENTRIES = 10

_trace_cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()


def _cache_get(trace_id: str) -> Any | None:
    entry = _trace_cache.get(trace_id)
    if entry is None:
        return None
    collection, ts = entry
    if time.time() - ts > _CACHE_TTL_SECONDS:
        _trace_cache.pop(trace_id, None)
        return None
    # Move to end (most recently used)
    _trace_cache.move_to_end(trace_id)
    return collection


def _cache_put(trace_id: str, collection: Any) -> None:
    _trace_cache[trace_id] = (collection, time.time())
    _trace_cache.move_to_end(trace_id)
    while len(_trace_cache) > _CACHE_MAX_ENTRIES:
        _trace_cache.popitem(last=False)


# ---------------------------------------------------------------------------
# Loader factory
# ---------------------------------------------------------------------------


def _get_loader(agent_name: str | None = None) -> Any:
    if agent_name:
        creds = get_replay_config().langfuse_agents.get(agent_name)
        if not creds:
            raise LangfuseNotConfiguredError(
                f"No Langfuse credentials configured for agent {agent_name!r}. "
                f"Set LANGFUSE_{agent_name.upper()}_PUBLIC_KEY and "
                f"LANGFUSE_{agent_name.upper()}_SECRET_KEY environment variables."
            )
        from axion.tracing import LangfuseTraceLoader

        return LangfuseTraceLoader(
            public_key=creds.public_key,
            secret_key=creds.secret_key,
            host=creds.host,
        )

    # Global fallback
    public_key = settings.langfuse_public_key
    secret_key = settings.langfuse_secret_key
    if not public_key or not secret_key:
        raise LangfuseNotConfiguredError(
            "Langfuse credentials not configured. "
            "Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables."
        )

    from axion.tracing import LangfuseTraceLoader

    return LangfuseTraceLoader(
        public_key=public_key,
        secret_key=secret_key,
        host=settings.langfuse_host,
    )


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


def _serialize_observation(obs: Any, max_chars: int | None) -> ObservationSummary:
    obs_input = getattr(obs, "input", None)
    obs_output = getattr(obs, "output", None)
    raw_metadata = getattr(obs, "metadata", None)

    obs_input, input_truncated = _truncate_content(obs_input, max_chars)
    obs_output, output_truncated = _truncate_content(obs_output, max_chars)

    metadata = _redact_metadata(_to_plain_dict(raw_metadata))

    usage = _extract_usage(getattr(obs, "usage", None))

    start_time = getattr(obs, "startTime", None)
    end_time = getattr(obs, "endTime", None)
    latency_ms = _compute_latency_ms(start_time, end_time)

    return ObservationSummary(
        id=str(getattr(obs, "id", "")),
        name=getattr(obs, "name", None),
        type=getattr(obs, "type", None),
        model=getattr(obs, "model", None),
        input=obs_input,
        output=obs_output,
        input_truncated=input_truncated,
        output_truncated=output_truncated,
        metadata=metadata,
        usage=usage,
        latency_ms=latency_ms,
        start_time=str(start_time) if start_time else None,
        end_time=str(end_time) if end_time else None,
    )


def _serialize_step(step: Any, index: int, max_chars: int | None) -> StepSummary:
    observations = list(step.observations) if hasattr(step, "observations") else []
    serialized_obs = [_serialize_observation(obs, max_chars) for obs in observations]

    # Find generation observation
    generation = None
    obs_types: list[str] = []
    for obs in serialized_obs:
        if obs.type:
            obs_types.append(obs.type)
        if obs.type and obs.type.upper() == "GENERATION" and generation is None:
            generation = obs

    # Extract variables if available
    variables = None
    if hasattr(step, "extract_variables"):
        with contextlib.suppress(Exception):
            variables = step.extract_variables() or None

    return StepSummary(
        name=step.name,
        index=index,
        observation_types=obs_types,
        generation=generation,
        observations=serialized_obs,
        variables=variables,
    )


def _traces_to_summaries(raw_traces: list[Any]) -> list[TraceSummary]:
    from axion.tracing import TraceCollection

    collection = TraceCollection(raw_traces)
    summaries: list[TraceSummary] = []
    for trace in collection:
        step_names = list(trace.step_names) if hasattr(trace, "step_names") else []
        trace_id = str(getattr(trace, "id", ""))
        trace_name = getattr(trace, "name", None)
        tags_list = list(getattr(trace, "tags", []) or [])
        timestamp = getattr(trace, "timestamp", None)

        summaries.append(
            TraceSummary(
                id=trace_id,
                name=trace_name,
                tags=tags_list,
                timestamp=str(timestamp) if timestamp else None,
                step_count=len(step_names),
                step_names=step_names,
            )
        )
    return summaries


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_configured_agents() -> list[str]:
    return sorted(get_replay_config().langfuse_agents.keys())


def get_status() -> ReplayStatusResponse:
    has_global = bool(settings.langfuse_public_key and settings.langfuse_secret_key)
    has_agents = bool(get_replay_config().langfuse_agents)
    configured = has_global or has_agents

    search_fields = [SearchFieldOption(value="trace_id", label="Trace ID")]
    search_db = get_replay_config().search_db
    if search_db.enabled and search_db.is_configured:
        for col_name, col_label in search_db.search_columns.items():
            search_fields.append(SearchFieldOption(value=col_name, label=col_label))

    # Build per-agent search fields
    agent_search_fields: dict[str, list[SearchFieldOption]] = {}
    for agent in get_configured_agents():
        fields = [SearchFieldOption(value="trace_id", label="Trace ID")]
        if search_db.enabled and search_db.is_configured:
            resolved = search_db.get_agent_config(agent)
            for col_name, col_label in resolved.search_columns.items():
                fields.append(SearchFieldOption(value=col_name, label=col_label))
        agent_search_fields[agent] = fields

    return ReplayStatusResponse(
        enabled=settings.agent_replay_enabled,
        configured=configured,
        langfuse_host=settings.langfuse_host,
        default_limit=get_replay_config().default_limit,
        default_days_back=get_replay_config().default_days_back,
        agents=get_configured_agents(),
        search_fields=search_fields,
        agent_search_fields=agent_search_fields,
    )


async def _fetch_summaries_from_matches(
    matches: list[Any],
    fallback_agent: str | None,
) -> list[TraceSummary]:
    """Batch-fetch Langfuse traces for a list of TraceMatch objects.

    Groups matches by effective agent name, fetches each group in one call,
    and converts to TraceSummary list. Partial failures are logged and skipped.
    """
    # Group by effective agent
    groups: dict[str | None, list[str]] = {}
    for match in matches:
        agent = match.agent_name or fallback_agent
        groups.setdefault(agent, []).append(match.trace_id)

    all_summaries: list[TraceSummary] = []

    for agent_name, trace_ids in groups.items():
        try:
            loader = _get_loader(agent_name)
            raw_traces = await asyncio.to_thread(
                loader.fetch_traces,
                trace_ids=trace_ids,
                fetch_full_traces=False,
                show_progress=False,
            )
            all_summaries.extend(_traces_to_summaries(raw_traces))
        except LangfuseNotConfiguredError:
            logger.warning(
                "Skipping agent group %s: Langfuse not configured",
                agent_name,
            )
        except Exception as err:
            logger.warning(
                "Failed to fetch traces for agent group %s: %s",
                agent_name,
                err,
            )

    return all_summaries


async def search_traces(
    query: str,
    agent_name: str | None = None,
    limit: int = 10,
    days_back: int = 30,
    search_by: str = "trace_id",
) -> RecentTracesResponse:
    query = query.strip()
    if not query:
        return RecentTracesResponse(traces=[], total=0)

    if search_by != "trace_id":
        from app.plugins.agent_replay.services.search_db import lookup_trace_ids

        # Backward compat: "field" maps to first configured column
        col = None if search_by == "field" else search_by
        matches = await lookup_trace_ids(
            query, agent_name=agent_name, limit=limit, search_column=col
        )
        if not matches:
            return RecentTracesResponse(traces=[], total=0)
        summaries = await _fetch_summaries_from_matches(matches, agent_name)
        return RecentTracesResponse(traces=summaries, total=len(summaries))

    # trace_id mode — detect pattern for direct lookup vs metadata search
    if _TRACE_ID_PATTERN.match(query):
        try:
            detail = await get_trace_detail(
                trace_id=query,
                agent_name=agent_name,
            )
            summary = TraceSummary(
                id=detail.id,
                name=detail.name,
                tags=detail.tags,
                timestamp=detail.timestamp,
                step_count=len(detail.steps),
                step_names=[s.name for s in detail.steps],
            )
            return RecentTracesResponse(traces=[summary], total=1)
        except ReplayServiceError:
            return RecentTracesResponse(traces=[], total=0)

    # Metadata search
    loader = _get_loader(agent_name)
    metadata_key = get_replay_config().search_metadata_key
    raw_traces = await asyncio.to_thread(
        loader.fetch_traces,
        limit=limit,
        days_back=days_back,
        fetch_full_traces=False,
        show_progress=False,
        metadata={metadata_key: query},
    )

    summaries = _traces_to_summaries(raw_traces)
    return RecentTracesResponse(traces=summaries, total=len(summaries))


async def get_recent_traces(
    limit: int = 20,
    days_back: int = 7,
    name: str | None = None,
    tags: list[str] | None = None,
    agent_name: str | None = None,
) -> RecentTracesResponse:
    loader = _get_loader(agent_name)

    raw_traces = await asyncio.to_thread(
        loader.fetch_traces,
        limit=limit,
        days_back=days_back,
        name=name,
        tags=tags,
        fetch_full_traces=False,
        show_progress=False,
    )

    summaries = _traces_to_summaries(raw_traces)
    return RecentTracesResponse(traces=summaries, total=len(summaries))


async def get_trace_detail(
    trace_id: str,
    max_chars: int = 50000,
    agent_name: str | None = None,
) -> TraceDetailResponse:
    loader = _get_loader(agent_name)

    from axion.tracing import TraceCollection

    raw_traces = await asyncio.to_thread(
        loader.fetch_traces,
        trace_ids=[trace_id],
        show_progress=False,
    )

    if not raw_traces:
        raise ReplayServiceError(f"Trace {trace_id!r} not found")

    collection = TraceCollection(raw_traces)
    _cache_put(trace_id, collection)

    trace = collection[0]
    steps: list[StepSummary] = []
    total_input = 0
    total_output = 0
    total_total = 0
    total_latency_ms: float = 0

    step_names = list(trace.step_names) if hasattr(trace, "step_names") else []
    for idx, step_name in enumerate(step_names):
        step = getattr(trace, step_name, None)
        if step is None:
            step = trace.steps.get(step_name) if hasattr(trace, "steps") else None
        if step is None:
            continue

        step_summary = _serialize_step(step, idx, max_chars)
        steps.append(step_summary)

        # Accumulate tokens
        for obs in step_summary.observations:
            if obs.usage:
                total_input += obs.usage.input
                total_output += obs.usage.output
                total_total += obs.usage.total
            if obs.latency_ms is not None:
                total_latency_ms += obs.latency_ms

    # Sort steps by earliest observation start_time for chronological order
    def _step_sort_key(s: StepSummary) -> tuple[int, datetime]:
        parsed: list[datetime] = []
        for obs in s.observations:
            if obs.start_time:
                with contextlib.suppress(ValueError, TypeError):
                    parsed.append(datetime.fromisoformat(obs.start_time))
        if parsed:
            return (0, min(parsed))
        return (1, datetime.max)

    steps.sort(key=_step_sort_key)
    for i, s in enumerate(steps):
        s.index = i

    trace_name = getattr(trace, "name", None)
    tags_list = list(getattr(trace, "tags", []) or [])
    timestamp = getattr(trace, "timestamp", None)

    # Extract trace-level envelope (input/output/metadata/cost)
    # Convert SmartDict/SmartAccess objects to plain dicts for Pydantic
    raw_input = getattr(trace, "input", None)
    raw_output = getattr(trace, "output", None)
    trace_input: Any = _to_plain_dict(raw_input) if raw_input is not None else None
    if trace_input is None and raw_input is not None:
        trace_input = raw_input  # keep original if not a dict-like
    raw_output_dict = _to_plain_dict(raw_output) if raw_output is not None else None
    trace_output: Any = raw_output_dict if raw_output_dict is not None else raw_output
    trace_metadata = _redact_metadata(_to_plain_dict(getattr(trace, "metadata", None)))
    total_cost: float | None = None
    raw_cost = getattr(trace, "total_cost", None) or getattr(trace, "totalCost", None)
    if raw_cost is not None:
        with contextlib.suppress(TypeError, ValueError):
            total_cost = float(raw_cost)

    # Truncate trace-level content
    trace_input, _ = _truncate_content(trace_input, max_chars)
    trace_output, _ = _truncate_content(trace_output, max_chars)

    # Build observation tree from tree_roots
    tree: list[ObservationNodeResponse] = []
    try:
        tree_roots = trace.tree_roots or []
        logger.info("Tree roots found: %d root(s)", len(tree_roots))
        for root in tree_roots:
            tree.append(_serialize_tree_node(root, max_chars, depth=0))
    except Exception:
        logger.exception("Failed to build observation tree")

    # If tree is available, compute tokens from tree for more accurate totals
    if tree:
        t_in, t_out, t_tot, t_lat = _accumulate_tree_tokens(tree)
        if t_tot > 0:
            total_input, total_output, total_total = t_in, t_out, t_tot
            total_latency_ms = t_lat

    return TraceDetailResponse(
        id=trace_id,
        name=trace_name,
        tags=tags_list,
        timestamp=str(timestamp) if timestamp else None,
        trace_input=trace_input,
        trace_output=trace_output,
        trace_metadata=trace_metadata,
        steps=steps,
        tree=tree,
        total_tokens=TokenUsage(input=total_input, output=total_output, total=total_total),
        total_latency_ms=total_latency_ms if total_latency_ms > 0 else None,
        total_cost=total_cost,
    )


async def get_step_detail(
    trace_id: str,
    step_index: int,
    agent_name: str | None = None,
) -> StepSummary:
    # Try cache first
    collection = _cache_get(trace_id)
    if collection is None:
        # Re-fetch
        loader = _get_loader(agent_name)
        from axion.tracing import TraceCollection

        raw_traces = await asyncio.to_thread(
            loader.fetch_traces,
            trace_ids=[trace_id],
            show_progress=False,
        )
        if not raw_traces:
            raise ReplayServiceError(f"Trace {trace_id!r} not found")
        collection = TraceCollection(raw_traces)
        _cache_put(trace_id, collection)

    trace = collection[0]
    step_names = list(trace.step_names) if hasattr(trace, "step_names") else []

    if step_index < 0 or step_index >= len(step_names):
        raise StepNotFoundError(
            f"Step index {step_index} out of range (trace has {len(step_names)} steps)"
        )

    step_name = step_names[step_index]
    step = getattr(trace, step_name, None)
    if step is None:
        step = trace.steps.get(step_name) if hasattr(trace, "steps") else None
    if step is None:
        raise StepNotFoundError(f"Step {step_name!r} not found in trace")

    # Soft cap at 500K chars for full content
    return _serialize_step(step, step_index, max_chars=500000)


def _find_tree_node(roots: list[Any], node_id: str) -> Any | None:
    for root in roots:
        obs = getattr(root, "observation", root)
        obs_id = str(getattr(obs, "id", "") or getattr(root, "id", ""))
        if obs_id == node_id:
            return root
        children = getattr(root, "children", []) or []
        found = _find_tree_node(children, node_id)
        if found is not None:
            return found
    return None


async def get_node_detail(
    trace_id: str,
    node_id: str,
    agent_name: str | None = None,
) -> ObservationNodeResponse:
    collection = _cache_get(trace_id)
    if collection is None:
        loader = _get_loader(agent_name)
        from axion.tracing import TraceCollection

        raw_traces = await asyncio.to_thread(
            loader.fetch_traces,
            trace_ids=[trace_id],
            show_progress=False,
        )
        if not raw_traces:
            raise ReplayServiceError(f"Trace {trace_id!r} not found")
        collection = TraceCollection(raw_traces)
        _cache_put(trace_id, collection)

    trace = collection[0]
    tree_roots = getattr(trace, "tree_roots", None) or []
    node = _find_tree_node(tree_roots, node_id)

    if node is None:
        raise NodeNotFoundError(f"Node {node_id!r} not found in trace {trace_id!r}")

    return _serialize_tree_node(node, max_chars=500000)
