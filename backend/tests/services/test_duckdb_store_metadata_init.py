"""Regression tests for the _store_metadata catalog race.

Two datasets syncing concurrently on a fresh database both ran
CREATE TABLE IF NOT EXISTS _store_metadata from their own cursor
transactions, and DuckDB raised "Catalog write-write conflict on create"
for the loser — failing an otherwise-successful sync. The store now
creates the table once at init, before any concurrency exists.
"""

import threading

from app.services.duckdb_store import DuckDBStore


def _make_store(tmp_path) -> DuckDBStore:
    return DuckDBStore(str(tmp_path / "fresh.duckdb"))


def test_metadata_table_exists_immediately_after_init(tmp_path) -> None:
    store = _make_store(tmp_path)
    try:
        count = store.query_value("SELECT COUNT(*) FROM _store_metadata")
        assert count == 0
    finally:
        store._conn.close()


def test_concurrent_metadata_writes_on_fresh_store(tmp_path) -> None:
    """Concurrent post-sync metadata persists must all succeed on a fresh DB."""
    store = _make_store(tmp_path)
    errors: list[Exception] = []

    def _write(i: int) -> None:
        try:
            with store._cursor() as cur:
                cur.execute(f"CREATE TABLE IF NOT EXISTS t{i} (x INTEGER)")
            store._compute_and_persist_metadata(f"t{i}")
            store.set_kv(f"_watermark_t{i}", "2026-06-12 00:00:00")
        except Exception as exc:
            errors.append(exc)

    try:
        threads = [threading.Thread(target=_write, args=(i,)) for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"concurrent metadata writes failed: {errors}"
        for i in range(8):
            assert store.get_kv(f"_watermark_t{i}") == "2026-06-12 00:00:00"
    finally:
        store._conn.close()
