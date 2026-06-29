"""Tests for the GET /api/store/data/{dataset} warming gate.

A missing table used to return an empty 200 unless the in-memory state was
exactly "syncing" — so during cold start (state still "not_synced") or after a
failed sync (state "error", periodic scheduler will retry) the UI treated an
auto-load dataset as "ready but empty" and fell back to the legacy client-side
import, rendering partial unjoined data. The gate must return 503
dataset_warming for any auto-load dataset whose table is missing, and keep the
empty 200 only for genuinely inactive datasets.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from app.services.duckdb_store import SyncStatus


@pytest.fixture
def fake_store() -> MagicMock:
    store = MagicMock()
    store.has_table.return_value = False
    return store


@pytest.fixture
def client_no_auth() -> TestClient:
    """TestClient with API_GATEWAY_KEY blanked so the middleware passes through."""
    from app.config.env import settings
    from app.main import app

    with patch.object(settings, "API_GATEWAY_KEY", ""):
        yield TestClient(app)


def _get_data(client: TestClient, fake_store: MagicMock, state: str, auto_loads: bool) -> Response:
    fake_store.get_sync_status.return_value = SyncStatus(state=state)
    with (
        patch("app.routers.store.get_store", return_value=fake_store),
        patch("app.routers.store._dataset_auto_loads", return_value=auto_loads),
    ):
        return client.get("/api/store/data/monitoring")


@pytest.mark.parametrize("state", ["not_synced", "syncing", "error"])
def test_missing_table_auto_load_returns_warming(
    fake_store: MagicMock, client_no_auth: TestClient, state: str
) -> None:
    """Auto-load dataset + missing table → 503 dataset_warming for every pre-ready state."""
    resp = _get_data(client_no_auth, fake_store, state, auto_loads=True)
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "dataset_warming"


def test_missing_table_syncing_warms_even_when_inactive(
    fake_store: MagicMock, client_no_auth: TestClient
) -> None:
    """An in-flight sync (e.g. manually triggered) gates regardless of auto-load."""
    resp = _get_data(client_no_auth, fake_store, "syncing", auto_loads=False)
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "dataset_warming"


@pytest.mark.parametrize("state", ["not_synced", "error"])
def test_missing_table_inactive_dataset_returns_empty(
    fake_store: MagicMock, client_no_auth: TestClient, state: str
) -> None:
    """A genuinely inactive dataset (disabled/unconfigured/manual) keeps the empty 200."""
    resp = _get_data(client_no_auth, fake_store, state, auto_loads=False)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["data"] == []
    assert body["total"] == 0


def test_monitoring_data_coerces_numeric_strings(
    fake_store: MagicMock, client_no_auth: TestClient
) -> None:
    """Production DuckDB may infer metric_score as VARCHAR; API still returns numbers."""
    fake_store.has_table.return_value = True
    fake_store.get_table_columns.return_value = {
        "dataset_id",
        "timestamp",
        "metric_name",
        "metric_score",
        "latency",
        "threshold",
        "cost_estimate",
    }
    fake_store.get_metadata.return_value = {"row_count": 1}
    fake_store.query_list.return_value = [
        {
            "dataset_id": "row-1",
            "metric_name": "Business Review Insightfulness",
            "metric_score": "0.25",
            "latency": "36.4",
            "threshold": "0.5",
            "cost_estimate": "0.012",
        }
    ]

    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.get("/api/store/data/monitoring")

    assert resp.status_code == 200
    row = resp.json()["data"][0]
    assert row["metric_score"] == 0.25
    assert row["latency"] == 36.4
    assert row["threshold"] == 0.5
    assert row["cost_estimate"] == 0.012


def test_monitoring_data_leaves_non_numeric_strings_alone(
    fake_store: MagicMock, client_no_auth: TestClient
) -> None:
    """The response normalizer must not rewrite non-numeric source values."""
    fake_store.has_table.return_value = True
    fake_store.get_table_columns.return_value = {"dataset_id", "metric_score"}
    fake_store.get_metadata.return_value = {"row_count": 1}
    fake_store.query_list.return_value = [{"dataset_id": "row-1", "metric_score": "not-scored"}]

    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.get("/api/store/data/monitoring")

    assert resp.status_code == 200
    assert resp.json()["data"][0]["metric_score"] == "not-scored"
