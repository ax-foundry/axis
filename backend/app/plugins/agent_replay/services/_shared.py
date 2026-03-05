from __future__ import annotations

import json
import logging
import re
import time
from collections import OrderedDict
from typing import Any

from app.config.env import settings
from app.plugins.agent_replay.config import get_replay_config
from app.plugins.agent_replay.models.replay_schemas import TokenUsage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class LangfuseNotConfiguredError(Exception):
    """Langfuse credentials are missing or invalid."""


class ReplayServiceError(Exception):
    """General replay service error (e.g. trace not found)."""


class StepNotFoundError(Exception):
    """Step index out of range or step missing from trace."""


class NodeNotFoundError(Exception):
    """Observation node not found in the trace tree."""


# ---------------------------------------------------------------------------
# Metadata redaction
# ---------------------------------------------------------------------------

SENSITIVE_KEY_PATTERN = re.compile(
    r"(?:^|[_-])(?:api[_-]?key|token|secret|password|credential|authorization|bearer)(?:$|[_-])",
    re.IGNORECASE,
)


def redact_metadata(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
    """Recursively redact sensitive keys from a metadata dict."""
    if metadata is None:
        return None
    redacted: dict[str, Any] = {}
    for key, value in metadata.items():
        if SENSITIVE_KEY_PATTERN.search(key):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = redact_metadata(value)
        else:
            redacted[key] = value
    return redacted


def redact_value(value: str) -> str:
    """Redact a string if it looks like a sensitive credential."""
    if SENSITIVE_KEY_PATTERN.search(value):
        return "[REDACTED]"
    return value


# ---------------------------------------------------------------------------
# Content truncation
# ---------------------------------------------------------------------------


def truncate_content(content: Any, max_chars: int | None) -> tuple[Any, bool]:
    """Truncate content to max_chars. Returns (content, was_truncated)."""
    if max_chars is None or content is None:
        return content, False

    if isinstance(content, str):
        if len(content) > max_chars:
            return content[:max_chars] + " [...truncated]", True
        return content, False

    try:
        serialized = json.dumps(content, default=str)
        if len(serialized) > max_chars:
            return serialized[:max_chars] + " [...truncated]", True
        return content, False
    except (TypeError, ValueError):
        return content, False


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------


def to_plain_dict(obj: Any) -> dict[str, Any] | None:
    """Convert SmartDict/SmartAccess objects to plain dicts."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    raw = getattr(obj, "_data", None)
    if isinstance(raw, dict):
        return dict(raw)
    try:
        return dict(json.loads(json.dumps(obj, default=str)))
    except Exception:
        return None


def extract_usage(raw_usage: Any) -> TokenUsage | None:
    """Extract TokenUsage from a Langfuse usage object."""
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


def compute_latency_ms(start_time: Any, end_time: Any) -> float | None:
    """Compute latency in milliseconds from two timestamps."""
    if start_time and end_time:
        try:
            delta = end_time - start_time
            return float(delta.total_seconds() * 1000)
        except (TypeError, AttributeError):
            pass
    return None


# ---------------------------------------------------------------------------
# Tree search
# ---------------------------------------------------------------------------


def find_tree_node(roots: list[Any], node_id: str) -> Any | None:
    """Recursively search for a node by ID in a tree of observation nodes."""
    for root in roots:
        obs = getattr(root, "observation", root)
        obs_id = str(getattr(obs, "id", "") or getattr(root, "id", ""))
        if obs_id == node_id:
            return root
        children = getattr(root, "children", []) or []
        found = find_tree_node(children, node_id)
        if found is not None:
            return found
    return None


# ---------------------------------------------------------------------------
# In-process trace cache (agent-aware keys)
# ---------------------------------------------------------------------------

_CACHE_TTL_SECONDS = 300  # 5 minutes
_CACHE_MAX_ENTRIES = 10

_trace_cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()


def _cache_key(trace_id: str, agent_name: str | None = None) -> str:
    """Build an agent-aware cache key."""
    if agent_name:
        return f"{agent_name}:{trace_id}"
    return trace_id


def cache_get(trace_id: str, agent_name: str | None = None) -> Any | None:
    """Get a trace collection from cache (LRU with TTL)."""
    key = _cache_key(trace_id, agent_name)
    entry = _trace_cache.get(key)
    if entry is None:
        return None
    collection, ts = entry
    if time.time() - ts > _CACHE_TTL_SECONDS:
        _trace_cache.pop(key, None)
        return None
    _trace_cache.move_to_end(key)
    return collection


def cache_put(trace_id: str, collection: Any, agent_name: str | None = None) -> None:
    """Put a trace collection into cache (LRU with max size)."""
    key = _cache_key(trace_id, agent_name)
    _trace_cache[key] = (collection, time.time())
    _trace_cache.move_to_end(key)
    while len(_trace_cache) > _CACHE_MAX_ENTRIES:
        _trace_cache.popitem(last=False)


# ---------------------------------------------------------------------------
# Loader factory
# ---------------------------------------------------------------------------


def get_loader(agent_name: str | None = None) -> Any:
    """Create a LangfuseTraceLoader for the given agent (or global fallback)."""
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
