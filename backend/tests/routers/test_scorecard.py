"""Tests for the YAML-driven /api/scorecard/{name}/{view} router."""

from datetime import UTC, datetime, timedelta
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

    import threading

    import anyio

    store._query_limiter = anyio.CapacityLimiter(8)  # type: ignore[attr-defined]
    store._cache_lock = threading.Lock()  # type: ignore[attr-defined]
    store._cached_metadata = {}  # type: ignore[attr-defined]
    store._sync_status = {}  # type: ignore[attr-defined]
    store._register_lock = threading.Lock()  # type: ignore[attr-defined]

    now = datetime.now(tz=UTC)
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
            explanation VARCHAR,
            signals VARCHAR
        )
    """)
    _sig_pass = '{"overall":{"status":"pass","value":0.95}}'
    _sig_fail = '{"overall":{"status":"fail","value":0.40}}'
    rows = [
        # alpha — recent, mixed pass/fail
        ("d1", "r1", yesterday, "Faithfulness", 0.95, 0.7, True, "alpha", "production", "online", "ok", _sig_pass),
        ("d2", "r1", yesterday, "Relevance", 0.40, 0.7, False, "alpha", "production", "online", "low", _sig_fail),
        ("d3", "r1", yesterday, "Step Reliability", 0.0, 0.7, False, "alpha", "production", "online", "step fail", None),
        # beta — recent passes
        ("d4", "r2", last_week, "Faithfulness", 0.88, 0.7, True, "beta", "production", "online", "ok", None),
        ("d5", "r2", last_week, "Relevance", 0.92, 0.7, True, "beta", "production", "online", "ok", None),
        # alpha but staging — should be filtered out by base_filters
        ("d6", "r3", yesterday, "Faithfulness", 0.10, 0.7, False, "alpha", "staging", "online", "ignored", None),
        # outside lookback window
        ("d7", "r4", long_ago, "Faithfulness", 0.50, 0.7, False, "alpha", "production", "online", "old", None),
    ]
    store._conn.executemany(
        "INSERT INTO monitoring_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            "signals": {
                "group_column": "source_name",
                "timestamp_column": "Timestamp",
                "case_id_column": "Case_ID",
                "metrics": [
                    {"key": "Sentiment Category__sentiment", "match_values": ["frustrated", "confused"]},
                ],
                "detail_columns": ["Sentiment Category__sentiment"],
            },
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


# ----------------------------------------------------------------------
# signals view — happy paths
# ----------------------------------------------------------------------


def test_signals_counts_per_source(client: Any) -> None:
    resp = client.post("/api/scorecard/demo/signals", json={"lookback_days": 30})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # alpha has c2 ("frustrated") within lookback — matches match_values
    # beta has c3 ("neutral") — not in match_values, so no row for beta
    by_group = {r["group_key"]: r for r in body["rows"]}
    assert "alpha" in by_group
    alpha = by_group["alpha"]
    assert alpha["total_signals"] == 1
    assert len(alpha["by_signal"]) == 1
    assert alpha["by_signal"][0]["signal_key"] == "Sentiment Category__sentiment"
    assert alpha["by_signal"][0]["value"] == "frustrated"
    assert alpha["by_signal"][0]["count"] == 1
    assert alpha["last_signal_at"] is not None


def test_signals_applies_lookback(client: Any) -> None:
    # c4 ("positive", long_ago=400 days) is outside a 7-day lookback — all signals filtered
    resp = client.post("/api/scorecard/demo/signals", json={"lookback_days": 7})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # alpha: c1/c2 are "yesterday" (within 7d), c2 is frustrated → 1 signal
    by_group = {r["group_key"]: r for r in body["rows"]}
    assert by_group["alpha"]["total_signals"] == 1


def test_signals_empty_result_envelope(client: Any) -> None:
    # A 0-day lookback would filter everything — but min is 1 day, so use a spec
    # where no match_values match any row to confirm empty envelope is {"rows": [], "row_count": 0}
    from app.config.env import settings
    from app.main import app

    no_match_spec = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "sentiment_table": "human_signals_cases",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "metrics": [],
            "signals": {
                "group_column": "source_name",
                "timestamp_column": "Timestamp",
                "case_id_column": "Case_ID",
                "metrics": [
                    {"key": "Sentiment Category__sentiment", "match_values": ["no_such_value"]},
                ],
            },
        }
    )
    cfg = ScorecardsConfig(scorecards={"empty": no_match_spec})
    seeded = _seeded_store()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post("/api/scorecard/empty/signals", json={"lookback_days": 30})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"rows": [], "row_count": 0}


# ----------------------------------------------------------------------
# signal_detail view — happy paths
# ----------------------------------------------------------------------


def test_signal_detail_returns_cases(client: Any) -> None:
    resp = client.post(
        "/api/scorecard/demo/signal_detail",
        json={
            "lookback_days": 30,
            "source_filter": "alpha",
            "signal_key": "Sentiment Category__sentiment",
        },
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    # alpha: c2 "frustrated" is the only match; c1 "positive" not in match_values;
    # c4 "positive" is outside lookback
    assert len(rows) == 1
    assert rows[0]["case_id"] == "c2"
    assert rows[0]["source_name"] == "alpha"
    assert rows[0]["signal_key"] == "Sentiment Category__sentiment"
    assert rows[0]["signal_value"] == "frustrated"
    assert "context" in rows[0]
    assert rows[0]["context"]["Sentiment Category__sentiment"] == "frustrated"


def test_signal_detail_source_filter(client: Any) -> None:
    # beta has only "neutral" — not in match_values → empty result
    resp = client.post(
        "/api/scorecard/demo/signal_detail",
        json={"lookback_days": 30, "source_filter": "beta"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"rows": [], "row_count": 0}


def test_signal_detail_no_signal_key_returns_all(client: Any) -> None:
    # Omitting signal_key queries all configured metrics (same result here since only one metric)
    resp = client.post(
        "/api/scorecard/demo/signal_detail",
        json={"lookback_days": 30, "source_filter": "alpha"},
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) == 1
    assert rows[0]["signal_key"] == "Sentiment Category__sentiment"


def test_signal_detail_respects_limit(client: Any) -> None:
    resp = client.post(
        "/api/scorecard/demo/signal_detail",
        json={"lookback_days": 30, "source_filter": "alpha", "limit": 1},
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["rows"]) <= 1


# ----------------------------------------------------------------------
# signals / signal_detail — error paths
# ----------------------------------------------------------------------


def test_signals_missing_config_returns_400(seeded_store: DuckDBStore) -> None:
    from app.config.env import settings
    from app.main import app

    # Spec without a signals block
    no_signals_spec = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "metrics": [],
        }
    )
    cfg = ScorecardsConfig(scorecards={"ns": no_signals_spec})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post("/api/scorecard/ns/signals", json={"lookback_days": 7})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


def test_signal_detail_missing_config_returns_400(seeded_store: DuckDBStore) -> None:
    from app.config.env import settings
    from app.main import app

    no_signals_spec = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "metrics": [],
        }
    )
    cfg = ScorecardsConfig(scorecards={"ns": no_signals_spec})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/ns/signal_detail",
            json={"lookback_days": 7, "source_filter": "alpha"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


def test_signals_bad_metric_key_returns_400(seeded_store: DuckDBStore) -> None:
    from app.config.env import settings
    from app.main import app

    bad_spec = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "sentiment_table": "human_signals_cases",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "metrics": [],
            "signals": {
                "group_column": "source_name",
                "timestamp_column": "Timestamp",
                "case_id_column": "Case_ID",
                "metrics": [
                    {"key": "nonexistent_column", "match_values": ["true"]},
                ],
            },
        }
    )
    cfg = ScorecardsConfig(scorecards={"bad": bad_spec})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post("/api/scorecard/bad/signals", json={"lookback_days": 7})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


# ----------------------------------------------------------------------
# metric_name scoping — signals and signal_detail
#
# Spec has three signal entries sharing the same column but different match_values
# and metric_names, so we can verify inclusion/exclusion independently:
#   - Faithfulness-tagged: matches "frustrated"  (alpha c2)
#   - Relevance-tagged:    matches "positive"    (alpha c1)
#   - universal (no tag):  matches "neutral"     (beta  c3)
# ----------------------------------------------------------------------


def _scoped_cfg() -> ScorecardsConfig:
    spec = ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "sentiment_table": "human_signals_cases",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "metrics": [],
            "signals": {
                "group_column": "source_name",
                "timestamp_column": "Timestamp",
                "case_id_column": "Case_ID",
                "metrics": [
                    {
                        "key": "Sentiment Category__sentiment",
                        "match_values": ["frustrated"],
                        "metric_names": ["Faithfulness"],
                    },
                    {
                        "key": "Sentiment Category__sentiment",
                        "match_values": ["positive"],
                        "metric_names": ["Relevance"],
                    },
                    {
                        # universal — no metric_names
                        "key": "Sentiment Category__sentiment",
                        "match_values": ["neutral"],
                    },
                ],
                "detail_columns": ["Sentiment Category__sentiment"],
            },
        }
    )
    return ScorecardsConfig(scorecards={"scoped": spec})


def _scoped_client(seeded_store: DuckDBStore) -> TestClient:
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    ctx = (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    )
    # Enter all context managers manually so the TestClient can be used outside a `with`.
    # Tests that use this helper call it inside their own `with` block or accept the client
    # from a fixture. Here we return the client directly for inline use.
    import contextlib

    stack = contextlib.ExitStack()
    for c in ctx:
        stack.enter_context(c)
    client = TestClient(app)
    return client


def test_metric_name_includes_tagged_signal(seeded_store: DuckDBStore) -> None:
    """Signal tagged for Faithfulness is returned when metric_name=Faithfulness."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/scoped/signal_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Faithfulness"},
        )
    assert resp.status_code == 200, resp.text
    case_ids = {r["case_id"] for r in resp.json()["rows"]}
    assert "c2" in case_ids  # "frustrated" — Faithfulness-tagged


def test_metric_name_excludes_differently_tagged_signal(seeded_store: DuckDBStore) -> None:
    """Signal tagged for Relevance is excluded when metric_name=Faithfulness."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/scoped/signal_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Faithfulness"},
        )
    assert resp.status_code == 200, resp.text
    case_ids = {r["case_id"] for r in resp.json()["rows"]}
    assert "c1" not in case_ids  # "positive" — Relevance-tagged, must be excluded


def test_metric_name_includes_universal_signal(seeded_store: DuckDBStore) -> None:
    """Signal with no metric_names (universal) is always included regardless of filter."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/scoped/signal_detail",
            # beta has "neutral" which matches the universal signal
            json={"lookback_days": 30, "source_filter": "beta", "metric_name": "Faithfulness"},
        )
    assert resp.status_code == 200, resp.text
    case_ids = {r["case_id"] for r in resp.json()["rows"]}
    assert "c3" in case_ids  # "neutral" — universal, must be included


def test_no_metric_name_returns_all_signals(seeded_store: DuckDBStore) -> None:
    """Omitting metric_name preserves current behavior — all signals returned."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/scoped/signal_detail",
            json={"lookback_days": 30, "source_filter": "alpha"},
        )
    assert resp.status_code == 200, resp.text
    case_ids = {r["case_id"] for r in resp.json()["rows"]}
    # Without metric_name filter, both Faithfulness-tagged (c2) and Relevance-tagged (c1) returned
    assert "c1" in case_ids
    assert "c2" in case_ids


def test_signal_key_and_metric_name_are_anded(seeded_store: DuckDBStore) -> None:
    """signal_key + metric_name are AND'd: signal must satisfy both filters."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/scoped/signal_detail",
            json={
                "lookback_days": 30,
                "source_filter": "alpha",
                "signal_key": "Sentiment Category__sentiment",
                "metric_name": "Faithfulness",
            },
        )
    assert resp.status_code == 200, resp.text
    case_ids = {r["case_id"] for r in resp.json()["rows"]}
    # signal_key alone would also match c1 (positive, Relevance-tagged).
    # With metric_name=Faithfulness, c1 is excluded; only c2 (frustrated) passes.
    assert "c2" in case_ids
    assert "c1" not in case_ids


def test_signals_view_metric_name_scoping(seeded_store: DuckDBStore) -> None:
    """Signals view respects metric_name: totals reflect only the scoped subset."""
    from app.config.env import settings
    from app.main import app

    cfg = _scoped_cfg()
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        # Without metric_name: alpha has frustrated(1) + positive(1) = 2 signals
        resp_all = TestClient(app).post(
            "/api/scorecard/scoped/signals", json={"lookback_days": 30}
        )
        # With metric_name=Faithfulness: alpha has only frustrated(1) = 1 signal
        resp_scoped = TestClient(app).post(
            "/api/scorecard/scoped/signals",
            json={"lookback_days": 30, "metric_name": "Faithfulness"},
        )

    assert resp_all.status_code == 200, resp_all.text
    assert resp_scoped.status_code == 200, resp_scoped.text

    all_by_group = {r["group_key"]: r for r in resp_all.json()["rows"]}
    scoped_by_group = {r["group_key"]: r for r in resp_scoped.json()["rows"]}

    assert all_by_group["alpha"]["total_signals"] == 2
    assert scoped_by_group["alpha"]["total_signals"] == 1


# ----------------------------------------------------------------------
# json_passthrough_columns — anomaly_detail blob projection
# ----------------------------------------------------------------------


def _passthrough_spec(*, include_in_passthrough: bool, include_in_filter: bool = False) -> ScorecardSpec:
    """Build a spec with `signals` in detail_columns, optionally in json_passthrough_columns."""
    base_filters = [{"col": "environment", "op": "eq", "value": "production"}]
    if include_in_filter:
        # Trying to filter on a JSON blob column (even a passthrough one) must be rejected.
        base_filters.append({"col": "signals", "op": "is_not_null"})
    return ScorecardSpec.model_validate(
        {
            "source_table": "monitoring_data",
            "group_column": "source_name",
            "timestamp_column": "timestamp",
            "base_filters": base_filters,
            "metrics": [],
            "anomaly": {
                "failure_filter": [{"col": "passed", "op": "eq", "value": False}],
            },
            "json_passthrough_columns": ["signals"] if include_in_passthrough else [],
            "detail_columns": ["dataset_id", "explanation", "signals"],
        }
    )


def test_json_passthrough_allows_blob_projection(seeded_store: DuckDBStore) -> None:
    """`signals` in json_passthrough_columns → anomaly_detail returns it as a valid JSON string."""
    import json as json_mod

    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"pt": _passthrough_spec(include_in_passthrough=True)})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        # d2 is the failing Relevance row; it has a signals JSON string set in the fixture.
        resp = TestClient(app).post(
            "/api/scorecard/pt/anomaly_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Relevance"},
        )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) == 1, "expected the failing Relevance row (d2)"
    assert "signals" in rows[0]
    signals_raw = rows[0]["signals"]
    assert isinstance(signals_raw, str), "signals must be a JSON string, not a Python repr"
    parsed = json_mod.loads(signals_raw)  # raises ValueError if content is Python repr
    assert parsed["overall"]["status"] == "fail"


def test_json_passthrough_dict_reserializes_to_json_string(seeded_store: DuckDBStore) -> None:
    """When DuckDB returns a passthrough column as a Python dict, the endpoint re-serializes it."""
    import json as json_mod
    from unittest.mock import AsyncMock

    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"pt": _passthrough_spec(include_in_passthrough=True)})
    # Simulate DuckDB deserializing a JSON/STRUCT column into a Python dict (with Python None).
    fake_dict = {"Claim 1": [{"name": "claim_text", "status": None, "value": "abc"}]}
    fake_row = {"dataset_id": "d99", "explanation": "test", "signals": fake_dict}

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
        patch("app.routers.scorecard._run_query", new=AsyncMock(return_value=[fake_row])),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/pt/anomaly_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Relevance"},
        )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) == 1
    signals_raw = rows[0]["signals"]
    assert isinstance(signals_raw, str), "dict must be re-serialized to a JSON string"
    # Python repr would have single-quoted keys and `None` not `null`; json.loads rejects it.
    parsed = json_mod.loads(signals_raw)
    assert "Claim 1" in parsed
    assert parsed["Claim 1"][0]["status"] is None  # Python None, not the string "None"


def test_blob_column_without_passthrough_returns_400(seeded_store: DuckDBStore) -> None:
    """`signals` in detail_columns but NOT in json_passthrough_columns → 400."""
    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"npt": _passthrough_spec(include_in_passthrough=False)})
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/npt/anomaly_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Faithfulness"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


def test_filter_on_passthrough_column_still_rejected(seeded_store: DuckDBStore) -> None:
    """Even when a column is in json_passthrough_columns, filtering on it is rejected."""
    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(
        scorecards={
            "pf": _passthrough_spec(include_in_passthrough=True, include_in_filter=True)
        }
    )
    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/pf/anomaly_detail",
            json={"lookback_days": 30, "source_filter": "alpha", "metric_name": "Faithfulness"},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "scorecard_config_error"


# ----------------------------------------------------------------------
# metric_summary view — LLM-powered pattern rollup
# ----------------------------------------------------------------------


def _spec_with_signals_passthrough() -> ScorecardSpec:
    """Same as _spec() but exposes signals as a JSON-passthrough detail column."""
    base = _spec().model_dump()
    base["detail_columns"] = [
        "dataset_id",
        "run_id",
        "metric_name",
        "metric_score",
        "explanation",
        "signals",
    ]
    base["json_passthrough_columns"] = ["signals"]
    return ScorecardSpec.model_validate(base)


def test_metric_summary_returns_patterns_and_learnings(seeded_store: DuckDBStore) -> None:
    """Endpoint passes signals + critique to the LLM, returns structured rollup."""
    from unittest.mock import AsyncMock, MagicMock

    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"demo": _spec_with_signals_passthrough()})

    fake_pattern = MagicMock(
        category="Citation drift",
        description="Claims unsupported by retrieved context.",
        count=2,
        metrics_involved=["Relevance"],
        examples=["d2: low relevance"],
        distinct_test_cases=2,
        is_cross_metric=False,
        confidence=0.8,
    )
    fake_learning = MagicMock(
        title="Tighten retrieval threshold",
        content="Failures cluster on low-similarity matches.",
        tags=["retrieval"],
        confidence=0.75,
        recommended_actions=["Raise top-k cutoff", "Add reranker"],
        scope="Relevance",
        when_not_to_apply=None,
    )
    fake_result = MagicMock(patterns=[fake_pattern], learnings=[fake_learning])

    captured: dict[str, Any] = {}

    async def fake_generate(extraction_result, **kwargs):  # type: ignore[no-untyped-def]
        captured["extraction_result"] = extraction_result
        return fake_result

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
        patch(
            "app.services.issue_extractor_service.generate_insights",
            new=AsyncMock(side_effect=fake_generate),
        ),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/demo/metric_summary",
            json={
                "lookback_days": 30,
                "source_filter": "alpha",
                "metric_name": "Relevance",
                "max_issues": 50,
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metric_name"] == "Relevance"
    assert body["lookback_days"] == 30
    assert body["total_failed_available"] >= body["total_issues_analyzed"]
    assert body["total_failed_available"] >= 1

    assert len(body["patterns"]) == 1
    assert body["patterns"][0]["category"] == "Citation drift"
    assert body["patterns"][0]["count"] == 2

    assert len(body["learnings"]) == 1
    assert body["learnings"][0]["title"] == "Tighten retrieval threshold"
    assert body["learnings"][0]["recommended_actions"] == ["Raise top-k cutoff", "Add reranker"]

    extraction = captured["extraction_result"]
    assert extraction.issues, "expected at least one extracted issue"
    issue = extraction.issues[0]
    assert issue.critique and "low" in issue.critique
    assert issue.signals


def test_metric_summary_empty_when_no_failures(seeded_store: DuckDBStore) -> None:
    """No failing rows → empty patterns/learnings without invoking the LLM."""
    from unittest.mock import AsyncMock

    from app.config.env import settings
    from app.main import app

    cfg = ScorecardsConfig(scorecards={"demo": _spec_with_signals_passthrough()})
    gen = AsyncMock()

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
        patch("app.services.issue_extractor_service.generate_insights", new=gen),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/demo/metric_summary",
            json={
                "lookback_days": 30,
                "source_filter": "beta",
                "metric_name": "Faithfulness",
            },
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["patterns"] == []
    assert body["learnings"] == []
    assert body["total_failed_available"] == 0
    assert body["total_issues_analyzed"] == 0
    gen.assert_not_called()


def test_metric_summary_includes_high_score_failures(seeded_store: DuckDBStore) -> None:
    """A row with passed=False and metric_score=0.8 must reach the LLM —
    SQL's failure_filter is authoritative; no second-pass score gating.
    """
    from datetime import datetime, timedelta
    from unittest.mock import AsyncMock, MagicMock

    from app.config.env import settings
    from app.main import app

    yesterday = (datetime.now(tz=UTC) - timedelta(days=1)).isoformat()
    seeded_store._conn.execute(  # type: ignore[attr-defined]
        "INSERT INTO monitoring_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "d_high",
            "r_high",
            yesterday,
            "Relevance",
            0.8,  # high score but still flagged as a failure upstream
            0.7,
            False,
            "alpha",
            "production",
            "online",
            "high-score fail",
            '{"overall":{"status":"fail","value":0.80}}',
        ),
    )

    cfg = ScorecardsConfig(scorecards={"demo": _spec_with_signals_passthrough()})
    captured: dict[str, Any] = {}

    async def fake_generate(extraction_result, **kwargs):  # type: ignore[no-untyped-def]
        captured["extraction_result"] = extraction_result
        return MagicMock(patterns=[], learnings=[])

    with (
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.scorecard.get_store", return_value=seeded_store),
        patch("app.routers.scorecard.get_scorecards", return_value=cfg),
        patch(
            "app.services.issue_extractor_service.generate_insights",
            new=AsyncMock(side_effect=fake_generate),
        ),
    ):
        resp = TestClient(app).post(
            "/api/scorecard/demo/metric_summary",
            json={
                "lookback_days": 30,
                "source_filter": "alpha",
                "metric_name": "Relevance",
                "max_issues": 50,
            },
        )

    assert resp.status_code == 200, resp.text
    extraction = captured["extraction_result"]
    high_score_ids = [iss.id for iss in extraction.issues if iss.score == 0.8]
    assert high_score_ids, (
        "expected the score=0.8 failure row to be passed to the LLM, "
        f"but extraction had only: {[(i.id, i.score) for i in extraction.issues]}"
    )
