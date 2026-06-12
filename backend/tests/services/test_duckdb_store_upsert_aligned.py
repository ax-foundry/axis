"""Tests for keyed upserts on incremental sync slices.

Incremental syncs re-pull a lag window behind the watermark (so late-arriving
and re-scored source rows aren't lost to the strict ``>`` comparison). That
makes overlap with already-synced rows normal — ``_upsert_aligned`` must
replace those rows by natural key instead of blind-appending duplicates, and
must leave the live table untouched if anything in the slice fails.
"""

import pandas as pd
import pytest

from app.services.duckdb_store import DuckDBStore

_LIVE = "monitoring_results"
_KEYS = ["run_id", "dataset_id", "metric_name"]


@pytest.fixture
def store(tmp_path):
    s = DuckDBStore(str(tmp_path / "test.duckdb"))
    s._conn.execute(
        f"""
        CREATE TABLE {_LIVE} (
            run_id VARCHAR,
            dataset_id VARCHAR,
            metric_name VARCHAR,
            metric_score DOUBLE,
            "timestamp" TIMESTAMP
        )
        """
    )
    s._conn.execute(
        f"""
        INSERT INTO {_LIVE} VALUES
            ('run-1', 'ds-1', 'accuracy', 0.50, '2026-06-01 10:00:00'),
            ('run-1', 'ds-1', 'recall',   0.40, '2026-06-01 10:00:00'),
            ('run-2', 'ds-2', 'accuracy', 0.90, '2026-06-02 10:00:00')
        """
    )
    yield s
    s._conn.close()


def _make_staging(store: DuckDBStore, name: str, values_sql: str) -> str:
    store._conn.execute(
        f"""
        CREATE TABLE {name} (
            run_id VARCHAR,
            dataset_id VARCHAR,
            metric_name VARCHAR,
            metric_score DOUBLE,
            "timestamp" TIMESTAMP
        )
        """
    )
    store._conn.execute(f"INSERT INTO {name} VALUES {values_sql}")
    return name


def _rows(store: DuckDBStore) -> list[dict]:
    return store.query_list(
        f"SELECT run_id, dataset_id, metric_name, metric_score "
        f"FROM {_LIVE} ORDER BY run_id, metric_name"
    )


def test_upsert_replaces_by_composite_key(store: DuckDBStore) -> None:
    """A re-pulled row with an existing key replaces the stale copy — no dupes."""
    staging = _make_staging(
        store,
        "upsert_staging",
        "('run-1', 'ds-1', 'accuracy', 0.75, '2026-06-01 12:00:00'),"
        "('run-3', 'ds-3', 'accuracy', 0.60, '2026-06-03 10:00:00')",
    )

    store._upsert_aligned(_LIVE, staging, _KEYS, order_column="timestamp")

    rows = _rows(store)
    assert len(rows) == 4  # 3 original − 1 replaced + 2 inserted = 4
    updated = next(r for r in rows if r["run_id"] == "run-1" and r["metric_name"] == "accuracy")
    assert updated["metric_score"] == pytest.approx(0.75)
    # Untouched keys survive
    assert any(r["run_id"] == "run-2" for r in rows)
    assert any(r["run_id"] == "run-3" for r in rows)


def test_upsert_dedups_slice_keeping_latest_by_order_column(store: DuckDBStore) -> None:
    """Duplicate keys inside one slice collapse to the latest by order_column."""
    staging = _make_staging(
        store,
        "dedup_staging",
        "('run-1', 'ds-1', 'accuracy', 0.10, '2026-06-01 11:00:00'),"
        "('run-1', 'ds-1', 'accuracy', 0.99, '2026-06-01 13:00:00'),"
        "('run-1', 'ds-1', 'accuracy', 0.20, '2026-06-01 12:00:00')",
    )

    store._upsert_aligned(_LIVE, staging, _KEYS, order_column="timestamp")

    matches = store.query_list(
        f"SELECT metric_score FROM {_LIVE} "
        f"WHERE run_id = 'run-1' AND dataset_id = 'ds-1' AND metric_name = 'accuracy'"
    )
    assert len(matches) == 1
    assert matches[0]["metric_score"] == pytest.approx(0.99)


def test_upsert_null_key_part_matches(store: DuckDBStore) -> None:
    """IS NOT DISTINCT FROM: a NULL key part still matches its live NULL twin."""
    store._conn.execute(
        f"INSERT INTO {_LIVE} VALUES ('run-n', NULL, 'accuracy', 0.30, '2026-06-04 10:00:00')"
    )
    staging = _make_staging(
        store,
        "null_staging",
        "('run-n', NULL, 'accuracy', 0.80, '2026-06-04 12:00:00')",
    )

    store._upsert_aligned(_LIVE, staging, _KEYS, order_column="timestamp")

    matches = store.query_list(
        f"SELECT metric_score FROM {_LIVE} WHERE run_id = 'run-n' AND dataset_id IS NULL"
    )
    assert len(matches) == 1
    assert matches[0]["metric_score"] == pytest.approx(0.80)


def test_upsert_rolls_back_on_failure(store: DuckDBStore) -> None:
    """DELETE+INSERT are one transaction: a failed INSERT restores deleted rows."""
    staging = "rollback_staging"
    store._conn.execute(
        f"""
        CREATE TABLE {staging} (
            run_id VARCHAR,
            dataset_id VARCHAR,
            metric_name VARCHAR,
            metric_score VARCHAR,
            "timestamp" TIMESTAMP
        )
        """
    )
    # Key matches an existing live row (would be DELETEd), but the score can't
    # cast to DOUBLE so the INSERT fails after the DELETE ran.
    store._conn.execute(
        f"INSERT INTO {staging} VALUES "
        f"('run-1', 'ds-1', 'accuracy', 'not-a-number', '2026-06-01 12:00:00')"
    )

    before = _rows(store)
    with pytest.raises(Exception, match="(?i)convert|cast"):
        store._upsert_aligned(_LIVE, staging, _KEYS, order_column="timestamp")

    assert _rows(store) == before  # the DELETE was rolled back


def test_upsert_empty_keys_falls_back_to_append(store: DuckDBStore) -> None:
    """No key columns → plain aligned append (back-compat behavior)."""
    staging = _make_staging(
        store,
        "append_staging_compat",
        "('run-1', 'ds-1', 'accuracy', 0.75, '2026-06-01 12:00:00')",
    )

    store._upsert_aligned(_LIVE, staging, [], order_column="timestamp")

    matches = store.query_list(
        f"SELECT metric_score FROM {_LIVE} "
        f"WHERE run_id = 'run-1' AND metric_name = 'accuracy' ORDER BY metric_score"
    )
    assert len(matches) == 2  # appended alongside the original


def test_upsert_unknown_key_column_raises(store: DuckDBStore) -> None:
    staging = _make_staging(
        store,
        "badkey_staging",
        "('run-1', 'ds-1', 'accuracy', 0.75, '2026-06-01 12:00:00')",
    )

    with pytest.raises(ValueError, match="nonexistent_key"):
        store._upsert_aligned(_LIVE, staging, ["nonexistent_key"], order_column="timestamp")


def test_append_chunk_routes_through_upsert(store: DuckDBStore) -> None:
    """_append_chunk with key columns replaces instead of duplicating."""
    df = pd.DataFrame(
        {
            "run_id": ["run-1"],
            "dataset_id": ["ds-1"],
            "metric_name": ["accuracy"],
            "metric_score": [0.66],
            "timestamp": ["2026-06-01 14:00:00"],
        }
    )

    written = store._append_chunk(_LIVE, df, key_columns=_KEYS, order_column="timestamp")

    assert written == 1
    matches = store.query_list(
        f"SELECT metric_score FROM {_LIVE} WHERE run_id = 'run-1' AND metric_name = 'accuracy'"
    )
    assert len(matches) == 1
    assert matches[0]["metric_score"] == pytest.approx(0.66)
