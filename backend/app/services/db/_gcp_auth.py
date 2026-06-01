"""GCP credential builder and cached BigQuery client factory.

The cache key is a SHA-256 hash of (project_id, sa_client_email, sa_private_key)
so that client rotation (same email, new key) correctly creates a fresh client.
ADC clients cache on (project_id, "__adc__").
"""

import hashlib
import logging
from typing import Any

logger = logging.getLogger(__name__)

_client_cache: dict[str, Any] = {}


def _cache_key(project_id: str | None, email: str | None, private_key: str | None) -> str:
    raw = f"{project_id or ''}|{email or ''}|{private_key or '__adc__'}"
    return hashlib.sha256(raw.encode()).hexdigest()


def build_bq_client(params: dict[str, Any]) -> Any:
    r"""Return a cached ``bigquery.Client`` for *params*.

    Authentication strategy (in order):
    1. ``sa_client_email`` + ``sa_private_key`` from params → service-account creds.
    2. ADC (Application Default Credentials) — ``gcloud auth application-default
       login`` or ``GOOGLE_APPLICATION_CREDENTIALS`` env var.

    The private key undergoes ``\\n → \n`` unescape so it survives YAML /
    env-var transport (same as mithril_backend).

    Raises:
        DatabaseBackendError: If ``google-cloud-bigquery`` or
            ``google.oauth2.service_account`` is not installed, or if the
            service-account info dict is malformed.
    """
    from app.services.db._errors import DatabaseBackendError

    try:
        from google.cloud import bigquery  # type: ignore[import-untyped]
    except ImportError:
        raise DatabaseBackendError(
            "BigQuery support not installed. " "Install with: pip install 'axis[bigquery]'"
        )

    project_id = params.get("project_id")
    email = params.get("sa_client_email") or None
    private_key_raw = params.get("sa_private_key") or None

    key = _cache_key(project_id, email, private_key_raw)
    if key in _client_cache:
        return _client_cache[key]

    if email and private_key_raw:
        try:
            from google.oauth2 import service_account  # type: ignore[import-untyped]
        except ImportError:
            raise DatabaseBackendError(
                "BigQuery support not installed. " "Install with: pip install 'axis[bigquery]'"
            )

        # Unescape newlines that may have been encoded during YAML/env transport
        private_key = private_key_raw.replace("\\n", "\n")

        service_account_info = {
            "type": "service_account",
            "client_email": email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
            "project_id": project_id or "",
        }
        creds = service_account.Credentials.from_service_account_info(  # type: ignore[no-untyped-call]
            service_account_info,
            scopes=["https://www.googleapis.com/auth/bigquery"],
        )
        client = bigquery.Client(project=project_id, credentials=creds)
        logger.info("BigQuery client created with service-account credentials")
    else:
        client = bigquery.Client(project=project_id)
        logger.info("BigQuery client created with ADC")

    _client_cache[key] = client
    return client


def invalidate_cache() -> None:
    """Clear the client cache. Used in tests."""
    _client_cache.clear()
