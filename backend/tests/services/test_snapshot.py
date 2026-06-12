"""Tests for DuckDB store snapshots and GCS restore.

The snapshot is what turns a Cloud Run cold start from a multi-minute
from-scratch rebuild into a seconds-long download + incremental top-up — but
only if it carries everything: tables, views, and the _store_metadata KVs
(watermarks, last-sync, rebuild stamps). And it must be strictly best-effort:
any failure anywhere degrades to the exact pre-snapshot behavior.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import duckdb
import pytest

from app.config.db.duckdb import duckdb_config
from app.services import snapshot as snapshot_mod
from app.services.duckdb_store import DuckDBStore
from app.services.snapshot import restore_snapshot_if_available, snapshot_and_upload

# ----------------------------------------------------------------------
# create_snapshot round-trip
# ----------------------------------------------------------------------


@pytest.fixture
def store(tmp_path) -> DuckDBStore:
    s = DuckDBStore(str(tmp_path / "live.duckdb"))
    s._conn.execute("CREATE TABLE monitoring_results (trace_id VARCHAR, metric_score DOUBLE)")
    s._conn.execute("INSERT INTO monitoring_results VALUES ('t1', 0.9), ('t2', 0.4)")
    s._conn.execute(
        "CREATE VIEW monitoring_data AS SELECT * FROM monitoring_results"
    )
    s.set_kv("_watermark_monitoring_results", "2026-06-11 23:00:00")
    s.set_kv("_last_sync_monitoring_data", "2026-06-12T00:00:00+00:00")
    yield s
    s._conn.close()


def test_create_snapshot_round_trip(store: DuckDBStore, tmp_path) -> None:
    dest = str(tmp_path / "snap.duckdb")

    store.create_snapshot(dest)

    snap = duckdb.connect(dest, read_only=True)
    try:
        rows = snap.execute("SELECT * FROM monitoring_results ORDER BY trace_id").fetchall()
        assert rows == [("t1", 0.9), ("t2", 0.4)]
        # Views travel with the snapshot
        view_rows = snap.execute("SELECT COUNT(*) FROM monitoring_data").fetchone()
        assert view_rows == (2,)
        # KV metadata travels — this is what makes the post-restore sync incremental
        wm = snap.execute(
            "SELECT metadata_json FROM _store_metadata "
            "WHERE table_name = '_watermark_monitoring_results'"
        ).fetchone()
        assert wm is not None
        assert "2026-06-11 23:00:00" in wm[0]
    finally:
        snap.close()


def test_create_snapshot_overwrites_existing_dest(store: DuckDBStore, tmp_path) -> None:
    dest = tmp_path / "snap.duckdb"
    dest.write_text("stale bytes")

    store.create_snapshot(str(dest))

    snap = duckdb.connect(str(dest), read_only=True)
    try:
        assert snap.execute("SELECT COUNT(*) FROM monitoring_results").fetchone() == (2,)
    finally:
        snap.close()


def test_restored_snapshot_loads_as_store(store: DuckDBStore, tmp_path) -> None:
    """A snapshot opened as a fresh DuckDBStore behaves like the original."""
    dest = str(tmp_path / "restored.duckdb")
    store.create_snapshot(dest)

    restored = DuckDBStore(dest)
    try:
        restored.load_metadata_from_db()
        assert restored.get_watermark("monitoring_results") == "2026-06-11 23:00:00"
        assert restored.has_table("monitoring_data")  # the view binds
    finally:
        restored._conn.close()


# ----------------------------------------------------------------------
# restore_snapshot_if_available
# ----------------------------------------------------------------------


def _fake_blob(age_hours: float = 1.0, size: int = 1024) -> MagicMock:
    blob = MagicMock()
    blob.updated = datetime.now(tz=UTC) - timedelta(hours=age_hours)
    blob.size = size

    def _download(dest: str) -> None:
        Path(dest).write_bytes(b"snapshot-bytes")

    blob.download_to_filename.side_effect = _download
    return blob


def _snapshot_on():
    return patch.multiple(
        duckdb_config,
        snapshot_enabled=True,
        snapshot_bucket="test-bucket",
        snapshot_max_age_hours=48,
    )


def test_restore_disabled_returns_false(tmp_path) -> None:
    with patch.object(duckdb_config, "snapshot_enabled", False):
        assert restore_snapshot_if_available(str(tmp_path / "db.duckdb")) is False


def test_restore_skips_when_local_file_exists(tmp_path) -> None:
    db_path = tmp_path / "db.duckdb"
    db_path.write_bytes(b"existing")
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket") as bucket:
        assert restore_snapshot_if_available(str(db_path)) is False
        bucket.assert_not_called()
    assert db_path.read_bytes() == b"existing"


def test_restore_no_snapshot_returns_false(tmp_path) -> None:
    bucket = MagicMock()
    bucket.get_blob.return_value = None
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert restore_snapshot_if_available(str(tmp_path / "db.duckdb")) is False


def test_restore_stale_snapshot_ignored(tmp_path) -> None:
    bucket = MagicMock()
    bucket.get_blob.return_value = _fake_blob(age_hours=100.0)
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert restore_snapshot_if_available(str(tmp_path / "db.duckdb")) is False
    assert not (tmp_path / "db.duckdb").exists()


def test_restore_fresh_snapshot_downloads(tmp_path) -> None:
    db_path = tmp_path / "data" / "db.duckdb"
    bucket = MagicMock()
    bucket.get_blob.return_value = _fake_blob(age_hours=2.0)
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert restore_snapshot_if_available(str(db_path)) is True
    assert db_path.read_bytes() == b"snapshot-bytes"
    assert not Path(f"{db_path}.restore.tmp").exists()


def test_restore_download_failure_falls_back(tmp_path) -> None:
    db_path = tmp_path / "db.duckdb"
    blob = _fake_blob()
    blob.download_to_filename.side_effect = RuntimeError("network down")
    bucket = MagicMock()
    bucket.get_blob.return_value = blob
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert restore_snapshot_if_available(str(db_path)) is False
    assert not db_path.exists()


# ----------------------------------------------------------------------
# snapshot_and_upload
# ----------------------------------------------------------------------


async def test_upload_disabled_returns_false(store: DuckDBStore) -> None:
    with patch.object(duckdb_config, "snapshot_enabled", False):
        assert await snapshot_and_upload(store) is False


async def test_upload_happy_path(store: DuckDBStore) -> None:
    bucket = MagicMock()
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert await snapshot_and_upload(store) is True
    blob = bucket.blob.return_value
    blob.upload_from_filename.assert_called_once()
    uploaded_path = blob.upload_from_filename.call_args[0][0]
    assert uploaded_path == f"{store.db_path}.snapshot.tmp"
    # The local temp snapshot is cleaned up after upload
    assert not Path(uploaded_path).exists()


async def test_upload_failure_never_raises(store: DuckDBStore) -> None:
    bucket = MagicMock()
    bucket.blob.return_value.upload_from_filename.side_effect = RuntimeError("gcs down")
    with _snapshot_on(), patch.object(snapshot_mod, "_bucket", return_value=bucket):
        assert await snapshot_and_upload(store) is False
    assert not Path(f"{store.db_path}.snapshot.tmp").exists()
