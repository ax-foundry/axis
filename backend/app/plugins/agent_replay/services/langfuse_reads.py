"""Langfuse reads agent replay makes itself, on the v2 observations and v3 scores reads.

The trace loader rebuilds one whole trace per request, which suits the trace detail
view but not a list of cards. A card needs only its trace's root row (name, tags,
session, timestamp, input, output, latency) and the trace's summed cost, so a page of
cards is read in a few batched requests instead of one full trace read each.

Root rows are picked in code with the loader's own rule (``pick_root``), never by
filtering on ``isRootObservation``: that flag is false for a root whose parent lives
in a calling service, so a server-side root filter would drop those traces.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from app.plugins.agent_replay.models.replay_schemas import TraceSummary
from app.plugins.agent_replay.models.review_schemas import ReviewScoreItem

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

# Rows without input or output: enough to pick the root and sum the cost.
LIGHT_FIELDS = "core,basic,usage,trace_context"
# The root rows' input and output, read once the roots are picked.
IO_FIELDS = "core,io"
SCORE_FIELDS = "subject,details"

OBSERVATIONS_PAGE_LIMIT = 1000
SCORES_PAGE_LIMIT = 100
# A page of cards spans a few traces; a read that needs more pages is a runaway.
MAX_PAGES = 50
# Ids per filter, so a request URL stays well under proxy limits.
ID_BATCH = 50
# Reads keyed by id need a start-time window; this one covers any trace.
ALL_TIME = timedelta(days=3650)
CLOCK_SLACK = timedelta(minutes=5)


class LangfuseReadIncomplete(RuntimeError):
    """A read needed more pages than allowed, so its result would be partial."""


def _page(call: Callable[[str | None], Any], what: str) -> list[Any]:
    """Every page of a cursor read; raises rather than return a partial read."""
    rows: list[Any] = []
    cursor: str | None = None
    for _ in range(MAX_PAGES):
        response = call(cursor)
        rows.extend(response.data or [])
        cursor = getattr(response.meta, "cursor", None)
        # A page can come back empty with a cursor still set; only a missing cursor
        # ends the read.
        if not cursor:
            return rows
    raise LangfuseReadIncomplete(f"{what} needed more than {MAX_PAGES} pages")


def _window(since: datetime | None) -> dict[str, datetime]:
    now = datetime.now(UTC)
    return {
        "from_start_time": since or now - ALL_TIME,
        "to_start_time": now + CLOCK_SLACK,
    }


def _any_of(column: str, values: Sequence[str]) -> str:
    return json.dumps(
        [{"type": "stringOptions", "column": column, "operator": "any of", "value": list(values)}]
    )


def _observations(
    client: Any, fields: str, filter_json: str, since: datetime | None, what: str
) -> list[Any]:
    window = _window(since)
    return _page(
        lambda cursor: client.api.observations.get_many(
            fields=fields,
            filter=filter_json,
            limit=OBSERVATIONS_PAGE_LIMIT,
            cursor=cursor,
            **window,
        ),
        what,
    )


def _batches(values: Sequence[str]) -> list[list[str]]:
    return [list(values[i : i + ID_BATCH]) for i in range(0, len(values), ID_BATCH)]


def _float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _span_seconds(rows: Sequence[Any]) -> float | None:
    """
    Seconds from the trace's first row start to its last row end.

    This is the trace latency the trace read reported. A root row's own latency can be
    far shorter: a root under a remote parent may end before the work it started.
    """
    starts = [r.start_time for r in rows if isinstance(r.start_time, datetime)]
    ends = [r.end_time for r in rows if isinstance(r.end_time, datetime)]
    if not starts or not ends:
        return None
    return max((max(ends) - min(starts)).total_seconds(), 0.0)


def read_trace_summaries(
    client: Any,
    trace_ids: Sequence[str],
    since: datetime | None = None,
    build_preview: Callable[[Any], dict[str, str] | None] | None = None,
) -> list[TraceSummary]:
    """
    One card per trace id that has rows, in ``trace_ids`` order.

    ``since`` bounds the read to rows starting after it; pass the earliest start the
    ids can have when it is known (a listing's window), else every row is in range.
    A trace with no rows in range gets no card.
    """
    from axion._core.tracing.loaders.langfuse_rows import (
        group_by_trace,
        pick_root,
        trace_payload,
    )

    ids = list(dict.fromkeys(t for t in trace_ids if t))
    if not ids:
        return []

    rows: list[Any] = []
    for batch in _batches(ids):
        rows += _observations(client, LIGHT_FIELDS, _any_of("traceId", batch), since, "trace rows")
    groups = group_by_trace(rows)
    roots = {tid: pick_root(group) for tid, group in groups.items()}

    io_by_id: dict[str, Any] = {}
    for batch in _batches([r.id for r in roots.values()]):
        for row in _observations(client, IO_FIELDS, _any_of("id", batch), since, "root io"):
            io_by_id[row.id] = row

    summaries: list[TraceSummary] = []
    for tid in ids:
        group = groups.get(tid)
        if not group:
            continue
        root = roots[tid]
        io_row = io_by_id.get(root.id)
        if io_row is not None:
            root_with_io = root.model_copy(update={"input": io_row.input, "output": io_row.output})
            group = [root_with_io if r.id == root.id else r for r in group]
        payload = trace_payload(tid, group)
        costs = [c for c in (_float(r.total_cost) for r in group) if c is not None]
        preview = build_preview or (lambda _value: None)
        timestamp = payload.get("timestamp")
        summaries.append(
            TraceSummary(
                id=tid,
                name=payload.get("name"),
                tags=list(payload.get("tags") or []),
                timestamp=str(timestamp) if timestamp else None,
                step_count=0,
                step_names=[],
                session_id=payload.get("sessionId"),
                total_cost=float(sum(costs)) if costs else None,
                latency_s=_span_seconds(group),
                input_preview=preview(payload.get("input")),
                output_preview=preview(payload.get("output")),
            )
        )
    return summaries


def search_trace_ids_by_metadata(
    client: Any, key: str, value: str, since: datetime, limit: int
) -> list[str]:
    """
    Ids of the newest ``limit`` traces with a row whose metadata ``key`` equals
    ``value``, newest first.

    The match is server-side and runs over every row, not only roots: trace-level
    metadata is written on the root, and some writers repeat it on child rows.
    """
    filter_json = json.dumps(
        [
            {
                "type": "stringObject",
                "column": "metadata",
                "key": key,
                "operator": "=",
                "value": value,
            }
        ]
    )
    rows = _observations(client, "core", filter_json, since, "metadata search")
    starts: dict[str, datetime] = {}
    for row in rows:
        start = row.start_time
        if row.trace_id and isinstance(start, datetime):
            starts[row.trace_id] = min(start, starts.get(row.trace_id, start))
    newest = sorted(starts, key=lambda tid: starts[tid], reverse=True)
    return newest[:limit]


def _score_ids(raw: Any) -> str | None:
    """The observation id of an observation-level score, else None."""
    subject = getattr(raw, "subject", None)
    if getattr(subject, "kind", None) == "observation":
        return getattr(subject, "id", None)
    return None


def _score_value(raw: Any) -> float | None:
    """The value as the trace read gave it: categorical and text scores read 0."""
    data_type = str(getattr(raw, "data_type", "") or "")
    value = getattr(raw, "value", None)
    if data_type == "BOOLEAN":
        return 1.0 if value else 0.0
    if data_type == "NUMERIC":
        return _float(value)
    return 0.0


def read_review_scores(client: Any, trace_id: str, prefix: str) -> list[ReviewScoreItem]:
    """
    The trace's scores named ``prefix…``, trace- and observation-level.

    Errors propagate, so a caller can tell a failed read from a trace with no scores.
    """
    now = datetime.now(UTC)
    raws = _page(
        lambda cursor: client.api.scores_v3.get_many_v3(
            trace_id=trace_id,
            fields=SCORE_FIELDS,
            limit=SCORES_PAGE_LIMIT,
            cursor=cursor,
            from_timestamp=now - ALL_TIME,
            to_timestamp=now + CLOCK_SLACK,
        ),
        f"review scores of trace {trace_id}",
    )
    items: list[ReviewScoreItem] = []
    for raw in raws:
        name = getattr(raw, "name", "") or ""
        if not name.startswith(prefix):
            continue
        created = getattr(raw, "created_at", None)
        source = getattr(raw, "source", None)
        items.append(
            ReviewScoreItem(
                id=str(getattr(raw, "id", "")),
                name=name,
                value=_score_value(raw),
                string_value=getattr(raw, "comment", None),
                observation_id=_score_ids(raw),
                created_at=str(created) if created else "",
                source=str(source) if source is not None else None,
            )
        )
    return items
