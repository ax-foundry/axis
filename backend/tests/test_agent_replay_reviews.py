from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.plugins.agent_replay.services.replay_service import LangfuseNotConfiguredError


@pytest.fixture
def client():
    """Create a test client."""
    from app.main import app

    return TestClient(app)


class TestReviewSchemas:
    """Test Pydantic model validation for review schemas."""

    def test_review_create_request_valid(self):
        """Valid request with all fields."""
        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest

        req = ReviewCreateRequest(
            trace_id="abc-123",
            agent="alpha_bot",
            verdict="positive",
            tooling_needs="Needs access to CRM",
            rationale="",
            expected_output="Approve with conditions",
            add_to_dataset=True,
            dataset_name="alpha-bot-golden-2026-02",
        )
        assert req.verdict.value == "positive"
        assert req.add_to_dataset is True

    def test_review_create_request_minimal(self):
        """Minimal valid request (only required fields)."""
        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest

        req = ReviewCreateRequest(trace_id="abc-123", verdict="negative")
        assert req.verdict.value == "negative"
        assert req.agent is None
        assert req.tooling_needs == ""
        assert req.add_to_dataset is False

    def test_review_create_request_invalid_verdict(self):
        """Invalid verdict value raises validation error."""
        from pydantic import ValidationError

        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest

        with pytest.raises(ValidationError):
            ReviewCreateRequest(trace_id="abc", verdict="invalid")

    def test_review_create_request_max_length(self):
        """Fields exceeding max_length raise validation error."""
        from pydantic import ValidationError

        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest

        with pytest.raises(ValidationError):
            ReviewCreateRequest(
                trace_id="abc",
                verdict="positive",
                tooling_needs="x" * 2001,
            )

    def test_review_verdict_enum_values(self):
        """ReviewVerdict enum has exactly 3 values."""
        from app.plugins.agent_replay.models.review_schemas import ReviewVerdict

        assert set(ReviewVerdict) == {
            ReviewVerdict.positive,
            ReviewVerdict.negative,
            ReviewVerdict.neutral,
        }


class TestReviewRouter:
    """Test that review endpoints are gated by the enabled flag."""

    @patch("app.config.env.settings.agent_replay_enabled", False)
    def test_post_reviews_returns_403_when_disabled(self, client):
        """POST /reviews returns 403 when plugin is disabled."""
        response = client.post(
            "/api/agent-replay/reviews",
            json={"trace_id": "abc", "verdict": "positive"},
        )
        assert response.status_code == 403

    @patch("app.config.env.settings.agent_replay_enabled", False)
    def test_get_trace_reviews_returns_403_when_disabled(self, client):
        """GET /traces/{id}/reviews returns 403 when plugin is disabled."""
        response = client.get("/api/agent-replay/traces/some-id/reviews")
        assert response.status_code == 403

    @patch("app.config.env.settings.agent_replay_enabled", False)
    def test_get_datasets_returns_403_when_disabled(self, client):
        """GET /datasets returns 403 when plugin is disabled."""
        response = client.get("/api/agent-replay/datasets")
        assert response.status_code == 403

    @patch("app.config.env.settings.agent_replay_enabled", True)
    def test_post_reviews_returns_503_when_not_configured(self, client):
        """POST /reviews returns 503 when Langfuse creds are missing."""
        with patch(
            "app.plugins.agent_replay.services.review_service._get_loader",
            side_effect=LangfuseNotConfiguredError("Not configured"),
        ):
            response = client.post(
                "/api/agent-replay/reviews",
                json={"trace_id": "abc", "verdict": "positive"},
            )
        assert response.status_code == 503

    @patch("app.config.env.settings.agent_replay_enabled", True)
    def test_get_trace_reviews_returns_503_when_not_configured(self, client):
        """GET /traces/{id}/reviews returns 503 when creds are missing."""
        with patch(
            "app.plugins.agent_replay.services.review_service._get_loader",
            side_effect=LangfuseNotConfiguredError("Not configured"),
        ):
            response = client.get("/api/agent-replay/traces/some-id/reviews")
        assert response.status_code == 503

    @patch("app.config.env.settings.agent_replay_enabled", True)
    def test_get_datasets_returns_503_when_not_configured(self, client):
        """GET /datasets returns 503 when creds are missing."""
        with patch(
            "app.plugins.agent_replay.services.review_service._get_loader",
            side_effect=LangfuseNotConfiguredError("Not configured"),
        ):
            response = client.get("/api/agent-replay/datasets")
        assert response.status_code == 503

    @patch("app.config.env.settings.agent_replay_enabled", True)
    def test_post_reviews_invalid_verdict_returns_422(self, client):
        """POST /reviews with invalid verdict returns 422."""
        response = client.post(
            "/api/agent-replay/reviews",
            json={"trace_id": "abc", "verdict": "invalid_value"},
        )
        assert response.status_code == 422

    @patch("app.config.env.settings.agent_replay_enabled", True)
    def test_post_reviews_missing_trace_id_returns_422(self, client):
        """POST /reviews without trace_id returns 422."""
        response = client.post(
            "/api/agent-replay/reviews",
            json={"verdict": "positive"},
        )
        assert response.status_code == 422


class TestReviewService:
    """Test the review service with a mocked Langfuse client."""

    @patch("app.plugins.agent_replay.services.review_service._get_loader")
    def test_save_review_creates_scores(self, mock_get_loader):
        """save_review creates the expected number of Langfuse scores."""
        import asyncio

        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest
        from app.plugins.agent_replay.services.review_service import save_review

        mock_client = MagicMock()
        mock_client.create_score.return_value = None
        mock_client.flush.return_value = None
        mock_loader = MagicMock()
        mock_loader.client = mock_client
        mock_get_loader.return_value = mock_loader

        req = ReviewCreateRequest(
            trace_id="trace-1",
            verdict="negative",
            tooling_needs="Needs CRM access",
            rationale="Missing data",
            expected_output="Approve with conditions",
            failure_observation_id="obs-1",
            failure_observation_name="step-2",
        )

        result = asyncio.get_event_loop().run_until_complete(save_review(req))
        assert result.success is True
        assert result.scores_created == 5  # verdict + 3 text + failure_step
        assert mock_client.create_score.call_count == 5
        mock_client.flush.assert_called_once()

    @patch("app.plugins.agent_replay.services.review_service._get_loader")
    def test_save_review_skips_empty_fields(self, mock_get_loader):
        """save_review only creates verdict score when text fields are empty."""
        import asyncio

        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest
        from app.plugins.agent_replay.services.review_service import save_review

        mock_client = MagicMock()
        mock_client.create_score.return_value = None
        mock_client.flush.return_value = None
        mock_loader = MagicMock()
        mock_loader.client = mock_client
        mock_get_loader.return_value = mock_loader

        req = ReviewCreateRequest(trace_id="trace-1", verdict="positive")
        result = asyncio.get_event_loop().run_until_complete(save_review(req))
        assert result.success is True
        assert result.scores_created == 1  # only verdict
        assert result.dataset_item_created is False

    @patch("app.plugins.agent_replay.services.review_service._get_loader")
    def test_save_review_creates_dataset_item(self, mock_get_loader):
        """save_review creates dataset + item when add_to_dataset is True."""
        import asyncio

        from app.plugins.agent_replay.models.review_schemas import ReviewCreateRequest
        from app.plugins.agent_replay.services.review_service import save_review

        mock_client = MagicMock()
        mock_client.create_score.return_value = None
        mock_client.flush.return_value = None
        mock_loader = MagicMock()
        mock_loader.client = mock_client
        mock_get_loader.return_value = mock_loader

        req = ReviewCreateRequest(
            trace_id="trace-1",
            verdict="neutral",
            add_to_dataset=True,
            dataset_name="my-dataset",
        )
        result = asyncio.get_event_loop().run_until_complete(save_review(req))
        assert result.dataset_item_created is True
        assert result.dataset_name == "my-dataset"
        mock_client.create_dataset.assert_called_once_with(name="my-dataset")
        mock_client.create_dataset_item.assert_called_once()
