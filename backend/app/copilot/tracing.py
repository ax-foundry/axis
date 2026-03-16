"""Axion tracing helpers for the AI copilot layer.

Auto-configures on first use; resolves to noop if no tracing provider is set.

Usage::

    # In router (once per request) — fresh isolated root tracer:
    tracer = get_request_tracer(route_name="copilot.stream")

    # In agent/tools — inherits the current context tracer:
    tracer = get_copilot_tracer()
"""

import hashlib
import logging
import os
import threading
from functools import lru_cache
from typing import Any

from axion.tracing import (  # noqa: F401 (re-export BaseSpan)
    BaseSpan,
    configure_tracing,
    init_tracer,
    is_tracing_configured,
)

logger = logging.getLogger("axis.copilot.tracing")

_configure_lock = threading.Lock()
_configured = False


@lru_cache(maxsize=1)
def _copilot_name() -> str:
    """Return the copilot display name from branding config (e.g. 'Echo')."""
    try:
        from app.config.theme import theme_config

        return theme_config.branding.copilot_name
    except Exception:
        return "Copilot"


def _ensure_configured() -> None:
    """Call configure_tracing() exactly once (thread-safe)."""
    global _configured
    if _configured:
        return
    with _configure_lock:
        if _configured:
            return

        # Log env var presence at INFO so it's visible without DEBUG logging
        _mode = os.environ.get("TRACING_MODE", "")
        _pub = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        _sec = os.environ.get("LANGFUSE_SECRET_KEY", "")
        _url = os.environ.get("LANGFUSE_BASE_URL", "")
        logger.info(
            "Copilot tracing init — TRACING_MODE=%r  PUBLIC_KEY=%s  SECRET_KEY=%s  BASE_URL=%r",
            _mode or "(not set)",
            f"{_pub[:8]}..." if _pub else "(not set)",
            f"{_sec[:8]}..." if _sec else "(not set)",
            _url or "(not set, default=https://cloud.langfuse.com)",
        )

        configure_tracing()  # auto-detects provider from env; falls back to noop

        # Report which provider was actually selected
        try:
            from axion._core.tracing.config import _tracer_instance

            provider = getattr(_tracer_instance, "_tracing_provider", "unknown")
        except Exception:
            provider = "unknown"
        logger.info("Copilot tracing configured — provider=%r", provider)

        _configured = True


def get_request_tracer(
    route_name: str,
    trace_id: str | None = None,
    environment: str | None = None,
    session_id: str | None = None,
    user_id: str | None = None,
) -> Any:
    """Create a fresh root tracer for a single copilot request.

    Uses force_new=True to guarantee per-request isolation — never inherits
    a stale global or context tracer from a previous request.

    Args:
        route_name: The route identifier added as a tag (e.g. "copilot.stream").
        trace_id: Optional external trace ID to correlate with upstream systems.
        environment: Optional deployment environment label (e.g. "production").
        session_id: Optional session ID to group traces from the same chat thread.
        user_id: Authenticated user identifier. Already transformed per user_id_mode
                 before being passed here. Sourced from x-axis-user-id header (proxy)
                 or CopilotRequest.user_id (non-proxied callers).

    Returns:
        A fresh root tracer instance.
    """
    _ensure_configured()
    tracer = init_tracer(
        "llm",
        force_new=True,
        tags=[_copilot_name(), route_name],
        trace_id=trace_id,
        environment=environment,
        session_id=session_id,
        user_id=user_id,
    )
    _client_ok = bool(getattr(tracer, "_client", None))
    logger.info(
        "Request tracer created — route=%r  type=%s  client_initialized=%s",
        route_name,
        type(tracer).__name__,
        _client_ok,
    )
    return tracer


def get_copilot_tracer() -> Any:
    """Return a tracer for nested copilot scopes (agent, tools, SQL).

    No force_new — inherits the current context tracer set by get_request_tracer()
    so spans automatically nest under the request root.

    Returns:
        A tracer that inherits the current request context.
    """
    _ensure_configured()
    return init_tracer("llm")


def sql_fingerprint(sql: str) -> str:
    """Return an 8-char SHA-1 hash of the SQL string.

    Never logs raw SQL text to avoid leaking schema details or user-supplied
    filter values into the trace backend.

    Args:
        sql: The SQL statement to fingerprint.

    Returns:
        An 8-character hex string.
    """
    return hashlib.sha1(sql.encode(), usedforsecurity=False).hexdigest()[:8]


def safe_span_attrs(**kw: Any) -> dict[str, Any]:
    """Return attrs dict with None values removed (Axion rejects None attrs).

    Args:
        **kw: Span attribute key-value pairs.

    Returns:
        Dict with None values stripped.
    """
    return {k: v for k, v in kw.items() if v is not None}
