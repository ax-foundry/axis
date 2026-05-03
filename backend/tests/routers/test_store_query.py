"""Tests for POST /api/store/query/{dataset} — structured query endpoint."""

import time
from typing import Any
from unittest.mock import MagicMock, patch

import anyio
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.routers.store import StoreQueryRequest, build_sql

# ----------------------------------------------------------------------
# Unit tests: build_sql
# ----------------------------------------------------------------------

ALLOWED = {"source_name", "metric_name", "metric_score", "timestamp", "environment"}


def _req(**kwargs: Any) -> StoreQueryRequest:
    return StoreQueryRequest.model_validate(kwargs)


def test_build_sql_simple_select() -> None:
    req = _req(select=["source_name", "metric_score"], limit=10)
    sql, params = build_sql(req, "monitoring_data", ALLOWED)
    assert sql == 'SELECT "source_name", "metric_score" FROM "monitoring_data" LIMIT 10'
    assert params == []


def test_build_sql_filter_eq() -> None:
    req = _req(
        select=["metric_score"],
        filters=[{"col": "source_name", "op": "eq", "value": "athena"}],
    )
    sql, params = build_sql(req, "monitoring_data", ALLOWED)
    assert '"source_name" = ?' in sql
    assert params == ["athena"]


def test_build_sql_filter_in() -> None:
    req = _req(
        select=["metric_score"],
        filters=[{"col": "metric_name", "op": "in", "value": ["a", "b", "c"]}],
    )
    sql, params = build_sql(req, "monitoring_data", ALLOWED)
    assert '"metric_name" IN (?, ?, ?)' in sql
    assert params == ["a", "b", "c"]


def test_build_sql_filter_in_empty_rejected() -> None:
    req = _req(
        select=["metric_score"],
        filters=[{"col": "metric_name", "op": "in", "value": []}],
    )
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.status_code == 400
    assert ei.value.detail["code"] == "invalid_filter_op"


def test_build_sql_is_null() -> None:
    req = _req(
        select=["metric_score"],
        filters=[{"col": "environment", "op": "is_null"}],
    )
    sql, params = build_sql(req, "monitoring_data", ALLOWED)
    assert '"environment" IS NULL' in sql
    assert params == []


def test_build_sql_unknown_column_rejected() -> None:
    req = _req(select=["does_not_exist"])
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.status_code == 400
    assert ei.value.detail["code"] == "invalid_column"


def test_build_sql_injection_in_column_rejected() -> None:
    req = _req(select=["source_name; DROP TABLE foo"])
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.detail["code"] == "invalid_column"


def test_build_sql_blob_column_rejected() -> None:
    allowed = ALLOWED | {"signals"}
    req = _req(select=["signals"])
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "human_signals_cases", allowed)
    assert ei.value.detail["code"] == "forbidden_select_blob"


def test_build_sql_aggregate_group_by() -> None:
    req = _req(
        select=["source_name"],
        aggregates=[{"fn": "avg", "col": "metric_score", "as": "avg_score"}],
        group_by=["source_name"],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert 'AVG("metric_score") AS "avg_score"' in sql
    assert 'GROUP BY "source_name"' in sql


def test_build_sql_group_by_auto_projects() -> None:
    """group_by columns not in select are auto-projected (Mithril overview pattern)."""
    req = _req(
        aggregates=[{"fn": "avg", "col": "metric_score", "as": "avg_score"}],
        group_by=["source_name"],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert '"source_name"' in sql
    assert 'AVG("metric_score") AS "avg_score"' in sql
    assert 'GROUP BY "source_name"' in sql


def test_build_sql_group_by_with_explicit_select_no_dup() -> None:
    """Explicit select + group_by of same col doesn't duplicate the projection."""
    req = _req(
        select=["source_name"],
        aggregates=[{"fn": "count", "col": "*", "as": "n"}],
        group_by=["source_name"],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert sql.count('"source_name"') == 2  # once in SELECT, once in GROUP BY


def test_build_sql_filter_unknown_column_rejected() -> None:
    req = _req(
        select=["metric_score"],
        filters=[{"col": "nope", "op": "eq", "value": 1}],
    )
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.detail["code"] == "invalid_column"


def test_build_sql_count_star() -> None:
    req = _req(
        aggregates=[{"fn": "count", "col": "*", "as": "n"}],
        select=["source_name"],
        group_by=["source_name"],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert 'COUNT(*) AS "n"' in sql


def test_build_sql_count_distinct() -> None:
    req = _req(
        aggregates=[{"fn": "count_distinct", "col": "metric_name", "as": "uniq"}],
        select=["source_name"],
        group_by=["source_name"],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert 'COUNT(DISTINCT "metric_name") AS "uniq"' in sql


def test_build_sql_date_trunc() -> None:
    req = _req(
        date_trunc={"col": "timestamp", "unit": "week", "as": "bucket"},
        aggregates=[{"fn": "avg", "col": "metric_score", "as": "avg_score"}],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert 'DATE_TRUNC(\'week\', "timestamp")::text AS "bucket"' in sql
    assert 'GROUP BY "bucket"' in sql


def test_build_sql_no_select_no_aggregates_rejected() -> None:
    req = _req()
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.status_code == 400
    assert ei.value.detail["code"] == "invalid_query"


def test_build_sql_group_by_without_aggregates_rejected() -> None:
    req = _req(select=["source_name"], group_by=["source_name"])
    with pytest.raises(HTTPException) as ei:
        build_sql(req, "monitoring_data", ALLOWED)
    assert ei.value.detail["code"] == "invalid_column"


def test_build_sql_order_by_aggregate_alias() -> None:
    req = _req(
        select=["source_name"],
        aggregates=[{"fn": "avg", "col": "metric_score", "as": "avg_score"}],
        group_by=["source_name"],
        order_by=[{"col": "avg_score", "dir": "desc"}],
    )
    sql, _ = build_sql(req, "monitoring_data", ALLOWED)
    assert 'ORDER BY "avg_score" DESC' in sql


def test_build_sql_limit_clamped() -> None:
    # Pydantic's le=10_000 enforces clamp at validation.
    with pytest.raises(Exception):  # noqa: B017
        _req(select=["source_name"], limit=99_999)


def test_build_sql_filter_count_capped() -> None:
    filters = [{"col": "source_name", "op": "eq", "value": "x"}] * 7
    with pytest.raises(Exception):  # noqa: B017
        _req(select=["source_name"], filters=filters)


# ----------------------------------------------------------------------
# Integration tests: route handler with mocked store
# ----------------------------------------------------------------------


@pytest.fixture
def fake_store() -> MagicMock:
    store = MagicMock()
    store.has_table.return_value = True
    store.get_table_columns.return_value = ALLOWED
    store.query_list.return_value = [{"source_name": "athena", "avg_score": 0.91}]
    store.query_list_interruptible.return_value = [{"source_name": "athena", "avg_score": 0.91}]
    store.query_limiter = anyio.CapacityLimiter(8)
    return store


@pytest.fixture
def client_no_auth() -> TestClient:
    """TestClient with API_GATEWAY_KEY blanked so the middleware passes through."""
    from app.config.env import settings
    from app.main import app

    with patch.object(settings, "API_GATEWAY_KEY", ""):
        yield TestClient(app)


def test_query_dataset_happy_path(fake_store: MagicMock, client_no_auth: TestClient) -> None:
    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.post(
            "/api/store/query/monitoring",
            json={
                "select": ["source_name"],
                "aggregates": [{"fn": "avg", "col": "metric_score", "as": "avg_score"}],
                "group_by": ["source_name"],
                "limit": 10,
            },
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["row_count"] == 1
    assert body["rows"][0]["source_name"] == "athena"
    assert body["sql"] is None


def test_query_dataset_unknown_dataset(fake_store: MagicMock, client_no_auth: TestClient) -> None:
    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.post(
            "/api/store/query/not_a_dataset",
            json={"select": ["source_name"]},
        )
    assert resp.status_code == 404


def test_query_dataset_dataset_warming(fake_store: MagicMock, client_no_auth: TestClient) -> None:
    fake_store.has_table.return_value = False
    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.post(
            "/api/store/query/monitoring",
            json={"select": ["source_name"]},
        )
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "dataset_warming"


def test_query_dataset_invalid_column(fake_store: MagicMock, client_no_auth: TestClient) -> None:
    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.post(
            "/api/store/query/monitoring",
            json={"select": ["nope"]},
        )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_column"


def test_query_dataset_debug_returns_sql(fake_store: MagicMock, client_no_auth: TestClient) -> None:
    with patch("app.routers.store.get_store", return_value=fake_store):
        resp = client_no_auth.post(
            "/api/store/query/monitoring?debug=1",
            json={"select": ["source_name"]},
        )
    assert resp.status_code == 200
    assert resp.json()["sql"] is not None


def test_query_list_interruptible_returns_rows() -> None:
    """Happy path: query well under timeout returns rows."""
    import duckdb

    from app.services.duckdb_store import DuckDBStore

    store = DuckDBStore.__new__(DuckDBStore)
    store._conn = duckdb.connect(":memory:")  # type: ignore[attr-defined]
    store._conn.execute("CREATE TABLE t (x INT)")
    store._conn.execute("INSERT INTO t VALUES (1), (2), (3)")

    rows = store.query_list_interruptible("SELECT x FROM t ORDER BY x", None, 5.0)
    assert rows == [{"x": 1}, {"x": 2}, {"x": 3}]


def test_query_list_interruptible_hard_timeout() -> None:
    """A pathologically slow query is cancelled and raises TimeoutError."""
    import duckdb

    from app.services.duckdb_store import DuckDBStore

    store = DuckDBStore.__new__(DuckDBStore)
    store._conn = duckdb.connect(":memory:")  # type: ignore[attr-defined]

    # range(N) is lazy; ORDER BY random() forces a full materialize/sort.
    slow_sql = "SELECT i FROM range(100_000_000) t(i) ORDER BY random()"

    started = time.perf_counter()
    with pytest.raises(TimeoutError):
        store.query_list_interruptible(slow_sql, None, 0.5)
    elapsed = time.perf_counter() - started
    # Should cancel close to the deadline, not wait for the query to finish.
    assert elapsed < 5.0


def test_query_dataset_requires_api_key(fake_store: MagicMock) -> None:
    """Endpoint inherits ApiKeyMiddleware: 401 without header, 200 with."""
    from app.config.env import settings
    from app.main import app

    with (
        patch.object(settings, "API_GATEWAY_KEY", "secret-test-key"),
        patch("app.routers.store.get_store", return_value=fake_store),
    ):
        client = TestClient(app)
        body = {"select": ["source_name"]}

        # Missing header → 401
        resp = client.post("/api/store/query/monitoring", json=body)
        assert resp.status_code == 401

        # Wrong header → 401
        resp = client.post(
            "/api/store/query/monitoring",
            json=body,
            headers={"x-api-key": "wrong"},
        )
        assert resp.status_code == 401

        # Correct header → 200
        resp = client.post(
            "/api/store/query/monitoring",
            json=body,
            headers={"x-api-key": "secret-test-key"},
        )
        assert resp.status_code == 200
