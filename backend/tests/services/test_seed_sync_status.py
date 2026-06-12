"""Tests for seed_sync_status — startup status seeding before serving begins.

Seeding runs synchronously in the FastAPI lifespan, before uvicorn accepts
requests, so no consumer can ever observe an auto-load dataset in the default
"not_synced" state while its startup sync simply hasn't registered yet (that
window is what let the frontend fall back to the legacy client-side import).
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.config.db.duckdb import duckdb_config
from app.services.duckdb_store import DuckDBStore
from app.services.sync_engine import seed_sync_status

_TABLE = "monitoring_data"


def _config(**overrides: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "enabled": True,
        "is_configured": True,
        "has_query": True,
        "should_auto_load": True,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture
def store(tmp_path) -> DuckDBStore:
    s = DuckDBStore(str(tmp_path / "test.duckdb"))
    yield s
    s._conn.close()


def _seed(store: DuckDBStore, config: SimpleNamespace, sync_mode: str = "startup") -> None:
    with (
        patch(
            "app.services.sync_engine._dataset_configs",
            return_value=[(config, _TABLE)],
        ),
        patch.object(duckdb_config, "sync_mode", sync_mode),
    ):
        seed_sync_status(store)


def test_auto_load_without_table_seeds_syncing(store: DuckDBStore) -> None:
    _seed(store, _config())

    assert store.get_sync_status(_TABLE).state == "syncing"
    # Seeding is for status consumers only — it must not register as a running
    # sync, or the actual startup sync would see itself as a duplicate and skip.
    assert _TABLE not in store._sync_inflight


def test_existing_table_with_metadata_seeds_ready(store: DuckDBStore) -> None:
    store._conn.execute(f"CREATE TABLE {_TABLE} (trace_id VARCHAR)")
    store._conn.execute(f"INSERT INTO {_TABLE} VALUES ('t1'), ('t2')")
    store._cached_metadata[_TABLE] = {"row_count": 2}
    store.set_kv(f"_last_sync_{_TABLE}", "2026-06-10T03:00:00")

    _seed(store, _config())

    status = store.get_sync_status(_TABLE)
    assert status.state == "ready"
    assert status.rows == 2
    assert status.last_sync == datetime(2026, 6, 10, 3, 0, 0)


def test_existing_table_without_metadata_falls_back_to_syncing(store: DuckDBStore) -> None:
    """A table with no persisted row_count isn't trustworthy — treat as warming."""
    store._conn.execute(f"CREATE TABLE {_TABLE} (trace_id VARCHAR)")

    _seed(store, _config())

    assert store.get_sync_status(_TABLE).state == "syncing"


def test_disabled_dataset_left_unseeded(store: DuckDBStore) -> None:
    _seed(store, _config(enabled=False))

    assert store.get_sync_status(_TABLE).state == "not_synced"


def test_manual_sync_mode_left_unseeded(store: DuckDBStore) -> None:
    """sync_mode != startup means no startup sync is coming — don't claim one is."""
    _seed(store, _config(), sync_mode="manual")

    assert store.get_sync_status(_TABLE).state == "not_synced"


def test_no_auto_load_left_unseeded(store: DuckDBStore) -> None:
    _seed(store, _config(should_auto_load=False))

    assert store.get_sync_status(_TABLE).state == "not_synced"


def test_ready_seed_wins_over_auto_load_branch(store: DuckDBStore) -> None:
    """Existing data + auto_load seeds ready, not syncing — restored/persistent
    disks must serve immediately while the background sync tops up."""
    store._conn.execute(f"CREATE TABLE {_TABLE} (trace_id VARCHAR)")
    store._cached_metadata[_TABLE] = {"row_count": 1}

    _seed(store, _config())

    assert store.get_sync_status(_TABLE).state == "ready"
