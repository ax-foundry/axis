"""Tests for generic source scorecard configuration and bounded queries."""

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

import anyio
import duckdb
from fastapi.testclient import TestClient

from app.config.source_scorecards import SourceScorecardsConfig, SourceScorecardSpec
from app.services.duckdb_store import DuckDBStore


def _store() -> DuckDBStore:
    store = DuckDBStore.__new__(DuckDBStore)
    store._conn = duckdb.connect(":memory:")  # type: ignore[attr-defined]
    store.db_path = __file__
    store._query_limiter = anyio.CapacityLimiter(8)  # type: ignore[attr-defined]
    import threading

    store._cache_lock = threading.Lock()  # type: ignore[attr-defined]
    store._cached_metadata = {}  # type: ignore[attr-defined]
    store._sync_status = {}  # type: ignore[attr-defined]
    store._register_lock = threading.Lock()  # type: ignore[attr-defined]
    store._conn.execute("""CREATE TABLE source_kpis (
        metric_key VARCHAR, value DOUBLE, work_item_id VARCHAR, observed_at TIMESTAMP,
        definition_version VARCHAR, unit VARCHAR, numerator DOUBLE, denominator DOUBLE,
        sample_size INTEGER, availability VARCHAR, availability_reason VARCHAR, cohort VARCHAR,
        observation_window VARCHAR, comparison_window VARCHAR, source_watermark VARCHAR,
        instrumentation_horizon VARCHAR, environment VARCHAR)""")
    now = datetime.now(UTC) - timedelta(days=1)
    row = (
        "throughput",
        0.0,
        "work-1",
        now,
        "v1",
        "ratio",
        0.0,
        2.0,
        2,
        "available",
        None,
        "instrumented",
        "30d",
        "prior 30d",
        "watermark",
        "fully_instrumented",
        "prod",
    )
    second = (
        "throughput",
        1.0,
        "work-2",
        now,
        "v1",
        "ratio",
        1.0,
        2.0,
        2,
        "available",
        None,
        "instrumented",
        "30d",
        "prior 30d",
        "watermark",
        "fully_instrumented",
        "prod",
    )
    store._conn.executemany(
        "INSERT INTO source_kpis VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [row, second],
    )
    return store


def _spec() -> SourceScorecardSpec:
    return SourceScorecardSpec.model_validate(
        {
            "metrics": [
                {
                    "key": "throughput",
                    "label": "Throughput",
                    "table": "source_kpis",
                    "sections": ["overview", "flow", "quality", "reliability"],
                }
            ],
            "contributor_id_column": "work_item_id",
            "timestamp_column": "observed_at",
            "version_column": "definition_version",
            "unit_column": "unit",
            "numerator_column": "numerator",
            "denominator_column": "denominator",
            "sample_size_column": "sample_size",
            "availability_column": "availability",
            "availability_reason_column": "availability_reason",
            "cohort_column": "cohort",
            "observation_window_column": "observation_window",
            "comparison_window_column": "comparison_window",
            "source_watermark_column": "source_watermark",
            "instrumentation_horizon_column": "instrumentation_horizon",
            "filter_dimensions": ["environment"],
            "detail_columns": ["observed_at", "cohort"],
        }
    )


def _client() -> Any:
    from app.config.env import settings
    from app.main import app

    return (
        TestClient(app),
        patch.object(settings, "API_GATEWAY_KEY", ""),
        patch("app.routers.source_scorecard.get_store", return_value=_store()),
        patch(
            "app.routers.source_scorecard.get_source_scorecards",
            return_value=SourceScorecardsConfig(source_scorecards={"fixture": _spec()}),
        ),
    )


def test_aggregate_and_contributors_reconcile_under_filters() -> None:
    client, auth, store, config = _client()
    with auth, store, config:
        aggregate = client.post(
            "/api/source-scorecard/fixture/flow",
            json={"filters": {"environment": "prod"}, "comparison_days": 30},
        )
        detail = client.post(
            "/api/source-scorecard/fixture/flow/contributors",
            json={"metric_key": "throughput", "filters": {"environment": "prod"}},
        )
    assert aggregate.status_code == 200, aggregate.text
    assert detail.status_code == 200, detail.text
    assert (
        aggregate.json()["rows"][0]["value"]
        == sum(row["value"] for row in detail.json()["rows"]) / 2
    )
    assert aggregate.json()["rows"][0]["status"] == "available"
    assert aggregate.json()["rows"][0]["definition_version"] == "v1"
    assert aggregate.json()["rows"][0]["comparison_value"] is None


def test_all_four_views_render_from_the_same_generic_fixture() -> None:
    client, auth, store, config = _client()
    with auth, store, config:
        responses = [
            client.post(f"/api/source-scorecard/fixture/{view}", json={})
            for view in ("overview", "flow", "quality", "reliability")
        ]
    assert all(response.status_code == 200 for response in responses)


def test_unconfigured_filter_and_metric_are_rejected() -> None:
    client, auth, store, config = _client()
    with auth, store, config:
        bad_filter = client.post(
            "/api/source-scorecard/fixture/flow", json={"filters": {"sql": "x"}}
        )
        bad_metric = client.post(
            "/api/source-scorecard/fixture/flow/contributors", json={"metric_key": "nope"}
        )
    assert bad_filter.status_code == 400
    assert bad_metric.status_code == 400
