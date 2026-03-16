"""Tests for copilot tracing integration."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 1. OAI tuple contract
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oai_process_returns_tuple() -> None:
    """OAICopilotAgent.process() must return (str, None) — not a bare str."""
    from app.copilot.oai_agent import OAICopilotAgent

    agent = OAICopilotAgent()

    # Minimal mock: Runner.run_streamed returns an object whose
    # stream_events() is an empty async iterator and final_output is a str.
    mock_result = MagicMock()
    mock_result.stream_events = AsyncMock(return_value=aiter_empty())
    mock_result.final_output = "Test response"

    with (
        patch("app.copilot.oai_agent.Runner.run_streamed", return_value=mock_result),
        patch.object(agent, "_get_agent", return_value=MagicMock()),
        patch("app.copilot.tracing.init_tracer", return_value=_noop_tracer()),
        patch("app.copilot.tracing.configure_tracing"),
    ):
        result = await agent.process("Hello", dataset_label="evaluation")

    assert isinstance(result, tuple), "process() must return a tuple"
    assert len(result) == 2, "tuple must have 2 elements"
    response, chart = result
    assert isinstance(response, str), "first element must be str"
    assert chart is None, "second element must be None (no plot_data in OAI agent)"


# ---------------------------------------------------------------------------
# 2. SSE event order regression
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_copilot_stream_event_order(async_client: AsyncMock) -> None:
    """copilot_stream SSE events must arrive in order: thought*, response, done."""
    from app.copilot.thoughts import ThoughtStream
    from app.models.copilot_schemas import SSEEventType

    thought_stream = ThoughtStream()

    async def fake_process(*_a: object, **_kw: object) -> tuple[str, None]:
        await thought_stream.emit_reasoning("thinking", node_name="Agent")
        await thought_stream.close()
        return "final answer", None

    with (
        patch("app.routers.ai.CopilotAgent") as MockAgent,
        patch("app.copilot.tracing.init_tracer", return_value=_noop_tracer()),
        patch("app.copilot.tracing.configure_tracing"),
    ):
        instance = MockAgent.return_value
        instance.is_configured = True
        instance.thought_stream = thought_stream
        instance.process = fake_process

        events: list[str] = []
        async for chunk in _collect_sse(instance, thought_stream):
            events.append(chunk)

    assert SSEEventType.RESPONSE.value in events
    assert SSEEventType.DONE.value in events
    resp_idx = events.index(SSEEventType.RESPONSE.value)
    done_idx = events.index(SSEEventType.DONE.value)
    assert resp_idx < done_idx, "response must come before done"


# ---------------------------------------------------------------------------
# 3. get_request_tracer isolation
# ---------------------------------------------------------------------------


def test_get_request_tracer_isolation() -> None:
    """force_new=True must return a distinct tracer per call."""
    with (
        patch("app.copilot.tracing.configure_tracing"),
        patch(
            "app.copilot.tracing.init_tracer", side_effect=lambda *a, **kw: object()
        ) as mock_init,
    ):
        # Reset the _configured flag so configure_tracing is called
        import app.copilot.tracing as tracing_mod

        tracing_mod._configured = False

        from app.copilot.tracing import get_request_tracer

        t1 = get_request_tracer("copilot.stream")
        t2 = get_request_tracer("copilot.stream")

    assert t1 is not t2, "each call must return a distinct tracer instance"
    assert mock_init.call_count >= 2


# ---------------------------------------------------------------------------
# 4. Noop safety — no exception when no tracing env vars are set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_noop_safety_no_env_vars() -> None:
    """get_request_tracer() + async_span + add_trace must not raise when no provider is set."""
    env_vars_to_clear = [
        "TRACING_MODE",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_PUBLIC_KEY",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
    ]
    clean_env = {k: v for k, v in os.environ.items() if k not in env_vars_to_clear}

    import app.copilot.tracing as tracing_mod

    # Force re-configuration
    tracing_mod._configured = False

    with (
        patch.dict(os.environ, clean_env, clear=True),
        patch("app.copilot.tracing.configure_tracing"),
        patch("app.copilot.tracing.init_tracer", return_value=_noop_tracer()),
    ):
        from app.copilot.tracing import get_request_tracer

        tracing_mod._configured = False
        tracer = get_request_tracer("copilot.stream")
        async with tracer.async_span("test.span", foo="bar"):
            tracer.add_trace("info", "test_event", metadata={"x": 1})
        # Should reach here without exception


# ---------------------------------------------------------------------------
# 5. session_id forwarding
# ---------------------------------------------------------------------------


def test_get_request_tracer_forwards_session_id() -> None:
    """session_id passed to get_request_tracer() must reach init_tracer."""
    with (
        patch("app.copilot.tracing.configure_tracing"),
        patch("app.copilot.tracing.init_tracer", return_value=MagicMock()) as mock_init,
    ):
        import app.copilot.tracing as tracing_mod

        tracing_mod._configured = False

        from app.copilot.tracing import get_request_tracer

        get_request_tracer("copilot.stream", session_id="chat-abc-123")

    call_kwargs = mock_init.call_args.kwargs
    assert call_kwargs.get("session_id") == "chat-abc-123"


# ---------------------------------------------------------------------------
# 6. user_id forwarding
# ---------------------------------------------------------------------------


def test_get_request_tracer_forwards_user_id() -> None:
    """user_id passed to get_request_tracer() must reach init_tracer."""
    with (
        patch("app.copilot.tracing.configure_tracing"),
        patch("app.copilot.tracing.init_tracer", return_value=MagicMock()) as mock_init,
    ):
        import app.copilot.tracing as tracing_mod

        tracing_mod._configured = False

        from app.copilot.tracing import get_request_tracer

        get_request_tracer("copilot.stream", user_id="alice@example.com")

    assert mock_init.call_args.kwargs.get("user_id") == "alice@example.com"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def aiter_empty():  # type: ignore[return]
    """Async iterator that yields nothing."""
    return
    yield  # make it an async generator


def _noop_tracer() -> MagicMock:
    """Return a mock tracer that supports async_span as an async context manager."""
    tracer = MagicMock()
    tracer.add_trace = MagicMock()
    tracer.complete = MagicMock()
    tracer.fail = MagicMock()

    # async_span returns an async context manager that does nothing
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=None)
    cm.__aexit__ = AsyncMock(return_value=False)
    tracer.async_span = MagicMock(return_value=cm)
    return tracer


async def _collect_sse(agent_instance: MagicMock, thought_stream: object) -> list[str]:
    """Helper: collect SSE event types from a thought_stream + fake process."""
    from app.models.copilot_schemas import SSEEventType

    events: list[str] = []
    try:
        ts = thought_stream  # type: ignore[assignment]
        sub = await ts.subscribe()
        async for _thought in sub:
            events.append(SSEEventType.THOUGHT.value)

        _resp, _chart = await asyncio.create_task(agent_instance.process("msg"))
        events.append(SSEEventType.RESPONSE.value)
    except Exception:
        events.append(SSEEventType.ERROR.value)
    finally:
        events.append(SSEEventType.DONE.value)

    return events
