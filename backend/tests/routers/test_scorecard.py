"""Tests for the YAML-driven /api/scorecard/{name}/{view} router."""

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.config.scorecards import ScorecardsConfig, ScorecardSpec
from app.services.duckdb_store import DuckDBStore


# ----------------------------------------------------------------------
# Fixtures
# ----------------------------------------------------------------------


def _seeded_store() -> DuckDBStore:
    """Build a DuckDBStore over :memory: with monitoring + cases tables seeded."""
    store = DuckDBStore.__new__(DuckDBStore)
    store._conn = duckdb.connect(":memory:")  # type: ignore[attr-defined]
    store.db_path = __file__  # any existing path satisfies has_table()'s exists() check

    import anyio
    import threading

    store._query_limiter = anyio.CapacityLimiter(8)  # type: ignore[attr-defined]
    store._cache_lock = threading.Lock()  # type: ignore[attr-defined]
    store._cached_metadata = {}  # type: ignore[attr-defined]
    store._sync_status = {}  # type: ignore[attr-defined]
    store._register_lock = threading.Lock()  # type: ignore[attr-defined]

    now = datetime.now(tz=timezone.utc)
    yesterday = (now - timedelta(days=1)).isoformat()
    last_week = (now - timedelta(days=6)).isoformat()
    long_ago = (now - timedelta(days=400)).isoformat()

    store._conn.execute("""
        CREATE TABLE monitoring_data (
            dataset_id VARCHAR,
            run_id VARCHAR,
            timestamp TIMESTAMP,
            metric_name VARCHAR,
            metric_score DOUBLE,
            threshold DOUBLE,
            passed BOOLEAN,
            source_name VARCHAR,
            environment VARCHAR,
            eval_mode VARCHAR,
            explanation VARCHAR
        )
    """)
    rows = [
        # alpha — recent, mixed pass/fail
        ("d1", "r1", yesterday, "Faithfulness", 0.95, 0.7, True, "alpha", "production", "online", "ok"),
        ("d2", "r1", yesterday, "Relevance", 0.40, 0.7, False, "alpha", "production", "online", "low"),
        ("d3", "r1", yesterday, "Step Reliability", 0.0, 0.7, False, "alpha", "production", "online", "step fail"),
        # beta — recent passes
        ("d4", "r2", last_week, "Faithfulness", 0.88, 0.7, True, "beta", "production", "online", "ok"),
        ("d5", "r2", last_week, "Relevance", 0.92, 0.7, True, "beta", "production", "online", "ok"),
        # alpha but staging — should be filtered out by base_filters
        ("d6", "r3", yesterday, "Faithfulness", 0.10, 0.7, False, "alpha", "staging", "online", "ignored"),
        # outside lookback window
        ("d7", "r4", long_ago, "Faithfulness", 0.50, 0.7, False, "alpha", "production", "online", "old"),
    ]
    store._conn.executemany(
        "INSERT INTO monitoring_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )

    store._conn.execute("""
        CREATE TABLE human_signals_cases (
            "Case_ID" VARCHAR,
            "Timestamp" VARCHAR,
            source_name VARCHAR,
            "Sentiment Category__sentiment" VARCHAR
        )
    """)
    store._conn.executemany(
        'INSERT INTO human_signals_cases VALUES (?, ?, ?, ?)',
        [
            ("c1", yesterday, "alpha", "positive"),
            ("c2", yesterday, "alpha", "frustrated"),
            ("c3", last_week, "beta", "neutral"),
            ("c4", long_ago, "alpha", "positive"),  # outside lookback
        ],
    )
    return store


@pytest.fixture
def seeded_store() -> DuckDBStore:
    return _seeded_store()


def _spec() -> ScorecardSpec:
    return ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "sentiment_table": "human_signals_cases",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "base_filters": [
                {"col": "environment", "op": "eq", "value": "production"},
                {"col": "eval_mode", "op": "eq", "value": "online"},
            ],
            "metrics": [
                {"name": "faithfulness", "match": "Faithfulness", "agg": "avg", "col": "metric_score"},
                {"name": "relevance", "match": "Relevance", "agg": "avg", "col": "metric_score"},
            ],
            "anomaly": {
                "failure_filter": [{"col": "passed", "op": "eq", "value": False}],
                "critical_rule": [
                    {"col": "metric_name", "op": "eq", "value": "Step Reliability"},
                    {"col": "metric_score", "op": "eq", "value": 0},
                ],
            },
            "sentiment": {
                "column": "Sentiment Category__sentiment",
                "timestamp_column": "Timestamp",
                "value_map": {
                    "positive": 1.0,
                    "neutral": 0.5,
                    "frustrated": 0.0,
                    "confused": 0.0,
                },
            },
            "detail_columns": ["dataset_id", "run_id", "metric_name", "metric_score", "explanation"],
        }
    )


@pytest.fixture
def client(seeded_store: DuckDBStore) -> Any:
    """TestClient with auth disabled, store + scorecards config patched."""
    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"demo": _spec()})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        yield TestClient(app)


# ----------------------------------------------------------------------
# Per-view happy paths
# ----------------------------------------------------------------------


def test_summary_returns_per_source_row(client: Any) -> None:
    resp = client.post("/api/scorecard/demo/summary", json={"lookback_days": 30})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    by_group = {r["group_key"]: r for r in body["rows"]}
    assert set(by_group) == {"alpha", "beta"}

    alpha = by_group["alpha"]
    # alpha has one Faithfulness=0.95 in production+online (the staging row is filtered out)
    assert alpha["faithfulness"] == pytest.approx(0.95)
    assert alpha["relevance"] == pytest.approx(0.40)
    # alpha has 2 failing rows (Relevance=0.40 and Step Reliability=0)
    assert alpha["anomaly_count"] == 2
    # alpha sentiment: positive(1.0) + frustrated(0.0) → 0.5
    assert alpha["sentiment_avg"] == pytest.approx(0.5)

    beta = by_group["beta"]
    assert beta["anomaly_count"] == 0
    assert beta["sentiment_avg"] == pytest.approx(0.5)  # neutral only


def test_timeseries_buckets_per_metric(client: Any) -> None:
    resp = client.post(
        "/api/scorecard/demo/timeseries",
        json={"lookback_days": 30, "source_filter": "alpha", "granularity": "day"},
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    # alpha has 3 production+online rows, all on yesterday → 3 metric_name buckets
    metrics = {r["metric_name"] for r in rows}
    assert metrics == {"Faithfulness", "Relevance", "Step Reliability"}
    # failures column populated
    by_metric = {r["metric_name"]: r for r in rows}
    assert by_metric["Step Reliability"]["failures"] == 1


def test_anomalies_counts_and_breakdown(client: Any) -> None:
    resp = client.post("/api/scorecard/demo/anomalies", json={"lookback_days": 30})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # alpha: 3 prod+online evals, 2 fail (Relevance + Step Reliability),
    # Step Reliability=0 → critical. beta: 2 evals, 0 fail.
    assert body["counts"]["total_evaluations"] == 5
    assert body["counts"]["total"] == 2
    assert body["counts"]["critical"] == 1
    assert body["counts"]["warning"] == 1


def test_anomalies_filtered_by_source(client: Any) -> None:
    resp = client.post(
        "/api/scorecard/demo/anomalies",
        json={"lookback_days": 30, "source_filter": "beta"},
    )
    assert resp.status_code == 200
    assert resp.json()["counts"]["total"] == 0


def test_anomaly_detail_returns_failing_rows(client: Any) -> None:
    resp = client.post(
        "/api/scorecard/demo/anomaly_detail",
        json={
            "lookback_days": 30,
            "source_filter": "alpha",
            "metric_name": "Step Reliability",
            "limit": 10,
        },
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) == 1
    assert rows[0]["dataset_id"] == "d3"
    assert rows[0]["explanation"] == "step fail"


def test_sentiment_per_source(client: Any) -> None:
    resp = client.post("/api/scorecard/demo/sentiment", json={"lookback_days": 30})
    assert resp.status_code == 200, resp.text
    by_group = {r["group_key"]: r for r in resp.json()["rows"]}
    assert by_group["alpha"]["sentiment_avg"] == pytest.approx(0.5)
    assert by_group["alpha"]["sample_count"] == 2
    assert by_group["beta"]["sentiment_avg"] == pytest.approx(0.5)


# ----------------------------------------------------------------------
# Error paths
# ----------------------------------------------------------------------


def test_unknown_scorecard_404(client: Any) -> None:
    resp = client.post("/api/scorecard/nope/summary", json={"lookback_days": 7})
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "scorecard_not_found"


def test_dataset_warming_when_table_missing(seeded_store: DuckDBStore) -> None:
    from app.config.env import settings
    from app.main import app

    seeded_store._conn.execute("DROP TABLE monitoring_data")
    cfg = ScorecardsConfig(scorecards={"demo": _spec()})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/demo/summary", json={"lookback_days": 7}
        )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "dataset_warming"


def test_misconfigured_column_returns_400_config_error(seeded_store: DuckDBStore) -> None:
    """A YAML that names a non-existent column surfaces as scorecard_config_error."""
    from app.config.env import settings
    from app.main import app

    bad = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "base_filters": [{"col": "does_not_exist", "op": "eq", "value": "x"}],
            "metrics": [
                {"name": "f", "match": "Faithfulness", "agg": "avg", "col": "metric_score"}
            ],
        }
    )
    cfg = ScorecardsConfig(scorecards={"broken": bad})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/broken/summary", json={"lookback_days": 7}
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


def test_validate_at_startup_with_missing_file_is_noop() -> None:
    from app.config.scorecards import validate_at_startup

    # No scorecards.yaml in the test environment — should not raise.
    validate_at_startup()
