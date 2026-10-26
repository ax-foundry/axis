"""Split sync when one sub-table returns no rows.

A zero-row source query succeeds without creating its DuckDB table, so the
join view cannot be built. The sync must still finish as ready with zero rows
instead of failing on the missing view.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import sync_engine
from app.services.duckdb_store import DuckDBStore
from app.services.sync_engine import SyncResult, _sync_split


@pytest.fixture
def store(tmp_path) -> DuckDBStore:
    s = DuckDBStore(str(tmp_path / "test.duckdb"))
    yield s
    s._conn.close()


def _config() -> SimpleNamespace:
    return SimpleNamespace(
        dataset_query="SELECT 1",
        results_query="SELECT 1",
        incremental_column=None,
        dataset_primary_key=None,
        results_primary_key=None,
        incremental_lag_minutes=0,
    )


async def test_empty_results_sub_table_reports_zero_rows(store, monkeypatch) -> None:
    async def fake_sync_internal_table(
        config: Any, table_name: str, store: DuckDBStore, **_: Any
    ) -> SyncResult:
        if table_name == "human_signals_dataset":
            store._conn.execute(f"CREATE TABLE {table_name} AS SELECT 1 AS dataset_id")
            return SyncResult(table_name, 1, 0.0, "success")
        return SyncResult(table_name, 0, 0.0, "success")

    monkeypatch.setattr(sync_engine, "_sync_internal_table", fake_sync_internal_table)

    result = await _sync_split(_config(), "human_signals_data", store)

    assert result.status == "success", result.error
    assert result.rows_synced == 0
    status = store._sync_status["human_signals_data"]
    assert status.state == "ready"
    assert status.rows == 0
    assert not store._has_internal_table("human_signals_data")
