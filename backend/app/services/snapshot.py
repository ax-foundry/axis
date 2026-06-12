"""GCS snapshot upload/restore for the DuckDB store.

On ephemeral-disk deployments (Cloud Run) every container start used to mean a
from-scratch multi-minute rebuild while the service was already taking
traffic. With snapshots enabled, each successful sync batch uploads a
consistent copy of the store; the next cold start downloads it before the
store opens, seeds "ready" immediately, and the background startup sync runs
as an incremental top-up.

Everything here is best-effort by design: a snapshot failure must never fail
the sync that triggered it, and a restore failure must degrade to the exact
pre-snapshot cold-start behavior (full sync from the source).
"""

import contextlib
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anyio

from app.services.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)


def _blob_name() -> str:
    from app.config.db.duckdb import duckdb_config

    prefix = duckdb_config.snapshot_prefix.strip("/")
    return f"{prefix}/local_store.duckdb"


def _bucket() -> Any:
    """Return the configured GCS bucket.

    Imported lazily — the google-cloud-storage dependency is only needed when
    snapshots are on.
    """
    # google.cloud is a namespace package — mypy can't see the storage
    # submodule unless google-cloud-storage is installed in its env.
    from google.cloud import storage  # type: ignore[attr-defined]

    from app.config.db.duckdb import duckdb_config

    return storage.Client().bucket(duckdb_config.snapshot_bucket)


def snapshot_enabled() -> bool:
    """True when snapshots are switched on and a bucket is configured."""
    from app.config.db.duckdb import duckdb_config

    return bool(duckdb_config.snapshot_enabled and duckdb_config.snapshot_bucket)


async def snapshot_and_upload(store: DuckDBStore) -> bool:
    """Snapshot the live store and upload it to GCS. Returns True on success.

    Called after a sync batch completes. Never raises: snapshotting is an
    optimization for the *next* cold start, not part of the sync contract.
    Single writer assumed (Cloud Run max-instances=1) — the blob is an atomic
    overwrite, readers always see either the old or the new snapshot.
    """
    from app.config.db.duckdb import duckdb_config

    if not snapshot_enabled():
        return False

    tmp_path = f"{store.db_path}.snapshot.tmp"
    try:
        async with store._write_lock:
            await anyio.to_thread.run_sync(store.create_snapshot, tmp_path)
        size_mb = Path(tmp_path).stat().st_size / 1e6

        def _upload() -> None:
            _bucket().blob(_blob_name()).upload_from_filename(tmp_path)

        start = time.time()
        await anyio.to_thread.run_sync(_upload)
        logger.info(
            f"Snapshot uploaded to gs://{duckdb_config.snapshot_bucket}/{_blob_name()} "
            f"({size_mb:.0f} MB in {time.time() - start:.1f}s)"
        )
        return True
    except Exception:
        logger.warning(
            "Snapshot upload failed — sync result is unaffected; "
            "next cold start falls back to a full sync",
            exc_info=True,
        )
        return False
    finally:
        with contextlib.suppress(OSError):
            Path(tmp_path).unlink()


def restore_snapshot_if_available(db_path: str) -> bool:
    """Download the latest snapshot into ``db_path`` on cold start.

    Synchronous on purpose: it runs in the FastAPI lifespan before the store
    opens and before uvicorn accepts requests, so the restored data is in
    place before the first status/data request. Returns True only when a
    fresh-enough snapshot was restored; every other outcome (disabled, local
    file already present, no snapshot, stale snapshot, any error) returns
    False and leaves cold-start behavior exactly as it was.
    """
    from app.config.db.duckdb import duckdb_config

    if not snapshot_enabled():
        return False
    path = Path(db_path)
    if path.exists():
        logger.info("Local DuckDB store already exists — skipping snapshot restore")
        return False

    tmp_path = f"{db_path}.restore.tmp"
    try:
        blob = _bucket().get_blob(_blob_name())
        if blob is None:
            logger.info(
                f"No snapshot at gs://{duckdb_config.snapshot_bucket}/{_blob_name()} — "
                f"cold start will run a full sync"
            )
            return False

        age_hours = (datetime.now(tz=UTC) - blob.updated).total_seconds() / 3600
        if age_hours > duckdb_config.snapshot_max_age_hours:
            logger.warning(
                f"Snapshot is {age_hours:.1f}h old "
                f"(max {duckdb_config.snapshot_max_age_hours}h) — ignoring; "
                f"cold start will run a full sync"
            )
            return False

        path.parent.mkdir(parents=True, exist_ok=True)
        start = time.time()
        blob.download_to_filename(tmp_path)
        Path(tmp_path).replace(db_path)
        logger.info(
            f"Snapshot restored from gs://{duckdb_config.snapshot_bucket}/{_blob_name()} "
            f"({(blob.size or 0) / 1e6:.0f} MB in {time.time() - start:.1f}s, "
            f"{age_hours:.1f}h old) — startup sync will run as incremental top-up"
        )
        return True
    except Exception:
        logger.warning(
            "Snapshot restore failed — falling back to normal cold-start sync",
            exc_info=True,
        )
        return False
    finally:
        with contextlib.suppress(OSError):
            Path(tmp_path).unlink()
