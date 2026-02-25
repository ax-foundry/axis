from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client."""
    from app.main import app

    return TestClient(app)


class TestReplayStatus:
    """Test the /status endpoint."""

    def test_status_returns_not_configured(self, client):
        """Without env vars, status returns configured=false."""
        response = client.get("/api/agent-replay/status")
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] is False

    def test_status_response_shape(self, client):
        """Status response has all expected fields, no secrets leaked."""
        response = client.get("/api/agent-replay/status")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        assert "configured" in data
        assert "langfuse_host" in data
        assert "default_limit" in data
        assert "default_days_back" in data
        # No secrets in the response
        response_text = response.text
        assert "public_key" not in response_text
        assert "secret_key" not in response_text



class TestReplayRouter:
    """Test that data endpoints are gated by the enabled flag."""

    @patch("app.config.settings.agent_replay_enabled", False)
    def test_traces_list_returns_403_when_disabled(self, client):
        """GET /traces returns 403 when plugin is disabled."""
        response = client.get("/api/agent-replay/traces")
        assert response.status_code == 403

    @patch("app.config.settings.agent_replay_enabled", False)
    def test_trace_detail_returns_403_when_disabled(self, client):
        """GET /traces/{id} returns 403 when plugin is disabled."""
        response = client.get("/api/agent-replay/traces/some-id")
        assert response.status_code == 403

    @patch("app.config.settings.agent_replay_enabled", False)
    def test_step_detail_returns_403_when_disabled(self, client):
        """GET /traces/{id}/steps/0 returns 403 when plugin is disabled."""
        response = client.get("/api/agent-replay/traces/some-id/steps/0")
        assert response.status_code == 403

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_traces_returns_503_when_not_configured(self, client):
        """GET /traces returns 503 when Langfuse creds are missing."""
        response = client.get("/api/agent-replay/traces")
        assert response.status_code == 503

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_trace_detail_returns_503_when_not_configured(self, client):
        """GET /traces/{id} returns 503 when Langfuse creds are missing."""
        response = client.get("/api/agent-replay/traces/some-id")
        assert response.status_code == 503

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_invalid_limit_returns_422(self, client):
        """GET /traces?limit=999 returns 422 validation error."""
        response = client.get("/api/agent-replay/traces?limit=999")
        assert response.status_code == 422

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_invalid_limit_zero_returns_422(self, client):
        """GET /traces?limit=0 returns 422 validation error."""
        response = client.get("/api/agent-replay/traces?limit=0")
        assert response.status_code == 422

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_invalid_days_back_returns_422(self, client):
        """GET /traces?days_back=-1 returns 422 validation error."""
        response = client.get("/api/agent-replay/traces?days_back=-1")
        assert response.status_code == 422

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_invalid_max_chars_zero_returns_422(self, client):
        """GET /traces/{id}?max_chars=0 returns 422 validation error."""
        response = client.get("/api/agent-replay/traces/some-id?max_chars=0")
        assert response.status_code == 422

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_invalid_max_chars_too_large_returns_422(self, client):
        """GET /traces/{id}?max_chars=999999 returns 422 validation error."""
        response = client.get("/api/agent-replay/traces/some-id?max_chars=999999")
        assert response.status_code == 422


class TestSerialization:
    """Test serialization helpers in replay_service."""

    def _make_obs(self, **overrides) -> MagicMock:
        """Create a mock ObservationsView."""
        obs = MagicMock()
        obs.id = overrides.get("id", "obs-1")
        obs.name = overrides.get("name", "test-obs")
        obs.type = overrides.get("type", "GENERATION")
        obs.model = overrides.get("model", "claude-sonnet-4-5")
        obs.input = overrides.get("input", "Hello")
        obs.output = overrides.get("output", "World")
        obs.metadata = overrides.get("metadata", {})
        obs.usage = overrides.get("usage", None)
        obs.startTime = overrides.get("startTime", None)
        obs.endTime = overrides.get("endTime", None)
        return obs

    def test_serialize_observation_basic(self):
        """Basic observation serializes correctly."""
        from app.plugins.agent_replay.services.replay_service import (
            _serialize_observation,
        )

        obs = self._make_obs()
        result = _serialize_observation(obs, max_chars=50000)
        assert result.id == "obs-1"
        assert result.name == "test-obs"
        assert result.type == "GENERATION"
        assert result.model == "claude-sonnet-4-5"
        assert result.input == "Hello"
        assert result.output == "World"
        assert result.input_truncated is False
        assert result.output_truncated is False

    def test_serialize_observation_truncation(self):
        """Input exceeding max_chars gets truncated."""
        from app.plugins.agent_replay.services.replay_service import (
            _serialize_observation,
        )

        long_input = "x" * 100
        obs = self._make_obs(input=long_input)
        result = _serialize_observation(obs, max_chars=50)
        assert result.input_truncated is True
        assert len(result.input) < 100
        assert "[...truncated]" in result.input

    def test_serialize_observation_null_fields(self):
        """Missing model/usage/times -> None."""
        from app.plugins.agent_replay.services.replay_service import (
            _serialize_observation,
        )

        obs = self._make_obs(model=None, usage=None, startTime=None, endTime=None)
        result = _serialize_observation(obs, max_chars=50000)
        assert result.model is None
        assert result.usage is None
        assert result.latency_ms is None

    def test_metadata_redaction(self):
        """Sensitive metadata keys are redacted."""
        from app.plugins.agent_replay.services.replay_service import _redact_metadata

        metadata = {
            "api_key": "sk-secret-123",
            "authorization": "Bearer xyz",
            "token": "abc",
            "safe_field": "visible",
        }
        result = _redact_metadata(metadata)
        assert result is not None
        assert result["api_key"] == "[REDACTED]"
        assert result["authorization"] == "[REDACTED]"
        assert result["token"] == "[REDACTED]"
        assert result["safe_field"] == "visible"

    def test_metadata_redaction_nested(self):
        """Nested dicts with sensitive keys are recursively redacted."""
        from app.plugins.agent_replay.services.replay_service import _redact_metadata

        metadata = {
            "headers": {
                "authorization": "Bearer secret",
                "content_type": "application/json",
            },
            "name": "test",
        }
        result = _redact_metadata(metadata)
        assert result is not None
        assert result["headers"]["authorization"] == "[REDACTED]"
        assert result["headers"]["content_type"] == "application/json"
        assert result["name"] == "test"

    def test_serialize_step(self):
        """TraceStep serializes with correct index and types."""
        from app.plugins.agent_replay.services.replay_service import _serialize_step

        obs = self._make_obs(type="GENERATION")
        step = MagicMock()
        step.name = "recommendation"
        step.observations = [obs]
        step.extract_variables.return_value = {"query": "test"}

        result = _serialize_step(step, index=2, max_chars=50000)
        assert result.name == "recommendation"
        assert result.index == 2
        assert "GENERATION" in result.observation_types
        assert result.generation is not None
        assert result.variables == {"query": "test"}

    def test_token_usage_accumulation(self):
        """Multiple observations' tokens accumulate correctly."""
        from app.plugins.agent_replay.services.replay_service import (
            _serialize_observation,
        )

        usage1 = MagicMock()
        usage1.input = 100
        usage1.output = 50
        usage1.total = 150
        usage1.promptTokens = 0
        usage1.completionTokens = 0
        usage1.totalTokens = 0

        usage2 = MagicMock()
        usage2.input = 200
        usage2.output = 100
        usage2.total = 300
        usage2.promptTokens = 0
        usage2.completionTokens = 0
        usage2.totalTokens = 0

        obs1 = self._make_obs(usage=usage1)
        obs2 = self._make_obs(usage=usage2)

        r1 = _serialize_observation(obs1, max_chars=50000)
        r2 = _serialize_observation(obs2, max_chars=50000)

        total_input = (r1.usage.input if r1.usage else 0) + (r2.usage.input if r2.usage else 0)
        total_output = (r1.usage.output if r1.usage else 0) + (r2.usage.output if r2.usage else 0)
        assert total_input == 300
        assert total_output == 150
