"""Agent replay's own Langfuse reads: trace cards, metadata search and review scores."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.plugins.agent_replay.services import langfuse_reads
from app.plugins.agent_replay.services.langfuse_reads import (
    LangfuseReadIncomplete,
    read_review_scores,
    read_trace_summaries,
    search_trace_ids_by_metadata,
)

T0 = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


def _row(**kw):
    """A v2 observation row as the SDK returns it (attribute access)."""
    base = {
        "id": "o",
        "trace_id": "t",
        "parent_observation_id": None,
        "is_root_observation": False,
        "start_time": T0,
        "end_time": T0,
        "name": None,
        "type": "SPAN",
        "latency": None,
        "total_cost": None,
        "trace_name": None,
        "tags": None,
        "session_id": None,
        "user_id": None,
        "metadata": None,
        "input": None,
        "output": None,
    }
    base.update(kw)
    row = MagicMock()
    for key, value in base.items():
        setattr(row, key, value)
    row.model_copy = lambda update: _row(**{**base, **update})
    return row


def _page(data, cursor=None):
    return SimpleNamespace(data=data, meta=SimpleNamespace(cursor=cursor))


class FakeObservations:
    """Serves rows by the filter it is given, recording every call."""

    def __init__(self, rows):
        """Serve ``rows``."""
        self.rows = rows
        self.calls: list[dict] = []

    def get_many(self, **kw):
        self.calls.append(kw)
        conds = json.loads(kw["filter"])
        out = list(self.rows)
        for c in conds:
            if c["type"] == "stringOptions":
                attr = {"traceId": "trace_id", "id": "id"}[c["column"]]
                out = [r for r in out if getattr(r, attr) in c["value"]]
            elif c["type"] == "stringObject":
                out = [r for r in out if (r.metadata or {}).get(c["key"]) == c["value"]]
        if kw["fields"] == langfuse_reads.LIGHT_FIELDS:
            out = [r.model_copy({"input": None, "output": None}) for r in out]
        return _page(out)


def _client(rows):
    client = MagicMock()
    client.api.observations = FakeObservations(rows)
    return client


class TestReadTraceSummaries:
    def test_card_has_root_io_trace_span_and_summed_cost(self):
        rows = [
            _row(
                id="root",
                trace_id="t1",
                is_root_observation=True,
                name="chat",
                trace_name="chat",
                tags=["athena"],
                session_id="s1",
                end_time=T0 + timedelta(seconds=2),
                latency=2.0,
                total_cost=0.01,
                input={"question": "q"},
                output={"answer": "a"},
            ),
            _row(
                id="gen",
                trace_id="t1",
                parent_observation_id="root",
                start_time=T0 + timedelta(seconds=1),
                end_time=T0 + timedelta(seconds=5),
                total_cost=0.02,
                type="GENERATION",
            ),
        ]
        [card] = read_trace_summaries(
            _client(rows), ["t1"], build_preview=lambda v: v if isinstance(v, dict) else None
        )
        assert card.id == "t1"
        assert card.name == "chat"
        assert card.tags == ["athena"]
        assert card.session_id == "s1"
        # The trace's span, as the trace read gave it, not the root row's 2s.
        assert card.latency_s == 5.0
        assert card.total_cost == pytest.approx(0.03)
        assert card.input_preview == {"question": "q"}
        assert card.output_preview == {"answer": "a"}

    def test_io_comes_from_the_root_not_a_child(self):
        rows = [
            _row(id="root", trace_id="t1", is_root_observation=True, input={"q": "root"}),
            _row(
                id="child",
                trace_id="t1",
                parent_observation_id="root",
                start_time=T0 + timedelta(seconds=1),
                input={"q": "child"},
            ),
        ]
        client = _client(rows)
        [card] = read_trace_summaries(client, ["t1"], build_preview=lambda v: v)
        assert card.input_preview == {"q": "root"}
        io_calls = [c for c in client.api.observations.calls if c["fields"] == "core,io"]
        assert json.loads(io_calls[0]["filter"])[0]["value"] == ["root"]

    def test_order_follows_ids_and_missing_traces_get_no_card(self):
        rows = [
            _row(id="r1", trace_id="t1", is_root_observation=True),
            _row(id="r2", trace_id="t2", is_root_observation=True),
        ]
        cards = read_trace_summaries(_client(rows), ["t2", "gone", "t1", "t2"])
        assert [c.id for c in cards] == ["t2", "t1"]

    def test_no_cost_or_end_reads_none(self):
        rows = [_row(id="r1", trace_id="t1", is_root_observation=True, end_time=None)]
        [card] = read_trace_summaries(_client(rows), ["t1"])
        assert card.total_cost is None
        assert card.latency_s is None

    def test_ids_are_batched(self):
        ids = [f"t{i}" for i in range(langfuse_reads.ID_BATCH + 1)]
        rows = [_row(id=f"r{t}", trace_id=t, is_root_observation=True) for t in ids]
        client = _client(rows)
        cards = read_trace_summaries(client, ids)
        assert len(cards) == len(ids)
        light = [
            c
            for c in client.api.observations.calls
            if c["fields"] == "core,basic,usage,trace_context"
        ]
        assert len(light) == 2

    def test_empty_ids_make_no_request(self):
        client = _client([])
        assert read_trace_summaries(client, []) == []
        assert client.api.observations.calls == []

    def test_runaway_paging_raises(self):
        client = MagicMock()
        client.api.observations.get_many.return_value = _page([], cursor="more")
        with pytest.raises(LangfuseReadIncomplete):
            read_trace_summaries(client, ["t1"])


class TestSearchTraceIdsByMetadata:
    def test_match_past_the_first_page_is_found(self):
        """The server pages a match that is older than a page of newest traces."""
        hit = _row(id="h", trace_id="old", start_time=T0 - timedelta(days=20), metadata={"k": "v"})
        client = MagicMock()
        client.api.observations.get_many.side_effect = [
            _page([], cursor="c1"),
            _page([hit]),
        ]
        ids = search_trace_ids_by_metadata(client, "k", "v", T0 - timedelta(days=30), 10)
        assert ids == ["old"]
        first = client.api.observations.get_many.call_args_list[0].kwargs
        assert json.loads(first["filter"]) == [
            {
                "type": "stringObject",
                "column": "metadata",
                "key": "k",
                "operator": "=",
                "value": "v",
            }
        ]
        assert first["from_start_time"] == T0 - timedelta(days=30)

    def test_miss_returns_empty(self):
        client = _client([_row(id="a", trace_id="t1", metadata={"k": "other"})])
        assert search_trace_ids_by_metadata(client, "k", "v", T0 - timedelta(days=1), 10) == []

    def test_newest_first_and_cut_to_limit(self):
        rows = [
            _row(id="a", trace_id="t_old", start_time=T0, metadata={"k": "v"}),
            _row(id="b", trace_id="t_new", start_time=T0 + timedelta(hours=1), metadata={"k": "v"}),
            _row(id="c", trace_id="t_new", start_time=T0 + timedelta(hours=2), metadata={"k": "v"}),
            _row(
                id="d", trace_id="t_mid", start_time=T0 + timedelta(minutes=30), metadata={"k": "v"}
            ),
        ]
        ids = search_trace_ids_by_metadata(_client(rows), "k", "v", T0 - timedelta(days=1), 2)
        assert ids == ["t_new", "t_mid"]


def _score(**kw):
    base = {
        "id": "sc1",
        "name": "review.verdict.v1",
        "value": 1.0,
        "data_type": "NUMERIC",
        "source": "API",
        "comment": None,
        "created_at": T0,
        "subject": SimpleNamespace(kind="trace", id="t1", trace_id="t1"),
    }
    base.update(kw)
    return SimpleNamespace(**base)


class TestReadReviewScores:
    def _client(self, scores):
        client = MagicMock()
        client.api.scores_v3.get_many_v3.return_value = _page(scores)
        return client

    def test_keeps_id_created_at_comment_and_observation(self):
        client = self._client(
            [
                _score(comment="positive"),
                _score(
                    id="sc2",
                    name="review.failure_step.v1",
                    value="step-2",
                    data_type="CATEGORICAL",
                    subject=SimpleNamespace(kind="observation", id="obs-1", trace_id="t1"),
                ),
                _score(id="sc3", name="faithfulness"),
            ]
        )
        verdict, failure = read_review_scores(client, "t1", prefix="review.")
        assert verdict.id == "sc1"
        assert verdict.value == 1.0
        assert verdict.string_value == "positive"
        assert verdict.created_at == str(T0)
        assert verdict.observation_id is None
        assert verdict.source == "API"
        assert failure.id == "sc2"
        assert failure.observation_id == "obs-1"
        assert failure.value == 0.0
        kw = client.api.scores_v3.get_many_v3.call_args.kwargs
        assert kw["trace_id"] == "t1"
        assert kw["limit"] <= 100

    def test_boolean_values_read_one_or_zero(self):
        client = self._client(
            [
                _score(name="review.a", value=True, data_type="BOOLEAN"),
                _score(name="review.b", value=False, data_type="BOOLEAN"),
            ]
        )
        assert [s.value for s in read_review_scores(client, "t1", "review.")] == [1.0, 0.0]

    def test_no_scores_is_empty(self):
        assert read_review_scores(self._client([]), "t1", "review.") == []

    def test_errors_propagate(self):
        client = MagicMock()
        client.api.scores_v3.get_many_v3.side_effect = RuntimeError("HTTP 500")
        with pytest.raises(RuntimeError):
            read_review_scores(client, "t1", "review.")


class TestReviewRoute:
    @pytest.fixture
    def http(self):
        from app.main import app

        return TestClient(app)

    def test_failed_read_is_500(self, http):
        client = MagicMock()
        client.api.scores_v3.get_many_v3.side_effect = RuntimeError("HTTP 500")
        with (
            patch(
                "app.plugins.agent_replay.services.review_service._get_client",
                return_value=client,
            ),
            patch("app.plugins.agent_replay.routers.replay._check_enabled"),
        ):
            response = http.get("/api/agent-replay/traces/t1/reviews")
        assert response.status_code == 500

    def test_no_reviews_is_an_empty_list(self, http):
        client = MagicMock()
        client.api.scores_v3.get_many_v3.return_value = _page([])
        with (
            patch(
                "app.plugins.agent_replay.services.review_service._get_client",
                return_value=client,
            ),
            patch("app.plugins.agent_replay.routers.replay._check_enabled"),
        ):
            response = http.get("/api/agent-replay/traces/t1/reviews")
        assert response.status_code == 200
        assert response.json()["scores"] == []


RETIRED = [
    re.compile(r"\.trace\.(get|list)\("),
    re.compile(r"\.sessions\.(get|list)\("),
    re.compile(r"\bscores\.get_many\("),
    re.compile(r"dataset_run_items"),
    re.compile(r"get_dataset_run\b"),
    re.compile(r"\b(run_experiment|run_batched_evaluation)\("),
    re.compile(r"/api/public/(traces|sessions|scores|metrics)\b"),
    re.compile(r"/api/public/observations\b"),
]


def test_backend_makes_no_retired_langfuse_reads():
    """Langfuse Cloud retired the v1 reads; the backend uses v2 observations and v3 scores."""
    app_dir = Path(__file__).resolve().parents[1] / "app"
    hits = []
    for path in app_dir.rglob("*.py"):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if any(p.search(line) for p in RETIRED):
                hits.append(f"{path.relative_to(app_dir)}:{n}: {line.strip()}")
    assert hits == []
