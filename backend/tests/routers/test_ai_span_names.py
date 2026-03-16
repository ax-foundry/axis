"""Tests: root span name normalization in ai.py router."""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def _capturing_tracer() -> MagicMock:
    """Tracer mock that records (name, kwargs) for each async_span call."""
    tracer = MagicMock()
    tracer.add_trace = MagicMock()
    tracer.complete = MagicMock()
    tracer.fail = MagicMock()
    tracer.span_calls: list[tuple[str, dict]] = []  # type: ignore[assignment]

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=MagicMock())
    cm.__aexit__ = AsyncMock(return_value=False)

    def record(name: str, **kwargs: object) -> object:
        tracer.span_calls.append((name, kwargs))
        return cm

    tracer.async_span = MagicMock(side_effect=record)
    return tracer


def test_root_span_is_pipeline_with_route_name() -> None:
    """copilot_stream root span must be 'copilot.pipeline' with route_name='copilot.stream'."""
    from app.main import app

    capturing = _capturing_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", return_value=capturing),
        patch("app.routers.ai.CopilotAgent") as MockAgent,
        patch("app.routers.ai.ThoughtStream") as MockTS,
    ):
        instance = MockAgent.return_value
        instance.is_configured = True
        instance.process = AsyncMock(return_value=("response", None))

        mock_sub = AsyncMock()
        mock_sub.__aiter__ = lambda self: self
        mock_sub.__anext__ = AsyncMock(side_effect=StopAsyncIteration)
        MockTS.return_value.subscribe = AsyncMock(return_value=mock_sub)
        MockTS.return_value.thoughts = []

        client = TestClient(app)
        client.post("/api/ai/copilot/stream", json={"message": "hi"})

    span_names = [name for name, _ in capturing.span_calls]
    assert "copilot.pipeline" in span_names

    pipeline_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.pipeline")
    assert pipeline_kw.get("route_name") == "copilot.stream"


def test_oai_root_span_is_pipeline_with_route_name() -> None:
    """copilot_stream_oai root span must be 'copilot.pipeline' with route_name='copilot.stream.oai'."""
    from app.main import app

    capturing = _capturing_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", return_value=capturing),
        patch("app.routers.ai.OAICopilotAgent") as MockAgent,
        patch("app.routers.ai.ThoughtStream") as MockTS,
    ):
        instance = MockAgent.return_value
        instance.is_configured = True
        instance.process = AsyncMock(return_value=("response", None))

        mock_sub = AsyncMock()
        mock_sub.__aiter__ = lambda self: self
        mock_sub.__anext__ = AsyncMock(side_effect=StopAsyncIteration)
        MockTS.return_value.subscribe = AsyncMock(return_value=mock_sub)
        MockTS.return_value.thoughts = []

        client = TestClient(app)
        client.post("/api/ai/copilot/stream/oai", json={"message": "hi"})

    span_names = [name for name, _ in capturing.span_calls]
    assert "copilot.pipeline" in span_names

    pipeline_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.pipeline")
    assert pipeline_kw.get("route_name") == "copilot.stream.oai"


def test_chat_root_span_is_pipeline_with_route_name() -> None:
    """copilot_chat root span must be 'copilot.pipeline' with route_name='copilot.chat'."""
    from app.main import app

    capturing = _capturing_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", return_value=capturing),
        patch("app.routers.ai.CopilotAgent") as MockAgent,
        patch("app.routers.ai.ThoughtStream") as MockTS,
    ):
        instance = MockAgent.return_value
        instance.is_configured = True
        instance.process = AsyncMock(return_value=("response", None))
        MockTS.return_value.thoughts = []

        client = TestClient(app)
        client.post("/api/ai/copilot/chat", json={"message": "hi"})

    span_names = [name for name, _ in capturing.span_calls]
    assert "copilot.pipeline" in span_names

    pipeline_kw = next(kw for n, kw in capturing.span_calls if n == "copilot.pipeline")
    assert pipeline_kw.get("route_name") == "copilot.chat"
