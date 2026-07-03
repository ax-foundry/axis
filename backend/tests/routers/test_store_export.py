"""Tests for POST /api/store/export."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.config.env import settings
from app.main import app
from app.services.export_service import CsvExportResult, ExportStorageNotConfiguredError


def _client_no_auth() -> TestClient:
    return TestClient(app)


def test_export_returns_signed_url_json() -> None:
    result = CsvExportResult(
        download_url="https://signed.example/export.csv",
        filename="export.csv",
        expires_at=datetime(2026, 7, 3, 16, 0, tzinfo=UTC),
        row_count=2,
        object_name="exports/2026/07/03/object.csv",
        size_bytes=24,
    )
    stage = AsyncMock(return_value=result)

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch.object(settings, "export_max_rows", 123),
        patch("app.routers.store.get_store", return_value=MagicMock()),
        patch("app.routers.store.stage_csv_export", stage),
    ):
        resp = _client_no_auth().post(
            "/api/store/export",
            json={"sql": "SELECT * FROM monitoring_data", "filename": "export.csv"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["download_url"] == "https://signed.example/export.csv"
    assert body["filename"] == "export.csv"
    assert body["row_count"] == 2
    assert body["size_bytes"] == 24
    stage.assert_awaited_once()
    assert stage.await_args.kwargs["max_rows"] == 123


def test_export_missing_bucket_falls_back_to_direct_csv() -> None:
    stage = AsyncMock(side_effect=ExportStorageNotConfiguredError("missing"))
    store = MagicMock()
    store.query_limiter = None
    store.sql_to_csv.return_value = "id,name\n1,Ada\n"

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch.object(settings, "export_max_rows", 456),
        patch("app.routers.store.get_store", return_value=store),
        patch("app.routers.store.stage_csv_export", stage),
    ):
        resp = _client_no_auth().post(
            "/api/store/export",
            json={"sql": "SELECT * FROM monitoring_data", "filename": "../Export Name.csv"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["content-disposition"] == 'attachment; filename="Export_Name.csv"'
    assert resp.text == "id,name\n1,Ada\n"
    store.sql_to_csv.assert_called_once_with("SELECT * FROM monitoring_data", max_rows=456)


def test_export_rejects_unsafe_sql() -> None:
    stage = AsyncMock()

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.store.stage_csv_export", stage),
    ):
        resp = _client_no_auth().post(
            "/api/store/export",
            json={"sql": "DROP TABLE monitoring_data", "filename": "export.csv"},
        )

    assert resp.status_code == 400
    assert "Only SELECT" in resp.json()["detail"]
    stage.assert_not_called()
