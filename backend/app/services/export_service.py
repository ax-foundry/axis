from __future__ import annotations

import contextlib
import logging
import re
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import anyio

from app.config.env import settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.services.duckdb_store import DuckDBStore

_FILENAME_SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")
_MAX_FILENAME_LENGTH = 160


class ExportStorageNotConfiguredError(RuntimeError):
    """Raised when a large export is requested without a configured bucket."""


@dataclass(frozen=True)
class CsvExportResult:
    """Metadata returned to the frontend for a staged CSV export."""

    download_url: str
    filename: str
    expires_at: datetime
    row_count: int
    object_name: str
    size_bytes: int


def sanitize_export_filename(filename: str) -> str:
    """Return a safe attachment filename with a `.csv` suffix."""
    name = Path(filename or "export.csv").name.strip()
    if not name:
        name = "export.csv"
    if not name.lower().endswith(".csv"):
        name = f"{name}.csv"

    stem = name[:-4]
    stem = _FILENAME_SAFE_RE.sub("_", stem).strip("._-")
    if not stem:
        stem = "export"
    stem = stem[: _MAX_FILENAME_LENGTH - 4].rstrip("._-") or "export"
    return f"{stem}.csv"


def export_storage_enabled() -> bool:
    """True when a GCS export bucket is configured."""
    return bool(settings.axis_export_bucket)


def _bucket() -> Any:
    """Return the configured GCS bucket."""
    if not settings.axis_export_bucket:
        raise ExportStorageNotConfiguredError("AXIS_EXPORT_BUCKET is not configured")

    from google.cloud import storage  # type: ignore[attr-defined]

    credentials = _service_account_credentials()
    client = storage.Client(project=settings.gcp_project_id, credentials=credentials)
    return client.bucket(settings.axis_export_bucket)


def _object_name(filename: str) -> str:
    today = datetime.now(tz=UTC).strftime("%Y/%m/%d")
    return f"exports/{today}/{uuid4().hex}-{filename}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _service_account_credentials() -> Any | None:
    """Return configured service-account credentials, or None to use ADC."""
    if not (settings.gcp_sa_client_email and settings.gcp_sa_private_key):
        return None

    from google.oauth2 import service_account  # type: ignore[import-untyped]

    private_key = settings.gcp_sa_private_key.replace("\\n", "\n")
    service_account_info = {
        "type": "service_account",
        "client_email": settings.gcp_sa_client_email,
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token",
        "project_id": settings.gcp_project_id or "",
    }
    return service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
    )


def _generate_signed_url(blob: Any, expires_at: datetime) -> str:
    service_account_credentials = _service_account_credentials()
    if service_account_credentials is not None:
        return str(
            blob.generate_signed_url(
                version="v4",
                expiration=expires_at,
                method="GET",
                credentials=service_account_credentials,
            )
        )

    try:
        import google.auth
        from google.auth.transport.requests import Request

        credentials, _project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        request = Request()
        credentials.refresh(request)
        access_token = getattr(credentials, "token", None)
        service_account_email = getattr(credentials, "service_account_email", None)
        if service_account_email and access_token:
            return str(
                blob.generate_signed_url(
                    version="v4",
                    expiration=expires_at,
                    method="GET",
                    service_account_email=service_account_email,
                    access_token=access_token,
                )
            )
    except Exception:
        logger.debug("Falling back to credential-local signed URL generation", exc_info=True)

    return str(
        blob.generate_signed_url(
            version="v4",
            expiration=expires_at,
            method="GET",
        )
    )


async def stage_csv_export(
    *,
    store: DuckDBStore,
    sql: str,
    filename: str,
    max_rows: int,
) -> CsvExportResult:
    """Write a query result to GCS and return signed download metadata."""
    if not export_storage_enabled():
        raise ExportStorageNotConfiguredError("AXIS_EXPORT_BUCKET is not configured")

    safe_filename = sanitize_export_filename(filename)
    object_name = _object_name(safe_filename)
    expires_at = datetime.now(tz=UTC) + timedelta(seconds=settings.export_signed_url_ttl_seconds)

    tmp_path = ""
    start = time.time()
    try:
        with tempfile.NamedTemporaryFile(prefix="axis-export-", suffix=".csv", delete=False) as tmp:
            tmp_path = tmp.name

        row_count = await anyio.to_thread.run_sync(
            lambda: store.sql_to_csv_file(sql, tmp_path, max_rows=max_rows),
            limiter=store.query_limiter,
        )
        size_bytes = Path(tmp_path).stat().st_size

        def _upload_and_sign() -> str:
            blob = _bucket().blob(object_name)
            blob.content_type = "text/csv"
            blob.content_disposition = _content_disposition(safe_filename)
            blob.upload_from_filename(
                tmp_path,
                content_type="text/csv",
            )
            return _generate_signed_url(blob, expires_at)

        download_url = await anyio.to_thread.run_sync(_upload_and_sign)
        logger.info(
            "CSV export staged to gs://%s/%s (%s rows, %.1f MB in %.1fs)",
            settings.axis_export_bucket,
            object_name,
            row_count,
            size_bytes / 1e6,
            time.time() - start,
        )
        return CsvExportResult(
            download_url=download_url,
            filename=safe_filename,
            expires_at=expires_at,
            row_count=row_count,
            object_name=object_name,
            size_bytes=size_bytes,
        )
    finally:
        if tmp_path:
            with contextlib.suppress(OSError):
                Path(tmp_path).unlink()
