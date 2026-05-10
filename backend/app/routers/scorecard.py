"""Generic, YAML-driven dashboard endpoints.

Eight fixed views (``summary``, ``timeseries``, ``anomalies``, ``anomaly_detail``,
``sentiment``, ``signals``, ``signal_detail``, ``metric_summary``) compose hand-built
parameterized SQL from a ``ScorecardSpec`` loaded from ``custom/config/scorecards.yaml``.
``metric_summary`` is the only view that calls an LLM — it reuses ``anomaly_detail``'s
SQL pattern to fetch failing rows then runs them through Axion's ``InsightExtractor``
to surface themes / insights / action items.
The view set is fixed in code so URLs stay predictable per shape; *what* each
view queries is config-driven.

All identifiers (table, columns, sentinel value strings) come from trusted
YAML and are validated against the live DuckDB schema at request time before
being quoted into SQL. All client-supplied values bind via ``?`` placeholders.
"""

import ast
import contextlib
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import anyio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config.scorecards import (
    AnomalyConfig,
    ConfigFilter,
    ScorecardSpec,
    SentimentConfig,
    SignalsConfig,
    get_scorecards,
)
from app.copilot.tracing import get_request_tracer
from app.routers.store import BLOCKED_BLOB_COLUMNS
from app.services.duckdb_store import get_store

logger = logging.getLogger(__name__)

router = APIRouter()

QUERY_TIMEOUT_SECONDS = 10

# Mirrors store.py's _FILTER_OP_SQL for binary ops. Kept private here to avoid
# coupling the router to a private symbol of another module.
_BINARY_OP_SQL = {
    "eq": "=",
    "neq": "!=",
    "gte": ">=",
    "lte": "<=",
    "gt": ">",
    "lt": "<",
}

# Which AGG functions are allowed for MetricSpec.agg. The Literal on MetricSpec
# already constrains this; keeping a separate map enforces it again at SQL build.
_AGG_SQL = {"avg": "AVG", "sum": "SUM", "max": "MAX", "min": "MIN", "count": "COUNT"}


# Tokens stripped before fingerprinting an action item for semantic dedup.
# Mirrors the mithril client-side stopword set so server + client agree on
# "same action, different wording".
_ACTION_FINGERPRINT_STOPWORDS = frozenset(
    {
        "a", "add", "an", "and", "are", "as", "at", "be", "before", "by", "for",
        "from", "in", "is", "it", "of", "on", "or", "should", "that", "the",
        "this", "to", "use", "when", "with", "do", "don", "doesn", "t", "s",
        "athena", "agent", "system", "model",
    }
)


def _action_fingerprint(text: str) -> str:
    """Project an action sentence to a stable bag-of-stems for dedup.

    Lowercases, drops punctuation + stopwords, takes the first 5 tokens
    (sorted) so 'Add a self-check step' and 'Add a step for self-check'
    collapse to the same key.
    """
    cleaned = "".join(c.lower() if c.isalnum() else " " for c in text)
    tokens = [
        t for t in cleaned.split() if t and t not in _ACTION_FINGERPRINT_STOPWORDS
    ]
    return " ".join(sorted(tokens[:5]))


def _dedupe_and_cap_actions(
    learnings: list[dict[str, Any]], max_total: int
) -> list[dict[str, Any]]:
    """Prune each learning's ``recommended_actions`` so the total across all learnings is ≤ ``max_total`` and no two surviving actions share a fingerprint.

    Details:

    Why server-side: axion's distillation runs per-cluster, so a "global N"
    cap inside the prompt is advisory at best. Returning duplicate or
    redundant actions across clusters is the most common output regression;
    enforcing the cap here makes it load-bearing.

    Selection: highest learning-confidence wins per fingerprint, then top-N
    overall by confidence. Each learning keeps only the survivors that
    originated from it (origin attribution preserved for the UI).
    """
    if max_total < 1:
        return learnings

    candidates: list[tuple[int, str, float]] = []  # (learning_idx, action, conf)
    for idx, le in enumerate(learnings):
        for action in le.get("recommended_actions") or []:
            text = (action or "").strip()
            if not text:
                continue
            fp = _action_fingerprint(text)
            if not fp:
                continue
            candidates.append((idx, text, float(le.get("confidence") or 0.0)))

    best_per_fp: dict[str, tuple[int, str, float]] = {}
    for entry in candidates:
        fp = _action_fingerprint(entry[1])
        existing = best_per_fp.get(fp)
        if existing is None or entry[2] > existing[2]:
            best_per_fp[fp] = entry

    survivors = sorted(best_per_fp.values(), key=lambda e: e[2], reverse=True)[
        :max_total
    ]
    survivors_by_idx: dict[int, list[str]] = {}
    for idx, text, _ in survivors:
        survivors_by_idx.setdefault(idx, []).append(text)

    for idx, le in enumerate(learnings):
        le["recommended_actions"] = survivors_by_idx.get(idx, [])
    return learnings


# ----------------------------------------------------------------------
# Request models — same shape across all views
# ----------------------------------------------------------------------


class ScorecardRequest(BaseModel):
    """Common request body. Specific views read additional fields if present."""

    lookback_days: int = Field(default=14, ge=1, le=365)


class TimeseriesRequest(ScorecardRequest):
    """Request body for the ``timeseries`` view."""

    source_filter: str  # group_column value, e.g. a specific source_name
    granularity: Literal["day", "week"] = "day"


class AnomalyDetailRequest(ScorecardRequest):
    """Request body for the ``anomaly_detail`` view."""

    source_filter: str
    metric_name: str
    limit: int = Field(default=50, ge=1, le=500)


class MetricSummaryRequest(ScorecardRequest):
    """Request body for the ``metric_summary`` view.

    Fetches failing eval rows for ``(source_filter, metric_name)`` over the
    lookback window, then runs them through Axion's ``InsightExtractor`` to
    produce themes (patterns) and insights/action-items (learnings).
    """

    source_filter: str
    metric_name: str
    max_issues: int = Field(default=100, ge=1, le=500)
    max_action_items: int = Field(default=3, ge=1, le=10)


class AnomaliesRequest(ScorecardRequest):
    """Request body for the ``anomalies`` view."""

    source_filter: str | None = None


class SignalsRequest(ScorecardRequest):
    """Request body for the ``signals`` view."""

    metric_name: str | None = None  # scope to signals tagged for this eval metric


class SignalDetailRequest(ScorecardRequest):
    """Request body for the ``signal_detail`` view."""

    source_filter: str
    signal_key: str | None = None  # omit to return all signals for the source
    metric_name: str | None = None  # scope to signals tagged for this eval metric
    limit: int = Field(default=100, ge=1, le=500)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _cutoff(lookback_days: int) -> datetime:
    return datetime.now(tz=UTC) - timedelta(days=lookback_days)


def _bad_config(message: str, **details: Any) -> HTTPException:
    # 400 (not 500): misconfiguration is deterministic given the request, so we
    # don't want it tripping uptime monitors. Operator still has to fix the YAML.
    return HTTPException(
        status_code=400,
        detail={"code": "scorecard_config_error", "message": message, **details},
    )


def _bad_request(code: str, message: str, **details: Any) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"code": code, "message": message, **details},
    )


def _resolve_scorecard(name: str) -> ScorecardSpec:
    cfg = get_scorecards()
    spec = cfg.scorecards.get(name)
    if spec is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "scorecard_not_found",
                "name": name,
                "available": sorted(cfg.scorecards),
            },
        )
    return spec


def _check_table(table: str) -> set[str]:
    """503 if not synced, otherwise return its column set."""
    store = get_store()
    if not store.has_table(table):
        raise HTTPException(
            status_code=503,
            detail={"code": "dataset_warming", "table": table},
        )
    return store.get_table_columns(table)


def _check_col(
    col: str,
    allowed: set[str],
    where: str,
    table: str,
    passthrough: frozenset[str] = frozenset(),
) -> None:
    if col not in allowed:
        raise _bad_config(
            f"column '{col}' (used in {where}) is not present on table '{table}'",
            column=col,
            table=table,
        )
    if col in BLOCKED_BLOB_COLUMNS and col not in passthrough:
        raise _bad_config(
            f"column '{col}' is a JSON blob and cannot be projected/filtered",
            column=col,
        )


def _build_filters(
    filters: list[ConfigFilter], allowed: set[str], table: str, where: str
) -> tuple[str, list[Any]]:
    """Build a WHERE fragment (no leading WHERE) from ConfigFilters."""
    pieces: list[str] = []
    params: list[Any] = []
    for f in filters:
        _check_col(f.col, allowed, where, table)
        if f.op in _BINARY_OP_SQL:
            pieces.append(f'"{f.col}" {_BINARY_OP_SQL[f.op]} ?')
            params.append(f.value)
        elif f.op == "in":
            if not isinstance(f.value, list) or not f.value:
                raise _bad_config(
                    f"'in' filter on '{f.col}' requires a non-empty list", column=f.col
                )
            pieces.append(f'"{f.col}" IN ({", ".join(["?"] * len(f.value))})')
            params.extend(f.value)
        elif f.op == "is_null":
            pieces.append(f'"{f.col}" IS NULL')
        elif f.op == "is_not_null":
            pieces.append(f'"{f.col}" IS NOT NULL')
    return (" AND ".join(pieces) if pieces else "1=1"), params


async def _run_query(sql: str, params: list[Any]) -> list[dict[str, Any]]:
    store = get_store()
    started = time.perf_counter()
    try:
        rows: list[dict[str, Any]] = await anyio.to_thread.run_sync(
            lambda: store.query_list_interruptible(sql, params, QUERY_TIMEOUT_SECONDS),
            limiter=store.query_limiter,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail={"code": "query_timeout", "timeout_seconds": QUERY_TIMEOUT_SECONDS},
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("scorecard query failed: %s", sql.split("\n", 1)[0][:120])
        raise HTTPException(
            status_code=500,
            detail={"code": "internal_error", "message": str(exc)},
        ) from exc
    logger.info(
        "scorecard_query rows=%d elapsed_ms=%d",
        len(rows),
        int((time.perf_counter() - started) * 1000),
    )
    return rows


# ----------------------------------------------------------------------
# Views
# ----------------------------------------------------------------------


def _build_summary_sql(
    spec: ScorecardSpec, src_cols: set[str], snt_cols: set[str] | None
) -> tuple[str, int]:
    """Compose the summary CTE. Returns (sql_template, n_metric_param_slots).

    The template uses ``?`` for every value — base_filters values, the cutoff,
    each metric.match, and (if sentiment) the sentiment cutoff. The caller
    binds them in order.
    """
    _check_col(spec.group_column, src_cols, "group_column", spec.source_table)
    _check_col(spec.timestamp_column, src_cols, "timestamp_column", spec.source_table)
    _check_col(spec.metric_label_column, src_cols, "metric_label_column", spec.source_table)

    base_where, _ = _build_filters(spec.base_filters, src_cols, spec.source_table, "base_filters")

    label_col_q = f'"{spec.metric_label_column}"'
    metric_pieces: list[str] = []
    for m in spec.metrics:
        _check_col(m.col, src_cols, f"metrics[{m.name}].col", spec.source_table)
        agg_fn = _AGG_SQL[m.agg]
        metric_pieces.append(
            f"{agg_fn}(CASE WHEN {label_col_q} = ? "
            f'THEN CAST("{m.col}" AS DOUBLE) END) AS "{m.name}"'
        )

    failure_pieces, _ = _maybe_failure_filter(spec.anomaly, src_cols, spec.source_table)
    failure_clause = (
        f"COUNT(*) FILTER (WHERE {failure_pieces}) AS anomaly_count"
        if failure_pieces
        else "0 AS anomaly_count"
    )

    monitoring_cte = f"""
        SELECT
            "{spec.group_column}" AS group_key,
            {", ".join(metric_pieces) + "," if metric_pieces else ""}
            {failure_clause},
            MAX("{spec.timestamp_column}") AS last_run_at
        FROM "{spec.source_table}"
        WHERE {base_where} AND "{spec.timestamp_column}" >= ?
        GROUP BY "{spec.group_column}"
    """

    if spec.sentiment is None or snt_cols is None:
        sql = f"""
            WITH monitoring AS ({monitoring_cte})
            SELECT *, CAST(NULL AS DOUBLE) AS sentiment_avg FROM monitoring
            ORDER BY group_key
        """
        return sql, 0

    snt = spec.sentiment
    snt_table = snt.table or spec.sentiment_table
    if not snt_table:
        raise _bad_config("sentiment configured but no sentiment_table set")
    _check_col(snt.column, snt_cols, "sentiment.column", snt_table)
    _check_col(snt.timestamp_column, snt_cols, "sentiment.timestamp_column", snt_table)
    if spec.group_column not in snt_cols:
        raise _bad_config(
            f"group_column '{spec.group_column}' not present on sentiment_table '{snt_table}'"
        )

    sentiment_case = _build_sentiment_case(snt)
    sentiment_cte = f"""
        SELECT
            "{spec.group_column}" AS group_key,
            AVG({sentiment_case}) AS sentiment_avg
        FROM "{snt_table}"
        WHERE TRY_CAST("{snt.timestamp_column}" AS TIMESTAMP) >= ?
        GROUP BY "{spec.group_column}"
    """

    sql = f"""
        WITH monitoring AS ({monitoring_cte}),
             sentiment AS ({sentiment_cte})
        SELECT m.*, s.sentiment_avg
        FROM monitoring m
        LEFT JOIN sentiment s ON m.group_key = s.group_key
        ORDER BY m.group_key
    """
    return sql, len(snt.value_map)


def _build_sentiment_case(snt: SentimentConfig) -> str:
    """Build a CASE expression mapping known sentiment strings → numeric scores.

    Values bind as ``?`` placeholders — both the matched strings AND the numeric
    scores. This keeps the SQL string identical regardless of value_map content.
    """
    pieces = ["CASE"]
    for _ in snt.value_map:
        pieces.append(f'WHEN "{snt.column}" = ? THEN ?')
    pieces.append("END")
    return " ".join(pieces)


def _sentiment_case_params(snt: SentimentConfig) -> list[Any]:
    out: list[Any] = []
    for k, v in snt.value_map.items():
        out.extend([k, float(v)])
    return out


def _maybe_failure_filter(
    anomaly: AnomalyConfig | None, allowed: set[str], table: str
) -> tuple[str, list[Any]]:
    if anomaly is None or not anomaly.failure_filter:
        return "", []
    return _build_filters(anomaly.failure_filter, allowed, table, "anomaly.failure_filter")


def _flatten_signals_to_lines(value: Any) -> list[str] | None:
    """Flatten a signals JSON blob into ``["path=value", ...]`` for ExtractedIssue.

    Accepts a dict, list, JSON string, or None. Returns None if there is nothing
    to forward. The flattened list is what the downstream Axion adapter folds
    into the LLM prompt — keeping the structured failure evidence intact while
    fitting the ``list[str]`` shape required by ``ExtractedIssue.signals``.
    """
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return [value] if value else None

    lines: list[str] = []

    def _walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                _walk(v, f"{path}.{k}" if path else str(k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                _walk(v, f"{path}[{i}]")
        else:
            lines.append(f"{path}={node}" if path else str(node))

    _walk(value, "")
    return lines or None


@router.post("/{name}/summary")
async def summary(name: str, req: ScorecardRequest) -> dict[str, Any]:
    """One row per group_key: configured metric AVGs, anomaly_count, last_run_at, sentiment_avg."""
    spec = _resolve_scorecard(name)
    src_cols = _check_table(spec.source_table)

    snt_table: str | None = None
    if spec.sentiment is not None:
        snt_table = spec.sentiment.table or spec.sentiment_table
    snt_cols: set[str] | None = None
    if spec.sentiment is not None and snt_table is not None:
        snt_cols = _check_table(snt_table)

    sql, _ = _build_summary_sql(spec, src_cols, snt_cols)

    # Bind order must match SQL placeholders top-down. The monitoring CTE has
    # placeholders in this order (SELECT then WHERE):
    #   1. metric match values, in declared order   (SELECT … CASE WHEN metric_name = ?)
    #   2. failure_filter values (if any)           (COUNT(*) FILTER (WHERE …))
    #   3. base_filters values                      (WHERE …)
    #   4. cutoff timestamp                         (WHERE timestamp >= ?)
    # Then if sentiment is configured:
    #   5. sentiment value_map [k, v, k, v, ...]
    #   6. cutoff timestamp (sentiment CTE)
    cutoff = _cutoff(req.lookback_days)
    params: list[Any] = []
    for m in spec.metrics:
        params.append(m.match)
    if spec.anomaly and spec.anomaly.failure_filter:
        _, fail_params = _build_filters(
            spec.anomaly.failure_filter, src_cols, spec.source_table, "anomaly.failure_filter"
        )
        params.extend(fail_params)
    _, base_params = _build_filters(spec.base_filters, src_cols, spec.source_table, "base_filters")
    params.extend(base_params)
    params.append(cutoff)
    if spec.sentiment is not None and snt_cols is not None:
        params.extend(_sentiment_case_params(spec.sentiment))
        params.append(cutoff)

    rows = await _run_query(sql, params)
    return {"rows": rows, "row_count": len(rows)}


@router.post("/{name}/timeseries")
async def timeseries(name: str, req: TimeseriesRequest) -> dict[str, Any]:
    """Bucketed (metric_name, bucket) rows for a single group_key."""
    spec = _resolve_scorecard(name)
    src_cols = _check_table(spec.source_table)
    _check_col(spec.group_column, src_cols, "group_column", spec.source_table)
    _check_col(spec.timestamp_column, src_cols, "timestamp_column", spec.source_table)
    _check_col(spec.metric_label_column, src_cols, "metric_label_column", spec.source_table)
    _check_col(spec.score_column, src_cols, "score_column", spec.source_table)

    base_where, base_params = _build_filters(
        spec.base_filters, src_cols, spec.source_table, "base_filters"
    )
    failure_clause, failure_params = _maybe_failure_filter(
        spec.anomaly, src_cols, spec.source_table
    )
    failure_sql = (
        f"COUNT(*) FILTER (WHERE {failure_clause}) AS failures"
        if failure_clause
        else "0 AS failures"
    )

    label_col_q = f'"{spec.metric_label_column}"'
    score_col_q = f'"{spec.score_column}"'
    sql = f"""
        SELECT
            DATE_TRUNC(?, "{spec.timestamp_column}")::text AS bucket,
            {label_col_q} AS metric_name,
            AVG(CAST({score_col_q} AS DOUBLE)) AS avg_score,
            COUNT(*) AS total,
            {failure_sql}
        FROM "{spec.source_table}"
        WHERE {base_where}
          AND "{spec.group_column}" = ?
          AND "{spec.timestamp_column}" >= ?
        GROUP BY bucket, {label_col_q}
        ORDER BY bucket, {label_col_q}
    """

    # SQL order: granularity, failure_filter (in SELECT's COUNT FILTER), then
    # WHERE base, source, cutoff.
    params: list[Any] = [
        req.granularity,
        *failure_params,
        *base_params,
        req.source_filter,
        _cutoff(req.lookback_days),
    ]
    rows = await _run_query(sql, params)
    return {"rows": rows, "row_count": len(rows)}


@router.post("/{name}/anomalies")
async def anomalies(name: str, req: AnomaliesRequest) -> dict[str, Any]:
    """Anomaly counts (total/critical/warning) plus per-metric breakdown."""
    spec = _resolve_scorecard(name)
    src_cols = _check_table(spec.source_table)
    if spec.anomaly is None or not spec.anomaly.failure_filter:
        raise _bad_config("anomalies view requires anomaly.failure_filter to be configured")
    _check_col(spec.group_column, src_cols, "group_column", spec.source_table)
    _check_col(spec.timestamp_column, src_cols, "timestamp_column", spec.source_table)
    _check_col(spec.metric_label_column, src_cols, "metric_label_column", spec.source_table)

    base_where, base_params = _build_filters(
        spec.base_filters, src_cols, spec.source_table, "base_filters"
    )
    fail_where, fail_params = _build_filters(
        spec.anomaly.failure_filter, src_cols, spec.source_table, "anomaly.failure_filter"
    )
    crit_where, crit_params = _build_filters(
        spec.anomaly.critical_rule, src_cols, spec.source_table, "anomaly.critical_rule"
    )
    has_critical = bool(spec.anomaly.critical_rule)

    crit_expr = f"({crit_where})" if has_critical else "FALSE"
    src_filter_sql = f' AND "{spec.group_column}" = ?' if req.source_filter else ""
    label_col_q = f'"{spec.metric_label_column}"'

    # total_evaluations is the denominator for anomaly-rate health bands; the
    # WHERE clause selects evaluation rows in scope (base + cutoff + optional
    # source), and FILTER clauses split out anomalies / critical / warning.
    sql = f"""
        SELECT
            {label_col_q} AS metric_name,
            COUNT(*) AS total_evaluations,
            COUNT(*) FILTER (WHERE {fail_where}) AS anomaly_count,
            COUNT(*) FILTER (WHERE ({fail_where}) AND {crit_expr}) AS critical,
            COUNT(*) FILTER (WHERE ({fail_where}) AND NOT ({crit_expr})) AS warning
        FROM "{spec.source_table}"
        WHERE {base_where}
          AND "{spec.timestamp_column}" >= ?{src_filter_sql}
        GROUP BY {label_col_q}
        ORDER BY anomaly_count DESC, total_evaluations DESC
    """

    # SQL placeholder order, top-down through the SELECT then WHERE:
    #   1. anomaly_count FILTER:                fail_params
    #   2. critical FILTER:                     fail_params + crit_params (if has_critical)
    #   3. warning FILTER:                      fail_params + crit_params (if has_critical)
    #   4. WHERE base_filters:                  base_params
    #   5. WHERE timestamp >= ?:                cutoff
    #   6. optional WHERE group_column = ?:     source_filter
    params: list[Any] = []
    params.extend(fail_params)
    params.extend(fail_params)
    if has_critical:
        params.extend(crit_params)
    params.extend(fail_params)
    if has_critical:
        params.extend(crit_params)
    params.extend(base_params)
    params.append(_cutoff(req.lookback_days))
    if req.source_filter:
        params.append(req.source_filter)

    rows = await _run_query(sql, params)
    counts = {
        "total_evaluations": sum(int(r["total_evaluations"] or 0) for r in rows),
        "total": sum(int(r["anomaly_count"] or 0) for r in rows),
        "critical": sum(int(r["critical"] or 0) for r in rows),
        "warning": sum(int(r["warning"] or 0) for r in rows),
    }
    return {"counts": counts, "by_metric": rows}


@router.post("/{name}/anomaly_detail")
async def anomaly_detail(name: str, req: AnomalyDetailRequest) -> dict[str, Any]:
    """Drill-down list of failing rows for a (group_key, metric_name) pair."""
    spec = _resolve_scorecard(name)
    src_cols = _check_table(spec.source_table)
    if not spec.detail_columns:
        raise _bad_config("anomaly_detail view requires detail_columns to be configured")
    if spec.anomaly is None or not spec.anomaly.failure_filter:
        raise _bad_config("anomaly_detail view requires anomaly.failure_filter to be configured")
    _check_col(spec.group_column, src_cols, "group_column", spec.source_table)
    _check_col(spec.timestamp_column, src_cols, "timestamp_column", spec.source_table)
    _check_col(spec.metric_label_column, src_cols, "metric_label_column", spec.source_table)

    passthrough = frozenset(spec.json_passthrough_columns)
    for c in spec.detail_columns:
        _check_col(c, src_cols, "detail_columns", spec.source_table, passthrough)
    select_sql = ", ".join(f'"{c}"' for c in spec.detail_columns)

    base_where, base_params = _build_filters(
        spec.base_filters, src_cols, spec.source_table, "base_filters"
    )
    fail_where, fail_params = _build_filters(
        spec.anomaly.failure_filter, src_cols, spec.source_table, "anomaly.failure_filter"
    )

    label_col_q = f'"{spec.metric_label_column}"'
    sql = f"""
        SELECT {select_sql}
        FROM "{spec.source_table}"
        WHERE {base_where}
          AND "{spec.group_column}" = ?
          AND {label_col_q} = ?
          AND "{spec.timestamp_column}" >= ?
          AND ({fail_where})
        ORDER BY "{spec.timestamp_column}" DESC
        LIMIT ?
    """

    params: list[Any] = [
        *base_params,
        req.source_filter,
        req.metric_name,
        _cutoff(req.lookback_days),
        *fail_params,
        req.limit,
    ]
    rows = await _run_query(sql, params)
    # Coerce passthrough JSON columns into a wire-valid JSON string. Three cases:
    #   (1) None -> leave alone
    #   (2) dict/list (DuckDB STRUCT/MAP path) -> json.dumps
    #   (3) str -> may already be valid JSON, OR a Python str(dict) repr written
    #       upstream (single quotes, None/True/False). If it doesn't parse as
    #       JSON, fall back to ast.literal_eval and re-serialize.
    for row in rows:
        for col in spec.json_passthrough_columns:
            val = row.get(col)
            if val is None:
                continue
            if isinstance(val, str):
                try:
                    json.loads(val)
                except json.JSONDecodeError:
                    with contextlib.suppress(ValueError, SyntaxError):
                        row[col] = json.dumps(ast.literal_eval(val), default=str)
            else:
                row[col] = json.dumps(val, default=str)
    return {"rows": rows, "row_count": len(rows)}


@router.post("/{name}/metric_summary")
async def metric_summary(name: str, req: MetricSummaryRequest) -> dict[str, Any]:
    """LLM-powered pattern summary across failing eval rows for one metric.

    Uses the same WHERE clause as ``anomaly_detail`` (base_filters + group_column
    match + lookback + failure_filter), but caps to ``max_issues`` and feeds the
    rows through Axion's ``InsightExtractor`` after mapping ``explanation``
    -> ``critique`` and forwarding ``signals`` so the LLM sees the structured
    failure evidence (per-claim verdicts, status, decision_source, etc.).

    Response includes both ``total_failed_available`` (DuckDB count) and
    ``total_issues_analyzed`` (post-cap) so the caller can show a sampling
    banner when the cap was hit.
    """
    spec = _resolve_scorecard(name)
    src_cols = _check_table(spec.source_table)
    if not spec.detail_columns:
        raise _bad_config("metric_summary view requires detail_columns to be configured")
    if spec.anomaly is None or not spec.anomaly.failure_filter:
        raise _bad_config(
            "metric_summary view requires anomaly.failure_filter to be configured"
        )
    _check_col(spec.group_column, src_cols, "group_column", spec.source_table)
    _check_col(spec.timestamp_column, src_cols, "timestamp_column", spec.source_table)
    _check_col(spec.metric_label_column, src_cols, "metric_label_column", spec.source_table)

    passthrough = frozenset(spec.json_passthrough_columns)
    for c in spec.detail_columns:
        _check_col(c, src_cols, "detail_columns", spec.source_table, passthrough)

    # Dynamically extend the projection with optional context columns when
    # they exist on the live table. These carry the agent's *actual*
    # behavior (input case, agent response, additional structured I/O)
    # which is what makes the LLM analysis behavioral instead of
    # metric-shaped. Skipped silently when a column is absent so we don't
    # break environments that haven't backfilled them yet.
    optional_context_cols = (
        "query",
        "actual_output",
        "expected_output",
        "additional_input",
        "additional_output",
    )
    extra_cols = [
        c
        for c in optional_context_cols
        if c in src_cols and c not in spec.detail_columns
    ]
    missing_optional = [c for c in optional_context_cols if c not in src_cols]
    projected_cols = list(spec.detail_columns) + extra_cols
    select_sql = ", ".join(f'"{c}"' for c in projected_cols)
    logger.info(
        "metric_summary: projecting %d cols (optional present=%s, missing=%s)",
        len(projected_cols),
        extra_cols,
        missing_optional,
    )
    print(
        f"[METRIC_SUMMARY] projecting {len(projected_cols)} cols "
        f"(optional present={extra_cols}, missing={missing_optional})",
        flush=True,
    )

    base_where, base_params = _build_filters(
        spec.base_filters, src_cols, spec.source_table, "base_filters"
    )
    fail_where, fail_params = _build_filters(
        spec.anomaly.failure_filter, src_cols, spec.source_table, "anomaly.failure_filter"
    )

    label_col_q = f'"{spec.metric_label_column}"'
    where_clause = f"""
        WHERE {base_where}
          AND "{spec.group_column}" = ?
          AND {label_col_q} = ?
          AND "{spec.timestamp_column}" >= ?
          AND ({fail_where})
    """
    rows_sql = f"""
        SELECT {select_sql}
        FROM "{spec.source_table}"
        {where_clause}
        ORDER BY "{spec.timestamp_column}" DESC
        LIMIT ?
    """
    count_sql = f"""
        SELECT COUNT(*) AS n
        FROM "{spec.source_table}"
        {where_clause}
    """
    common_params: list[Any] = [
        *base_params,
        req.source_filter,
        req.metric_name,
        _cutoff(req.lookback_days),
        *fail_params,
    ]

    rows = await _run_query(rows_sql, [*common_params, req.max_issues])
    count_rows = await _run_query(count_sql, common_params)
    total_failed_available = int(count_rows[0]["n"]) if count_rows else 0
    if rows and extra_cols:
        stats: dict[str, dict[str, int]] = {}
        for c in extra_cols:
            sizes: list[int] = []
            populated_n = 0
            for r in rows:
                v = r.get(c)
                if v in (None, "", [], {}):
                    continue
                populated_n += 1
                if isinstance(v, str):
                    sizes.append(len(v))
                else:
                    with contextlib.suppress(Exception):
                        sizes.append(len(json.dumps(v, default=str)))
            stats[c] = {
                "populated": populated_n,
                "max_chars": max(sizes) if sizes else 0,
                "avg_chars": (sum(sizes) // len(sizes)) if sizes else 0,
            }
        logger.info(
            "metric_summary: optional context (rows=%d): %s",
            len(rows),
            stats,
        )

    # Coerce passthrough JSON columns into a wire-valid JSON string (same logic
    # as anomaly_detail). The IssueExtractorService will parse `signals` back to
    # a structured value via include_context_fields.
    for row in rows:
        for col in spec.json_passthrough_columns:
            val = row.get(col)
            if val is None:
                continue
            if isinstance(val, str):
                try:
                    json.loads(val)
                except json.JSONDecodeError:
                    with contextlib.suppress(ValueError, SyntaxError):
                        row[col] = json.dumps(ast.literal_eval(val), default=str)
            else:
                row[col] = json.dumps(val, default=str)

    generated_at = datetime.now(UTC).isoformat()

    if not rows:
        return {
            "patterns": [],
            "learnings": [],
            "total_failed_available": total_failed_available,
            "total_issues_analyzed": 0,
            "metric_name": req.metric_name,
            "lookback_days": req.lookback_days,
            "generated_at": generated_at,
        }

    # Map scorecard rows -> records expected by IssueExtractorService.
    # Critical: explanation -> critique (Axion's canonical critique field);
    # signals flattened from structured JSON into list[str] of "path=value" lines
    # so ExtractedIssue.signals (typed list[str]) accepts them and the downstream
    # Axion adapter folds them into the LLM prompt.
    #
    # query/actual_output/expected_output/additional_* carry the agent's
    # actual behavior. They can be very long (full agent transcripts +
    # submission JSON); truncate per-row so a 35-row analysis doesn't
    # blow the LLM context window.
    #
    # 12000 chars ≈ 3k tokens per field. With 5 optional fields x 35
    # rows that's a hard ceiling around 525k tokens; in practice most
    # rows are far shorter and only `additional_input` (submission
    # blob) routinely fills the budget.
    #
    # For dicts/lists, json.dumps(indent=2) before truncation so a
    # mid-structure cut still leaves the LLM a clean prefix of
    # well-formed JSON to reason over instead of corrupted concatenation.
    _MAX_CONTEXT_CHARS = 12000

    def _truncate(value: Any) -> str | None:
        if value is None:
            return None
        s: str = value if isinstance(value, str) else ""
        if not s:
            try:
                s = json.dumps(value, indent=2, default=str)
            except (TypeError, ValueError):
                s = str(value)
        if len(s) > _MAX_CONTEXT_CHARS:
            return s[:_MAX_CONTEXT_CHARS] + "\n…[truncated]"
        return s

    # IssueExtractorService.field_mapping (issue_extractor_service.py L232)
    # only recognizes query/actual_output/expected_output/retrieved_content/
    # conversation/signals/critique — `additional_input`/`additional_output`
    # are silently dropped. Worse: even fields it does keep land in
    # `item_context`, but axion's EvidenceItem.text is built from
    # `description` (= issue.critique) only. So nothing in item_context
    # reaches the LLM prompt.
    #
    # Workaround: bundle everything the LLM needs into a synthetic
    # `critique` upfront so it flows through description -> EvidenceItem.text.
    def _build_rich_critique(row: dict[str, Any]) -> str | None:
        # Order matters: the mithril modal renders the first ~95 chars of
        # an example verbatim. Lead with `actual_output` (the agent's actual
        # decision — APPROVE/DECLINE/REFER + reasoning) so the snippet is
        # diagnostic. Judge critique and submission context follow.
        parts: list[str] = []
        actual = _truncate(row.get("actual_output"))
        if actual:
            parts.append(f"[Agent actual_output]\n{actual}")
        explanation = row.get("explanation")
        if explanation:
            parts.append(f"[Judge critique]\n{explanation}")
        add_in = _truncate(row.get("additional_input"))
        if add_in:
            parts.append(f"[additional_input]\n{add_in}")
        add_out = _truncate(row.get("additional_output"))
        if add_out:
            parts.append(f"[additional_output]\n{add_out}")
        expected = _truncate(row.get("expected_output"))
        if expected:
            parts.append(f"[expected_output]\n{expected}")
        return "\n\n".join(parts) if parts else None

    records: list[dict[str, Any]] = []
    for row in rows:
        # Prefer the actual user input (query column) over the eval name.
        # Eval name is just a label like "athena_monitor"; query has the
        # actual case description the agent was responding to.
        query_val = row.get("query") or row.get("evaluation_name")
        records.append(
            {
                "dataset_id": row.get("dataset_id"),
                "metric_name": row.get("metric_name"),
                "metric_score": row.get("metric_score"),
                "critique": _build_rich_critique(row),
                "signals": _flatten_signals_to_lines(row.get("signals")),
                "query": _truncate(query_val),
                "actual_output": _truncate(row.get("actual_output")),
                "expected_output": _truncate(row.get("expected_output")),
            }
        )

    from app.services.issue_extractor_service import (
        ExtractionConfig,
        IssueExtractorService,
        generate_insights,
    )

    # SQL already applied the failure_filter; trust it as authoritative and
    # disable the score-threshold gate (mode="overall") so a failed row with
    # score=0.8 isn't silently dropped before the LLM sees it.
    config = ExtractionConfig(
        metric_filters=[req.metric_name],
        max_issues=req.max_issues,
        include_context_fields=[
            "query",
            "actual_output",
            "expected_output",
            "signals",
            "critique",
        ],
        fold_signals_into_description=True,
    )
    service = IssueExtractorService(mode="overall", config=config)
    extraction_result = service.extract_issues(records, metric_filter=req.metric_name)

    if not extraction_result.issues:
        return {
            "patterns": [],
            "learnings": [],
            "total_failed_available": total_failed_available,
            "total_issues_analyzed": 0,
            "metric_name": req.metric_name,
            "lookback_days": req.lookback_days,
            "generated_at": generated_at,
        }

    from app.config.agents import get_agents_config
    from app.config.metric_definitions import metric_definitions_config

    agent_lookup = {a.name: a for a in get_agents_config()}
    agent = agent_lookup.get(req.source_filter)
    agent_label = agent.label if agent else req.source_filter
    agent_role = agent.role if agent and agent.role else "AI agent"
    agent_description = (agent.description or "").strip() if agent else ""

    metric_key = req.metric_name.replace(" ", "")
    metric_def = metric_definitions_config.monitoring.get(
        metric_key
    ) or metric_definitions_config.monitoring.get(req.metric_name)
    metric_description = metric_def.description.strip() if metric_def else ""

    non_empty_signals = sum(
        1 for issue in extraction_result.issues if getattr(issue, "signals", None)
    )
    logger.info(
        "metric_summary: extracted %d issues, %d with non-empty signals (agent=%s metric=%s)",
        extraction_result.issues_found,
        non_empty_signals,
        req.source_filter,
        req.metric_name,
    )

    evaluation_name = f"{agent_label} / {req.metric_name}"

    agent_preamble = (
        f"You are analyzing failing evaluation rows for **{agent_label}**, "
        f"whose role is *{agent_role}*."
    )
    if agent_description:
        agent_preamble += f" {agent_description}"
    if metric_description:
        agent_preamble += (
            f"\n\nThe metric being evaluated is **{req.metric_name}**: {metric_description}"
        )

    clustering_instruction = (
        f"{agent_preamble}\n\n"
        "All rows below were marked failed by the upstream judge "
        "(passed=False), even when the rolled-up score is high. Each "
        "row carries:\n"
        f"- `query` / `additional_input`: the actual case {agent_label} "
        "was responding to (submission details, coverage being quoted, "
        "etc.)\n"
        f"- `actual_output` / `additional_output`: what {agent_label} "
        "actually said in response\n"
        "- `signals`: the judge's per-claim verdicts and structured "
        "failure evidence\n"
        "- `critique`: the judge's natural-language explanation\n\n"
        "Group the failing rows into clusters by recurring BEHAVIORAL "
        "failure modes — what is wrong with the *underwriting work* "
        f"{agent_label} produced, not just what the judge measured. "
        "Cluster names must describe a domain failure (e.g. 'Cites "
        "policy form numbers not present in the retrieved documents', "
        "'Recommends bind without addressing prior loss runs', "
        "'Asserts effective-date matches without source confirmation'). "
        "Avoid cluster names that restate the metric's mechanics "
        "('Out-of-scope skipping', 'Unsupported claims present', "
        "'Verified 8/9') or score buckets ('High faithfulness', "
        "'Mid-range scores'). Read `actual_output` to find what "
        f"{agent_label} actually said wrong; use `signals`/`critique` "
        "to confirm why the judge faulted it. You MUST return at least "
        "one cluster — if the behavioral signal is weak, still produce "
        "a best-effort cluster summarizing the dominant failure shape."
    )

    distillation_instruction = (
        f"{agent_preamble}\n\n"
        "Every row passed to you is a FAILURE (passed=False). Do not "
        f"produce insights that praise {agent_label} or describe what "
        "it is doing well — every learning must explain a failure mode "
        f"grounded in what {agent_label} actually said "
        "(`actual_output`/`additional_output`) and why the judge "
        "faulted it (`signals`/`critique`).\n\n"
        "Insights must reference the agent's domain behavior — e.g. "
        "'Athena cites policy form numbers that don't appear in the "
        "retrieved doc set' — not the metric's measurement mechanics "
        "(e.g. 'Athena skipped claims marked out-of-scope' is too "
        "metric-shaped; rewrite as the underlying domain failure that "
        "led to those skips).\n\n"
        "Produce 1-2 recommended actions per cluster - fewer is fine, "
        "but never zero. Each action item must:\n"
        f"- Be a concrete change to {agent_label} — its system prompt, "
        "its tools, its retrieval pipeline, or its output format.\n"
        f"- Reference what {agent_label} should do *differently*; "
        "avoid generic LLM hygiene advice ('add a self-check', "
        "'use a verification step') untethered from the agent.\n"
        "- Be ≤ 25 words. Lead with an imperative verb (Add, "
        "Replace, Constrain, Inject, Require). No preamble.\n"
        "- Be deduplicated semantically within the cluster. 'Add a "
        "self-check step', 'Add a pre-response audit', and 'Add a "
        "claim audit step' are the same action — keep one entry "
        "with the highest-confidence framing.\n\n"
        "Prefer fewer, sharper actions over padding."
    )

    tracer = get_request_tracer(route_name="scorecard.metric_summary")
    async with tracer.async_span(
        f"metric_summary.{req.source_filter}.{req.metric_name}",
        input={"issues": extraction_result.issues_found, "scorecard": name},
    ) as _span:
        insight_result = await generate_insights(
            extraction_result,
            evaluation_name=evaluation_name,
            clustering_instruction=clustering_instruction,
            distillation_instruction=distillation_instruction,
            max_learnings_per_cluster=2,
        )

        patterns = [
            {
                "category": p.category,
                "description": p.description,
                "count": p.count,
                "metrics_involved": p.metrics_involved,
                "examples": p.examples[:5],
                "distinct_test_cases": p.distinct_test_cases,
                "is_cross_metric": p.is_cross_metric,
                "confidence": p.confidence,
            }
            for p in insight_result.patterns
        ]
        learnings = [
            {
                "title": le.title,
                "content": le.content,
                "tags": le.tags,
                "confidence": le.confidence,
                "recommended_actions": list(le.recommended_actions or []),
                "scope": le.scope,
                "when_not_to_apply": le.when_not_to_apply,
            }
            for le in insight_result.learnings
        ]
        learnings = _dedupe_and_cap_actions(learnings, req.max_action_items)
        _span.set_attribute(
            "output",
            {
                "patterns": len(patterns),
                "learnings": len(learnings),
                "pattern_titles": [p["description"][:80] for p in patterns],
                "learning_titles": [le["title"] for le in learnings],
            },
        )

    return {
        "patterns": patterns,
        "learnings": learnings,
        "total_failed_available": total_failed_available,
        "total_issues_analyzed": extraction_result.issues_found,
        "metric_name": req.metric_name,
        "lookback_days": req.lookback_days,
        "generated_at": generated_at,
    }


@router.post("/{name}/sentiment")
async def sentiment(name: str, req: ScorecardRequest) -> dict[str, Any]:
    """Per-group_key average sentiment from the sentiment_table."""
    spec = _resolve_scorecard(name)
    if spec.sentiment is None:
        raise _bad_config("sentiment view requires sentiment block to be configured")
    snt = spec.sentiment
    snt_table = snt.table or spec.sentiment_table
    if not snt_table:
        raise _bad_config("sentiment configured but no sentiment_table set")

    snt_cols = _check_table(snt_table)
    _check_col(snt.column, snt_cols, "sentiment.column", snt_table)
    _check_col(snt.timestamp_column, snt_cols, "sentiment.timestamp_column", snt_table)
    if spec.group_column not in snt_cols:
        raise _bad_config(f"group_column '{spec.group_column}' not present on '{snt_table}'")

    case_expr = _build_sentiment_case(snt)
    sql = f"""
        SELECT
            "{spec.group_column}" AS group_key,
            AVG({case_expr}) AS sentiment_avg,
            COUNT(*) FILTER (WHERE "{snt.column}" IS NOT NULL) AS sample_count
        FROM "{snt_table}"
        WHERE TRY_CAST("{snt.timestamp_column}" AS TIMESTAMP) >= ?
        GROUP BY "{spec.group_column}"
        ORDER BY group_key
    """
    params: list[Any] = [*_sentiment_case_params(snt), _cutoff(req.lookback_days)]
    rows = await _run_query(sql, params)
    return {"rows": rows, "row_count": len(rows)}


# ----------------------------------------------------------------------
# Signals helpers
# ----------------------------------------------------------------------


def _resolve_signals_table(spec: ScorecardSpec) -> str:
    """Return the signals table name, falling back to sentiment_table."""
    if spec.signals is None:
        raise _bad_config("signals view requires signals block to be configured")
    table = spec.signals.table or spec.sentiment_table
    if not table:
        raise _bad_config(
            "signals configured but no table set (set signals.table or sentiment_table)"
        )
    return table


def _filter_signal_metrics(metrics: list[Any], metric_name: str | None) -> list[Any]:
    """Filter signal metrics by eval metric_name.

    When metric_name is None, all metrics are returned unchanged.
    When metric_name is set, a metric is included if its metric_names list is
    empty (universal — applies to every eval metric) or contains metric_name.
    """
    if metric_name is None:
        return metrics
    return [m for m in metrics if not m.metric_names or metric_name in m.metric_names]


def _build_signals_flat_sql(
    cfg: SignalsConfig,
    sig_cols: set[str],
    table: str,
    cutoff: datetime,
    metric_name: str | None = None,
) -> tuple[str, list[Any]]:
    """Build a UNION ALL query returning one row per (group_key, signal_key, value).

    Validates all metric keys against the live schema. Returns ("", []) when
    cfg.metrics is empty (or filtered to empty by metric_name) so the caller can
    short-circuit to empty rows.
    """
    _check_col(cfg.group_column, sig_cols, "signals.group_column", table)
    _check_col(cfg.timestamp_column, sig_cols, "signals.timestamp_column", table)

    blocks: list[str] = []
    params: list[Any] = []

    for m in _filter_signal_metrics(cfg.metrics, metric_name):
        _check_col(m.key, sig_cols, f"signals.metrics[{m.key}]", table)
        if m.match_values:
            for val in m.match_values:
                blocks.append(f"""
                    SELECT
                        "{cfg.group_column}" AS group_key,
                        ? AS signal_key,
                        ? AS signal_value,
                        COUNT(*) AS count,
                        MAX(TRY_CAST("{cfg.timestamp_column}" AS TIMESTAMP)) AS last_signal_at
                    FROM "{table}"
                    WHERE TRY_CAST("{cfg.timestamp_column}" AS TIMESTAMP) >= ?
                      AND "{m.key}" = ?
                    GROUP BY "{cfg.group_column}"
                """)
                params.extend([m.key, val, cutoff, val])
        else:
            blocks.append(f"""
                SELECT
                    "{cfg.group_column}" AS group_key,
                    ? AS signal_key,
                    NULL AS signal_value,
                    COUNT(*) AS count,
                    MAX(TRY_CAST("{cfg.timestamp_column}" AS TIMESTAMP)) AS last_signal_at
                FROM "{table}"
                WHERE TRY_CAST("{cfg.timestamp_column}" AS TIMESTAMP) >= ?
                  AND "{m.key}" IS NOT NULL
                GROUP BY "{cfg.group_column}"
            """)
            params.extend([m.key, cutoff])

    if not blocks:
        return "", []
    return "\nUNION ALL\n".join(blocks), params


def _build_signal_detail_sql(
    cfg: SignalsConfig,
    sig_cols: set[str],
    table: str,
    source_filter: str,
    signal_key: str | None,
    metric_name: str | None,
    cutoff: datetime,
    limit: int,
) -> tuple[str, list[Any]]:
    """Build SQL + params for the signal_detail view.

    Returns one row per (case, matching signal). When signal_key is None, UNION
    ALL across all configured metrics. metric_name further restricts to signals
    tagged for that eval metric (universal signals — no metric_names — always pass).
    """
    _check_col(cfg.group_column, sig_cols, "signals.group_column", table)
    _check_col(cfg.timestamp_column, sig_cols, "signals.timestamp_column", table)
    _check_col(cfg.case_id_column, sig_cols, "signals.case_id_column", table)
    for c in cfg.detail_columns:
        _check_col(c, sig_cols, "signals.detail_columns", table)

    if signal_key is not None:
        metrics = [m for m in cfg.metrics if m.key == signal_key]
        if not metrics:
            raise _bad_request(
                "invalid_request",
                f"signal_key '{signal_key}' is not configured in signals.metrics",
                signal_key=signal_key,
            )
        # Apply metric_name after signal_key: AND semantics. Empty result is valid.
        metrics = _filter_signal_metrics(metrics, metric_name)
    else:
        metrics = _filter_signal_metrics(cfg.metrics, metric_name)
        for m in metrics:
            _check_col(m.key, sig_cols, f"signals.metrics[{m.key}]", table)

    detail_selects = (
        ", " + ", ".join(f'"{c}"' for c in cfg.detail_columns) if cfg.detail_columns else ""
    )

    blocks: list[str] = []
    params: list[Any] = []

    for m in metrics:
        _check_col(m.key, sig_cols, f"signals.metrics[{m.key}]", table)
        if m.match_values:
            placeholders = ", ".join(["?"] * len(m.match_values))
            value_filter = f'"{m.key}" IN ({placeholders})'
        else:
            value_filter = f'"{m.key}" IS NOT NULL'

        blocks.append(f"""
            SELECT
                "{cfg.case_id_column}" AS case_id,
                "{cfg.group_column}" AS source_name,
                ? AS signal_key,
                "{m.key}" AS signal_value,
                "{cfg.timestamp_column}" AS timestamp{detail_selects}
            FROM "{table}"
            WHERE TRY_CAST("{cfg.timestamp_column}" AS TIMESTAMP) >= ?
              AND "{cfg.group_column}" = ?
              AND ({value_filter})
        """)
        block_params: list[Any] = [m.key, cutoff, source_filter]
        if m.match_values:
            block_params.extend(m.match_values)
        params.extend(block_params)

    if not blocks:
        return "", []

    union_sql = "\nUNION ALL\n".join(blocks)
    sql = f"""
        SELECT * FROM (
            {union_sql}
        ) _sig
        ORDER BY TRY_CAST(timestamp AS TIMESTAMP) DESC
        LIMIT ?
    """
    params.append(limit)
    return sql, params


@router.post("/{name}/signals")
async def signals(name: str, req: SignalsRequest) -> dict[str, Any]:
    """One row per group_key: total signal count and per-(signal_key, value) breakdown."""
    spec = _resolve_scorecard(name)
    if spec.signals is None:
        raise _bad_config("signals view requires signals block to be configured")
    table = _resolve_signals_table(spec)
    cfg = spec.signals

    sig_cols = _check_table(table)
    cutoff = _cutoff(req.lookback_days)

    sql, params = _build_signals_flat_sql(cfg, sig_cols, table, cutoff, req.metric_name)
    if not sql:
        return {"rows": [], "row_count": 0}

    flat_rows = await _run_query(sql, params)

    by_group: dict[str, dict[str, Any]] = {}
    for row in flat_rows:
        gk = str(row["group_key"])
        if gk not in by_group:
            by_group[gk] = {
                "group_key": gk,
                "total_signals": 0,
                "by_signal": [],
                "last_signal_at": None,
            }
        cnt = int(row["count"] or 0)
        by_group[gk]["by_signal"].append(
            {"signal_key": row["signal_key"], "value": row["signal_value"], "count": cnt}
        )
        by_group[gk]["total_signals"] += cnt
        ts = row.get("last_signal_at")
        if ts is not None:
            cur = by_group[gk]["last_signal_at"]
            if cur is None or ts > cur:
                by_group[gk]["last_signal_at"] = ts

    rows = sorted(by_group.values(), key=lambda r: r["group_key"])
    return {"rows": rows, "row_count": len(rows)}


@router.post("/{name}/signal_detail")
async def signal_detail(name: str, req: SignalDetailRequest) -> dict[str, Any]:
    """Case-level rows for a single source (and optionally a single signal_key)."""
    spec = _resolve_scorecard(name)
    if spec.signals is None:
        raise _bad_config("signal_detail view requires signals block to be configured")
    table = _resolve_signals_table(spec)
    cfg = spec.signals

    sig_cols = _check_table(table)
    cutoff = _cutoff(req.lookback_days)

    sql, params = _build_signal_detail_sql(
        cfg, sig_cols, table, req.source_filter, req.signal_key, req.metric_name, cutoff, req.limit
    )
    if not sql:
        return {"rows": [], "row_count": 0}

    raw_rows = await _run_query(sql, params)

    result_rows = []
    for row in raw_rows:
        context = {c: row.get(c) for c in cfg.detail_columns}
        result_rows.append(
            {
                "case_id": row.get("case_id"),
                "source_name": row.get("source_name"),
                "signal_key": row.get("signal_key"),
                "signal_value": row.get("signal_value"),
                "timestamp": row.get("timestamp"),
                "context": context,
            }
        )
    return {"rows": result_rows, "row_count": len(result_rows)}
