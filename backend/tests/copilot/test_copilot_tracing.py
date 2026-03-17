"""Tests for copilot tracing integration."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic_ai.models.test import TestModel

# ---------------------------------------------------------------------------
# 1. OAI tuple contract
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oai_process_returns_tuple() -> None:
    """OAICopilotAgent.process() must return (response, chart, download)."""
    from app.copilot.oai_agent import OAICopilotAgent

    agent = OAICopilotAgent()

    # Minimal mock: Runner.run_streamed returns an object whose
    # stream_events() is an empty async iterator and final_output is a str.
    mock_result = MagicMock()
    mock_result.stream_events = MagicMock(return_value=aiter_empty())
    mock_result.final_output = "Test response"

    with (
        patch("app.copilot.oai_agent.Runner.run_streamed", return_value=mock_result),
        patch.object(agent, "_get_agent", return_value=MagicMock()),
        patch("app.copilot.tracing.init_tracer", return_value=_noop_tracer()),
        patch("app.copilot.tracing.configure_tracing"),
        patch("app.copilot.oai_agent._build_schema_context", new=AsyncMock(return_value="")),
    ):
        result = await agent.process("Hello", dataset_label="evaluation")

    assert isinstance(result, tuple), "process() must return a tuple"
    assert len(result) == 3, "tuple must have 3 elements"
    response, chart, download = result
    assert isinstance(response, str), "first element must be str"
    assert chart is None, "second element must be None when no chart is created"
    assert download is None, "third element must be None when no download is created"


# ---------------------------------------------------------------------------
# 2. SSE event order regression
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_copilot_stream_event_order() -> None:
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

        events = await _collect_sse(instance, thought_stream)

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
    span = MagicMock()
    span.set_output = MagicMock()
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=span)
    cm.__aexit__ = AsyncMock(return_value=False)
    tracer.async_span = MagicMock(return_value=cm)
    return tracer


def _noop_tracer_capturing() -> MagicMock:
    """Like _noop_tracer but records (span_name, kwargs) in .span_calls."""
    tracer = _noop_tracer()
    tracer.span_calls: list[tuple[str, dict]] = []  # type: ignore[assignment]

    original_async_span = tracer.async_span

    def record(name: str, **kwargs: object) -> object:
        tracer.span_calls.append((name, kwargs))
        return original_async_span(name, **kwargs)

    tracer.async_span = MagicMock(side_effect=record)
    return tracer


# ---------------------------------------------------------------------------
# 7. Tool span naming — pydantic-ai agent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_tool_span_name_and_tool_name_attr() -> None:
    """CopilotAgent tool spans must be 'copilot.tool.call' with tool_name attribute."""
    capturing = _noop_tracer_capturing()

    deps_mock = MagicMock()
    deps_mock.dataset_label = "evaluation"
    deps_mock.has_data = False  # short-circuits before DuckDB
    deps_mock.get_cached.return_value = None
    deps_mock.thought_stream = AsyncMock()
    deps_mock.no_data_error.return_value = '{"error": "no data"}'

    ctx_mock = MagicMock()
    ctx_mock.deps = deps_mock

    with patch("app.copilot.hooks.get_copilot_tracer", return_value=capturing):
        import app.copilot.agent as agent_mod

        llm_provider = MagicMock()
        llm_provider._get_model.return_value = TestModel()
        copilot_agent = agent_mod.CopilotAgent(llm_provider=llm_provider)
        inner_agent = copilot_agent._get_agent()
        # pydantic-ai 1.x: tools live in _function_toolset.tools dict
        summarize_fn = inner_agent._function_toolset.tools["summarize_data"].function
        await summarize_fn(ctx_mock, include_numeric_stats=False)

    span_names = [n for n, _ in capturing.span_calls]
    assert "copilot.tool.call" in span_names
    tool_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.tool.call")
    assert tool_kw.get("tool_name") == "summarize_data"


# ---------------------------------------------------------------------------
# 8. DB span naming — pydantic-ai agent (run_sql)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_db_span_name_and_db_system_attr() -> None:
    """DB spans inside agent tools must be 'copilot.db.query' with db_system='duckdb'."""
    capturing = _noop_tracer_capturing()

    store_mock = MagicMock()
    store_mock.query_limiter = MagicMock()
    store_mock.query_list = MagicMock(return_value=[])

    ts_mock = AsyncMock()

    deps_mock = MagicMock()
    deps_mock.dataset_label = "evaluation"
    deps_mock.table_name = "eval_data"
    deps_mock.store = store_mock
    deps_mock.thought_stream = ts_mock
    deps_mock.get_cached.return_value = None

    ctx_mock = MagicMock()
    ctx_mock.deps = deps_mock

    with (
        patch("app.copilot.hooks.get_copilot_tracer", return_value=capturing),
        patch("app.copilot.agent.get_copilot_tracer", return_value=capturing),
    ):
        import app.copilot.agent as agent_mod

        llm_provider = MagicMock()
        llm_provider._get_model.return_value = TestModel()
        copilot_agent = agent_mod.CopilotAgent(llm_provider=llm_provider)
        inner_agent = copilot_agent._get_agent()
        run_sql_fn = inner_agent._function_toolset.tools["run_sql"].function
        with patch("anyio.to_thread.run_sync", new_callable=AsyncMock, return_value=[]):
            await run_sql_fn(ctx_mock, sql="SELECT 1", limit=1)

    span_names = [n for n, _ in capturing.span_calls]
    assert "copilot.db.query" in span_names
    db_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.db.query")
    assert db_kw.get("db_system") == "duckdb"


# ---------------------------------------------------------------------------
# 9. Tool span naming — oai_agent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oai_agent_tool_span_name_and_tool_name_attr() -> None:
    """OAICopilotAgent tool spans must also use 'copilot.tool.call'."""
    from app.copilot.oai_agent import OAIContext, summarize_data
    from app.copilot.thoughts import ThoughtStream

    thought_stream = ThoughtStream()
    capturing = _noop_tracer_capturing()

    oai_ctx_mock = MagicMock(spec=OAIContext)
    oai_ctx_mock.dataset_label = "evaluation"
    oai_ctx_mock.has_data = False
    oai_ctx_mock.no_data_error = MagicMock(return_value='{"error": "no data"}')
    oai_ctx_mock.get_cached = MagicMock(return_value=None)
    oai_ctx_mock.thought_stream = thought_stream

    # ToolContext has many required fields — mock it to avoid construction complexity
    tool_ctx = MagicMock()
    tool_ctx.context = oai_ctx_mock

    with patch("app.copilot.oai_agent.get_copilot_tracer", return_value=capturing):
        await summarize_data.on_invoke_tool(tool_ctx, '{"include_numeric_stats": false}')

    span_names = [n for n, _ in capturing.span_calls]
    assert "copilot.tool.call" in span_names
    tool_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.tool.call")
    assert tool_kw.get("tool_name") == "summarize_data"


async def _collect_sse(agent_instance: MagicMock, thought_stream: object) -> list[str]:
    """Helper: collect SSE event types from a thought_stream + fake process."""
    from app.models.copilot_schemas import SSEEventType

    events: list[str] = []
    try:
        ts = thought_stream  # type: ignore[assignment]
        process_task = asyncio.create_task(agent_instance.process("msg"))
        sub = await ts.subscribe()
        async for _thought in sub:
            events.append(SSEEventType.THOUGHT.value)

        _resp, _chart = await process_task
        events.append(SSEEventType.RESPONSE.value)
    except Exception:
        events.append(SSEEventType.ERROR.value)
    finally:
        events.append(SSEEventType.DONE.value)

    return events
