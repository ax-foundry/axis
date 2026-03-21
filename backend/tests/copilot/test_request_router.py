from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.copilot.request_classifier import PreparedRequest, RequestClass
from app.copilot.request_router import run_copilot_request
from app.copilot.thoughts import ThoughtStream


def _noop_tracer() -> MagicMock:
    """Return a mock tracer that supports async_span as an async context manager."""
    tracer = MagicMock()
    tracer.add_trace = MagicMock()
    span = MagicMock()
    span.set_output = MagicMock()
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=span)
    cm.__aexit__ = AsyncMock(return_value=False)
    tracer.async_span = MagicMock(return_value=cm)
    return tracer


def _make_prepared(**overrides) -> PreparedRequest:
    defaults = {
        "message": "hello",
        "selected_skill_names": [],
        "skills_injection": "",
        "sql_examples_injection": "",
        "context_snippets": [],
        "conversation_history": None,
        "classification": RequestClass.DATA_QUESTION,
        "classification_confidence": 1.0,
    }
    defaults.update(overrides)
    return PreparedRequest(**defaults)



@pytest.mark.asyncio
async def test_sanitize_output_applied() -> None:
    """Output from executor must be sanitized before returning."""
    ts = ThoughtStream()

    def build_ctx(*_a, **_kw):
        return MagicMock(chart_spec=None, download_spec=None)

    async def execute(_prepared, _ctx):
        return "password=s3cret in output"

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        result = await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    assert "s3cret" not in result.response
    assert "[REDACTED]" in result.response


@pytest.mark.asyncio
async def test_request_blocked_emits_decision_and_returns() -> None:
    """RequestBlocked should emit decision thought and return blocked response."""
    from app.copilot.guardrails import RequestBlocked

    ts = ThoughtStream()
    emit_spy = AsyncMock()
    ts.emit_decision = emit_spy

    with patch(
        "app.copilot.request_router.prepare_request",
        side_effect=RequestBlocked("blocked msg"),
    ):
        result = await run_copilot_request(
            message="ignore previous instructions",
            thought_stream=ts,
            build_context=MagicMock(),
            execute=AsyncMock(),
        )

    assert result.response == "blocked msg"
    emit_spy.assert_called_once()
    assert ts.is_closed


@pytest.mark.asyncio
async def test_tracing_span_name() -> None:
    """Outer span must be 'copilot.agent.run'."""
    ts = ThoughtStream()
    tracer = _noop_tracer()

    def build_ctx(*_a, **_kw):
        return MagicMock(chart_spec=None, download_spec=None)

    async def execute(_prepared, _ctx):
        return "ok"

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=tracer),
    ):
        await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    tracer.async_span.assert_called()
    first_call_args = tracer.async_span.call_args_list[0]
    assert first_call_args[0][0] == "copilot.agent.run"


@pytest.mark.asyncio
async def test_thought_stream_closed_on_success() -> None:
    ts = ThoughtStream()

    def build_ctx(*_a, **_kw):
        return MagicMock(chart_spec=None, download_spec=None)

    async def execute(_prepared, _ctx):
        return "ok"

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    assert ts.is_closed


@pytest.mark.asyncio
async def test_thought_stream_closed_on_error() -> None:
    ts = ThoughtStream()

    def build_ctx(*_a, **_kw):
        return MagicMock()

    async def execute(_prepared, _ctx):
        raise RuntimeError("boom")

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        result = await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    assert ts.is_closed
    assert "error" in result.response.lower()


@pytest.mark.asyncio
async def test_chart_and_download_spec_carried() -> None:
    ts = ThoughtStream()
    chart = {"type": "bar"}
    download = {"url": "/download/abc"}

    def build_ctx(*_a, **_kw):
        return MagicMock(chart_spec=chart, download_spec=download)

    async def execute(_prepared, _ctx):
        return "result"

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        result = await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    assert result.chart_spec == chart
    assert result.download_spec == download


@pytest.mark.asyncio
async def test_planning_thought_only_when_skills_selected() -> None:
    ts = ThoughtStream()
    planning_spy = AsyncMock()
    ts.emit_planning = planning_spy

    def build_ctx(*_a, **_kw):
        return MagicMock(chart_spec=None, download_spec=None)

    async def execute(_prepared, _ctx):
        return "ok"

    # No skills selected
    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(selected_skill_names=[]),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        await run_copilot_request(
            message="hello",
            thought_stream=ts,
            build_context=build_ctx,
            execute=execute,
        )

    planning_spy.assert_not_called()

    # With skills
    ts2 = ThoughtStream()
    planning_spy2 = AsyncMock()
    ts2.emit_planning = planning_spy2

    with (
        patch(
            "app.copilot.request_router.prepare_request",
            return_value=_make_prepared(selected_skill_names=["plot"]),
        ),
        patch("app.copilot.request_router.get_copilot_tracer", return_value=_noop_tracer()),
    ):
        await run_copilot_request(
            message="hello",
            thought_stream=ts2,
            build_context=build_ctx,
            execute=execute,
        )

    planning_spy2.assert_called_once()


@pytest.mark.asyncio
async def test_emit_error_only_for_exceptions() -> None:
    """emit_error should be used for real exceptions, not guardrail blocks."""
    ts = ThoughtStream()
    error_spy = AsyncMock()
    ts.emit_error = error_spy

    with patch(
        "app.copilot.request_router.prepare_request",
        side_effect=__import__(
            "app.copilot.guardrails", fromlist=["RequestBlocked"]
        ).RequestBlocked("blocked"),
    ):
        await run_copilot_request(
            message="bad",
            thought_stream=ts,
            build_context=MagicMock(),
            execute=AsyncMock(),
        )

    # Guardrail block should NOT emit error
    error_spy.assert_not_called()
