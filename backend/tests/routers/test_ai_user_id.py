"""Integration tests: x-axis-user-id header wiring in ai.py router."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config.constants import Headers


def _noop_tracer() -> MagicMock:
    """Minimal mock tracer that satisfies the router's async_span usage."""
    from unittest.mock import AsyncMock

    tracer = MagicMock()
    tracer.add_trace = MagicMock()
    tracer.complete = MagicMock()
    tracer.fail = MagicMock()
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=MagicMock())
    cm.__aexit__ = AsyncMock(return_value=False)
    tracer.async_span = MagicMock(return_value=cm)
    return tracer


def test_copilot_stream_uses_header_user_id() -> None:
    """Header x-axis-user-id wins over body user_id."""
    from app.main import app

    captured: dict[str, object] = {}

    def fake_tracer(route_name: str, **kwargs: object) -> MagicMock:
        captured.update(kwargs)
        return _noop_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", side_effect=fake_tracer),
        patch("app.routers.ai.CopilotAgent") as MockAgent,
    ):
        instance = MockAgent.return_value
        instance.is_configured = False

        client = TestClient(app)
        client.post(
            "/api/ai/copilot/stream",
            json={"message": "hi", "user_id": "body@example.com"},
            headers={Headers.X_AXIS_USER_ID: "header@example.com"},
        )

    assert captured.get("user_id") == "header@example.com"


def test_copilot_stream_falls_back_to_body_user_id() -> None:
    """When no header is present, body user_id is used."""
    from app.main import app

    captured: dict[str, object] = {}

    def fake_tracer(route_name: str, **kwargs: object) -> MagicMock:
        captured.update(kwargs)
        return _noop_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", side_effect=fake_tracer),
        patch("app.routers.ai.CopilotAgent") as MockAgent,
    ):
        instance = MockAgent.return_value
        instance.is_configured = False

        client = TestClient(app)
        client.post(
            "/api/ai/copilot/stream",
            json={"message": "hi", "user_id": "body@example.com"},
        )

    assert captured.get("user_id") == "body@example.com"


def test_copilot_stream_omits_user_id_when_absent() -> None:
    """No header + no body → user_id=None passed to tracer (no crash)."""
    from app.main import app

    captured: dict[str, object] = {}

    def fake_tracer(route_name: str, **kwargs: object) -> MagicMock:
        captured.update(kwargs)
        return _noop_tracer()

    with (
        patch("app.routers.ai.get_request_tracer", side_effect=fake_tracer),
        patch("app.routers.ai.CopilotAgent") as MockAgent,
    ):
        instance = MockAgent.return_value
        instance.is_configured = False

        client = TestClient(app)
        client.post(
            "/api/ai/copilot/stream",
            json={"message": "hi"},
        )

    assert captured.get("user_id") is None
