"""Tests for GCS-backed CSV export staging."""

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import anyio
import pytest

from app.config.env import settings
from app.services import export_service as export_mod
from app.services.duckdb_store import DuckDBStore
from app.services.export_service import (
    _generate_signed_url,
    _service_account_credentials,
    sanitize_export_filename,
    stage_csv_export,
)


class FakeExportStore:
    """Minimal DuckDBStore stand-in for export staging tests."""

    def __init__(self, *, fail: bool = False) -> None:
        """Initialize a fake export store."""
        self.query_limiter = anyio.CapacityLimiter(1)
        self.fail = fail
        self.export_path: str | None = None

    def sql_to_csv_file(self, sql: str, csv_path: str, max_rows: int) -> int:
        self.export_path = csv_path
        if self.fail:
            raise RuntimeError("duckdb failed")
        Path(csv_path).write_text("id,name\n1,Ada\n2,Grace\n")
        return 2


def _export_on():
    return patch.multiple(
        settings,
        axis_export_bucket="test-export-bucket",
        export_signed_url_ttl_seconds=900,
    )


def test_sanitize_export_filename() -> None:
    assert sanitize_export_filename("../Bad Report.csv") == "Bad_Report.csv"
    assert sanitize_export_filename('quote"break\nname') == "quote_break_name.csv"
    assert sanitize_export_filename(".csv") == "export.csv"
    assert sanitize_export_filename("already.csv") == "already.csv"


def test_generate_signed_url_uses_access_token_credentials() -> None:
    credentials = MagicMock()
    credentials.service_account_email = "ml-workload-sa@example.iam.gserviceaccount.com"
    credentials.token = "ya29.token"
    blob = MagicMock()
    blob.generate_signed_url.return_value = "https://signed.example/export.csv"

    with (
        patch.multiple(settings, gcp_sa_client_email=None, gcp_sa_private_key=None),
        patch("google.auth.default", return_value=(credentials, "project")),
        patch("google.auth.transport.requests.Request", return_value=MagicMock()),
    ):
        url = _generate_signed_url(blob, datetime.now(tz=UTC))

    assert url == "https://signed.example/export.csv"
    credentials.refresh.assert_called_once()
    assert blob.generate_signed_url.call_args.kwargs["service_account_email"] == (
        "ml-workload-sa@example.iam.gserviceaccount.com"
    )
    assert blob.generate_signed_url.call_args.kwargs["access_token"] == "ya29.token"


def test_service_account_credentials_unescapes_private_key() -> None:
    credentials = MagicMock()

    with (
        patch.multiple(
            settings,
            gcp_project_id="test-project",
            gcp_sa_client_email="ml-workload-sa@example.iam.gserviceaccount.com",
            gcp_sa_private_key="-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
        ),
        patch(
            "google.oauth2.service_account.Credentials.from_service_account_info",
            return_value=credentials,
        ) as from_info,
    ):
        assert _service_account_credentials() is credentials

    info = from_info.call_args.args[0]
    assert info["project_id"] == "test-project"
    assert info["client_email"] == "ml-workload-sa@example.iam.gserviceaccount.com"
    assert info["private_key"] == "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"


def test_generate_signed_url_uses_configured_service_account_credentials() -> None:
    credentials = MagicMock()
    blob = MagicMock()
    blob.generate_signed_url.return_value = "https://signed.example/export.csv"

    with (
        patch.multiple(
            settings,
            gcp_project_id="test-project",
            gcp_sa_client_email="ml-workload-sa@example.iam.gserviceaccount.com",
            gcp_sa_private_key="-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
        ),
        patch(
            "google.oauth2.service_account.Credentials.from_service_account_info",
            return_value=credentials,
        ),
    ):
        url = _generate_signed_url(blob, datetime.now(tz=UTC))

    assert url == "https://signed.example/export.csv"
    assert blob.generate_signed_url.call_args.kwargs["credentials"] is credentials


def test_sql_to_csv_file_writes_csv(tmp_path) -> None:
    store = DuckDBStore(str(tmp_path / "store.duckdb"))
    try:
        store._conn.execute("CREATE TABLE export_rows (id INT, name VARCHAR)")
        store._conn.execute("INSERT INTO export_rows VALUES (1, 'Ada'), (2, 'Grace')")
        csv_path = tmp_path / "out.csv"

        row_count = store.sql_to_csv_file(
            "SELECT id, name FROM export_rows ORDER BY id",
            str(csv_path),
            max_rows=10,
        )

        assert row_count == 2
        assert csv_path.read_text() == "id,name\n1,Ada\n2,Grace\n"
    finally:
        store._conn.close()


async def test_stage_csv_export_uploads_and_cleans_temp_file() -> None:
    store = FakeExportStore()
    bucket = MagicMock()
    blob = bucket.blob.return_value
    blob.generate_signed_url.return_value = "https://signed.example/export.csv"

    uploaded_paths: list[str] = []

    def _record_upload(path: str, content_type: str) -> None:
        uploaded_paths.append(path)
        assert content_type == "text/csv"
        assert Path(path).exists()

    blob.upload_from_filename.side_effect = _record_upload

    with _export_on(), patch.object(export_mod, "_bucket", return_value=bucket):
        result = await stage_csv_export(
            store=store, sql="SELECT * FROM t", filename="Report Name", max_rows=100
        )

    assert result.download_url == "https://signed.example/export.csv"
    assert result.filename == "Report_Name.csv"
    assert result.row_count == 2
    assert result.size_bytes > 0
    assert result.object_name.startswith("exports/")
    blob.upload_from_filename.assert_called_once()
    blob.generate_signed_url.assert_called_once()
    assert uploaded_paths
    assert not Path(uploaded_paths[0]).exists()


async def test_stage_csv_export_cleans_temp_file_on_failure() -> None:
    store = FakeExportStore(fail=True)

    with _export_on(), pytest.raises(RuntimeError):
        await stage_csv_export(
            store=store, sql="SELECT * FROM t", filename="report.csv", max_rows=100
        )

    assert store.export_path is not None
    assert not Path(store.export_path).exists()
