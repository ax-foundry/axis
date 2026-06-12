"""Regression tests for schema-aligned incremental inserts.

These guard the monitoring "null columns / No trend data" corruption: the
incremental sync path used to do a positional ``INSERT INTO {live} SELECT *
FROM {staging}``, where ``{staging}`` was built by a separate per-CSV
``read_csv_auto``. When a watermark slice sampled sparse for a string/timestamp
column, that column was inferred with a different/NULL type and the positional
copy silently wrote NULLs into the live column (numeric ``metric_score`` /
``latency`` survived because they sampled cleanly). ``_insert_aligned`` now
matches columns BY NAME with explicit casts to the live schema, so order
scrambles and per-CSV type drift can no longer corrupt the live table.
"""

import pandas as pd
import pytest

from app.services.duckdb_store import DuckDBStore

# The live monitoring sub-table the analytics views join on. Column order here
# is the "true" schema; staging relations below deliberately differ from it.
_LIVE = "monitoring_results"


@pytest.fixture
def store(tmp_path):
    s = DuckDBStore(str(tmp_path / "test.duckdb"))
    s._conn.execute(
        f"""
        CREATE TABLE {_LIVE} (
            trace_id VARCHAR,
            "timestamp" TIMESTAMP,
            metric_name VARCHAR,
            metric_score DOUBLE,
            environment VARCHAR
        )
        """
    )
    yield s
    s._conn.close()


def _fetch(store: DuckDBStore, trace_id: str) -> dict:
    rows = store.query_list(
        f'SELECT trace_id, "timestamp", metric_name, metric_score, environment '
        f"FROM {_LIVE} WHERE trace_id = ?",
        [trace_id],
    )
    assert len(rows) == 1, f"expected exactly one row for {trace_id}, got {len(rows)}"
    return rows[0]


def test_insert_aligned_matches_by_name_not_position(store: DuckDBStore) -> None:
    """Scrambled column order + a VARCHAR timestamp must land by NAME, fully typed.

    A positional ``SELECT *`` would shove ``metric_score`` into ``trace_id`` and
    null out the rest. By-name + cast keeps every value in its real column and
    parses the string timestamp into the live TIMESTAMP column.
    """
    staging = f"{_LIVE}_staging"
    store._conn.execute(
        f"""
        CREATE TABLE {staging} (
            metric_score DOUBLE,
            trace_id VARCHAR,
            "timestamp" VARCHAR,
            metric_name VARCHAR,
            environment VARCHAR
        )
        """
    )
    store._conn.execute(
        f"""
        INSERT INTO {staging} VALUES
            (0.91, 'trace-1', '2026-06-01 12:00:00', 'accuracy', 'production'),
            (0.42, 'trace-2', '2026-06-02 13:30:00', 'latency', 'staging')
        """
    )

    store._insert_aligned(_LIVE, staging)

    row = _fetch(store, "trace-1")
    assert row["metric_name"] == "accuracy"
    assert row["metric_score"] == pytest.approx(0.91)
    assert row["environment"] == "production"
    # The corruption symptom was null timestamp -> "No trend data available".
    assert row["timestamp"] is not None
    assert str(row["timestamp"]).startswith("2026-06-01 12:00:00")


def test_insert_aligned_missing_column_raises(store: DuckDBStore) -> None:
    """A live column absent from the source must abort the insert, not NULL-fill.

    NULL-filling here is silent corruption: an upstream column rename/drop would
    quietly write NULLs into the live column on every incremental slice (the
    exact "-" columns symptom). Failing loudly turns it into a sync error, which
    clears watermarks and forces a full rebuild on the next tick.
    """
    staging = f"{_LIVE}_staging_missing"
    store._conn.execute(
        f"""
        CREATE TABLE {staging} (
            trace_id VARCHAR,
            "timestamp" VARCHAR,
            metric_name VARCHAR,
            metric_score DOUBLE
        )
        """
    )  # no environment column
    store._conn.execute(
        f"INSERT INTO {staging} VALUES ('trace-3', '2026-06-03 00:00:00', 'recall', 0.5)"
    )

    with pytest.raises(ValueError, match="environment"):
        store._insert_aligned(_LIVE, staging)

    # Nothing was inserted — the live table is untouched.
    count = store.query_value(f"SELECT COUNT(*) FROM {_LIVE} WHERE trace_id = 'trace-3'")
    assert count == 0


def test_insert_aligned_extra_source_column_is_ignored(store: DuckDBStore) -> None:
    """A source column with no live counterpart is dropped, not appended/positional-shifted."""
    staging = f"{_LIVE}_staging_extra"
    store._conn.execute(
        f"""
        CREATE TABLE {staging} (
            trace_id VARCHAR,
            "timestamp" VARCHAR,
            metric_name VARCHAR,
            metric_score DOUBLE,
            environment VARCHAR,
            junk VARCHAR
        )
        """
    )
    store._conn.execute(
        f"INSERT INTO {staging} VALUES "
        f"('trace-4', '2026-06-04 00:00:00', 'f1', 0.6, 'production', 'ignore-me')"
    )

    store._insert_aligned(_LIVE, staging)

    row = _fetch(store, "trace-4")
    assert "junk" not in row
    assert row["metric_score"] == pytest.approx(0.6)
    assert row["environment"] == "production"


def test_append_chunk_aligns_dataframe_by_name(store: DuckDBStore) -> None:
    """_append_chunk (DataFrame path) routes through aligned insert."""
    df = pd.DataFrame(
        {
            "metric_name": ["precision"],
            "environment": ["staging"],
            "trace_id": ["trace-df"],
            "metric_score": [0.33],
            "timestamp": ["2026-06-05 10:00:00"],
        }
    )

    appended = store._append_chunk(_LIVE, df)

    assert appended == 1
    row = _fetch(store, "trace-df")
    assert row["metric_name"] == "precision"
    assert row["metric_score"] == pytest.approx(0.33)
    assert row["environment"] == "staging"
    assert row["timestamp"] is not None


def test_append_csv_aligns_and_cleans_up_staging(store: DuckDBStore, tmp_path) -> None:
    """_append_csv stages with deterministic typing, aligns by name, drops its staging."""
    csv_path = tmp_path / "append.csv"
    # Scrambled header order vs the live schema.
    csv_path.write_text(
        "environment,trace_id,metric_score,metric_name,timestamp\n"
        "production,trace-csv,0.7,recall,2026-06-06 09:00:00\n"
    )

    appended = store._append_csv(_LIVE, str(csv_path))

    assert appended == 1
    row = _fetch(store, "trace-csv")
    assert row["metric_score"] == pytest.approx(0.7)
    assert row["environment"] == "production"
    assert row["timestamp"] is not None
    # The temporary append-staging table must not linger.
    assert not store._has_internal_table(f"{_LIVE}_append_staging")


def test_deterministic_staging_preserves_sparse_string_column(store: DuckDBStore, tmp_path) -> None:
    """A string column empty across the early sampled rows still types as VARCHAR.

    With default sampling, ``read_csv_auto`` infers types from a leading sample;
    a column that's empty there can be mis-inferred and later values lost. The
    sync now reads with sample_size=-1, so the late non-empty value survives.
    """
    csv_path = tmp_path / "sparse.csv"
    lines = ["trace_id,note"]
    lines += [f"trace-{i}," for i in range(3000)]  # empty note for the early window
    lines.append("trace-late,hello-world")
    csv_path.write_text("\n".join(lines) + "\n")

    store._write_csv_to_staging(_LIVE, str(csv_path))
    staging = f"{_LIVE}_staging"

    schema = dict(store._get_table_schema(staging))
    assert schema["note"].upper().startswith("VARCHAR")
    value = store.query_value(f"SELECT note FROM {staging} WHERE trace_id = 'trace-late'")
    assert value == "hello-world"
