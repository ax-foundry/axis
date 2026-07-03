"""OpenAI Agents SDK implementation of Ask Copilot — parallel to pydantic-ai agent.py.

This module provides an alternative implementation of the Ask Copilot copilot using
the `openai-agents` package (``agents`` module). Both implementations share the same
DuckDB tools, ThoughtStream, and SSE contract; only the agent framework differs.

Run side-by-side with the pydantic-ai agent via ``POST /copilot/stream/oai``.
"""

import logging
import math
from dataclasses import dataclass
from typing import Any

import anyio
from agents import Agent, FunctionTool, RunContextWrapper, RunHooks, RunItemStreamEvent, Runner
from agents import function_tool as ft

from app.copilot.agent import (
    _agent_where,
    _apply_agent_scope,
    _attempt_sql_fix,
    _build_schema_ddl,
    _compute_column_stats,
    _describe_sql_fix,
    _is_numeric,
    _parse_sql_error_hint,
    _trim_filter_values,
    _truncate_result,
)
from app.copilot.context import BaseCopilotContext, _safe_json
from app.copilot.guardrails import check_sql_safety
from app.copilot.hooks import tool_span
from app.copilot.llm.provider import LLMProvider
from app.copilot.request_classifier import PreparedRequest
from app.copilot.request_router import run_copilot_request
from app.copilot.thoughts import ThoughtStream
from app.copilot.tool_instructions import compose_system_prompt
from app.copilot.tracing import get_copilot_tracer, safe_span_attrs, sql_fingerprint

logger = logging.getLogger("axis.copilot.oai_agent")


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


@dataclass
class OAIContext(BaseCopilotContext):
    """OpenAI Agents SDK copilot context — inherits all shared fields from BaseCopilotContext."""


# ---------------------------------------------------------------------------
# RunHooks
# ---------------------------------------------------------------------------


class CopilotRunHooks(RunHooks[OAIContext]):
    """Lifecycle hooks for the OAI agent run.

    Tool-level thought emission is handled by ``tool_span()`` — no
    ``on_tool_start``/``on_tool_end`` needed here.
    """


# ---------------------------------------------------------------------------
# Tool definitions (module-level FunctionTool instances)
# ---------------------------------------------------------------------------


@ft
async def summarize_data(
    ctx: RunContextWrapper[OAIContext],
    include_numeric_stats: bool = True,
) -> str:
    """Generate a summary of the dataset: schema, row count, filter values, and stats.

    Args:
        ctx: Run context.
        include_numeric_stats: Whether to compute per-column min/avg/max.

    Returns:
        JSON with dataset overview.
    """
    deps = ctx.context
    cache_str = f"summarize:{include_numeric_stats}"
    async with tool_span(
        deps,
        "summarize_data",
        cache_str,
        f"Summarizing {deps.dataset_label} dataset...",
        {"include_numeric_stats": include_numeric_stats},
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        if not deps.has_data:
            return deps.no_data_error()

        store = deps.store
        table = deps.table_name
        meta = await anyio.to_thread.run_sync(
            lambda: store.get_metadata(table), limiter=store.query_limiter
        )

        result: dict[str, Any] = {
            "dataset": deps.dataset_label,
            "table": table,
            "row_count": meta.get("row_count", 0),
            "columns": [
                {"name": c["column_name"], "type": c.get("column_type", "")}
                for c in meta.get("columns", [])
            ],
            "filter_values": _trim_filter_values(meta.get("filter_values", {})),
        }
        if meta.get("time_range"):
            result["time_range"] = meta["time_range"]

        if include_numeric_stats:
            num_cols = [c["column_name"] for c in meta.get("columns", []) if _is_numeric(c)][:8]
            if num_cols:
                agg = ", ".join(
                    f'ROUND(AVG(CAST("{c}" AS DOUBLE)), 4) AS "{c}_avg",'
                    f' MIN(CAST("{c}" AS DOUBLE)) AS "{c}_min",'
                    f' MAX(CAST("{c}" AS DOUBLE)) AS "{c}_max"'
                    for c in num_cols
                )
                try:
                    rows = await anyio.to_thread.run_sync(
                        lambda: store.query_list(
                            f"SELECT {agg} FROM {table}{_agent_where(deps.agent_name)}"
                        ),
                        limiter=store.query_limiter,
                    )
                    if rows:
                        result["numeric_stats"] = {
                            c: {
                                "avg": rows[0].get(f"{c}_avg"),
                                "min": rows[0].get(f"{c}_min"),
                                "max": rows[0].get(f"{c}_max"),
                            }
                            for c in num_cols
                        }
                except Exception as exc:
                    logger.debug("Numeric stats query failed: %s", exc)

        await deps.thought_stream.emit_observation(
            f"Summary: {result['row_count']} rows, {len(result['columns'])} columns",
            tool_name="summarize_data",
        )
        out = _truncate_result(_safe_json(result))
        deps.set_cached("summarize_data", cache_str, out)
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


@ft
async def query_data(
    ctx: RunContextWrapper[OAIContext],
    filter_column: str | None = None,
    filter_value: str | None = None,
    find_min_column: str | None = None,
    find_max_column: str | None = None,
    search_text: str | None = None,
    limit: int = 20,
) -> str:
    """Query the dataset for specific records, min/max values, or text searches.

    Args:
        ctx: Run context.
        filter_column: Column name to filter by.
        filter_value: Value to filter for (substring/ILIKE match).
        find_min_column: Return the record with the lowest value in this column.
        find_max_column: Return the record with the highest value in this column.
        search_text: Search for text across ID-like columns.
        limit: Max records to return (capped at 50).

    Returns:
        JSON with matching records and total count.
    """
    deps = ctx.context
    cache_str = (
        f"query:{filter_column}:{filter_value}:{find_min_column}"
        f":{find_max_column}:{search_text}:{limit}"
    )
    async with tool_span(
        deps,
        "query_data",
        cache_str,
        f"Querying {deps.dataset_label} dataset...",
        {
            "filter_column": filter_column,
            "filter_value": filter_value,
            "find_min_column": find_min_column,
            "find_max_column": find_max_column,
            "search_text": search_text,
            "limit": limit,
        },
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        if not deps.has_data:
            return deps.no_data_error()

        store = deps.store
        table = deps.table_name
        available_cols = await anyio.to_thread.run_sync(
            lambda: store.get_table_columns(table), limiter=store.query_limiter
        )

        result: dict[str, Any] = {"table": table}
        conditions: list[str] = []

        if deps.agent_name:
            _safe_agent = deps.agent_name.replace("'", "''")
            conditions.append(f"source_name = '{_safe_agent}'")

        if filter_column and filter_value:
            if filter_column not in available_cols:
                similar = [c for c in available_cols if filter_column.lower() in c.lower()]
                if similar:
                    filter_column = similar[0]
                else:
                    return _safe_json(
                        {
                            "error": (
                                f"Column '{filter_column}' not found. "
                                f"Available: {sorted(available_cols)}"
                            )
                        }
                    )
            safe_val = filter_value.replace("'", "''")
            conditions.append(f"CAST(\"{filter_column}\" AS VARCHAR) ILIKE '%{safe_val}%'")

        if search_text:
            id_cols = [c for c in available_cols if "id" in c.lower()][:3]
            if id_cols:
                safe_txt = search_text.replace("'", "''")
                id_conds = " OR ".join(
                    f"CAST(\"{c}\" AS VARCHAR) ILIKE '%{safe_txt}%'" for c in id_cols
                )
                conditions.append(f"({id_conds})")

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        limit_n = min(int(limit), 50)

        try:
            records = await anyio.to_thread.run_sync(
                lambda: store.query_list(f"SELECT * FROM {table} {where} LIMIT {limit_n}"),
                limiter=store.query_limiter,
            )
            total = await anyio.to_thread.run_sync(
                lambda: store.query_value(f"SELECT COUNT(*) FROM {table} {where}"),
                limiter=store.query_limiter,
            )
            result["records"] = records
            result["total_matching"] = int(total or 0)
            result["returned"] = len(records)
        except Exception as exc:
            return _safe_json({"error": f"Query failed: {exc}"})

        if find_min_column:
            col = find_min_column
            if col not in available_cols:
                similar = [c for c in available_cols if col.lower() in c.lower()]
                col = similar[0] if similar else None  # type: ignore[assignment]
            if col:
                try:
                    min_row = await anyio.to_thread.run_sync(
                        lambda: store.query_list(
                            f"SELECT * FROM {table}{_agent_where(deps.agent_name)}"
                            f' ORDER BY CAST("{col}" AS DOUBLE) ASC NULLS LAST LIMIT 1'
                        ),
                        limiter=store.query_limiter,
                    )
                    result["min_record"] = min_row[0] if min_row else None
                except Exception as exc:
                    logger.debug("Min query failed: %s", exc)

        if find_max_column:
            col = find_max_column
            if col not in available_cols:
                similar = [c for c in available_cols if col.lower() in c.lower()]
                col = similar[0] if similar else None  # type: ignore[assignment]
            if col:
                try:
                    max_row = await anyio.to_thread.run_sync(
                        lambda: store.query_list(
                            f"SELECT * FROM {table}{_agent_where(deps.agent_name)}"
                            f' ORDER BY CAST("{col}" AS DOUBLE) DESC NULLS LAST LIMIT 1'
                        ),
                        limiter=store.query_limiter,
                    )
                    result["max_record"] = max_row[0] if max_row else None
                except Exception as exc:
                    logger.debug("Max query failed: %s", exc)

        await deps.thought_stream.emit_observation(
            f"Query returned {result.get('total_matching', 0)} matching records",
            tool_name="query_data",
        )
        out = _truncate_result(_safe_json(result))
        deps.set_cached("query_data", cache_str, out)
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


@ft
async def analyze_data(
    ctx: RunContextWrapper[OAIContext],
    columns: list[str] | None = None,
) -> str:
    """Compute statistics (avg, min, max, std, quartiles) for numeric columns via SQL.

    Args:
        ctx: Run context.
        columns: Specific columns to analyze. Analyzes all numeric columns if omitted.

    Returns:
        JSON with per-column distribution statistics and insights.
    """
    deps = ctx.context
    cache_str = f"analyze:{sorted(columns) if columns else 'all'}"
    async with tool_span(
        deps,
        "analyze_data",
        cache_str,
        f"Analyzing {deps.dataset_label} statistics...",
        {"columns": columns},
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        if not deps.has_data:
            return deps.no_data_error()

        store = deps.store
        table = deps.table_name
        meta = store.get_metadata(table)
        all_num_cols = [c["column_name"] for c in meta.get("columns", []) if _is_numeric(c)]

        if columns:
            available = store.get_table_columns(table)
            target_cols = [c for c in columns if c in available and c in all_num_cols]
            if not target_cols:
                target_cols = all_num_cols[:8]
        else:
            target_cols = all_num_cols[:8]

        if not target_cols:
            return _safe_json({"error": "No numeric columns found in this dataset."})

        agg_parts: list[str] = []
        for c in target_cols:
            agg_parts.extend(
                [
                    f'COUNT("{c}") FILTER (WHERE "{c}" IS NOT NULL) AS "{c}_count"',
                    f'ROUND(AVG(CAST("{c}" AS DOUBLE)), 4) AS "{c}_avg"',
                    f'ROUND(STDDEV(CAST("{c}" AS DOUBLE)), 4) AS "{c}_std"',
                    f'MIN(CAST("{c}" AS DOUBLE)) AS "{c}_min"',
                    f'MAX(CAST("{c}" AS DOUBLE)) AS "{c}_max"',
                    f'ROUND(MEDIAN(CAST("{c}" AS DOUBLE)), 4) AS "{c}_median"',
                    f'ROUND(QUANTILE_CONT(CAST("{c}" AS DOUBLE), 0.25), 4) AS "{c}_q25"',
                    f'ROUND(QUANTILE_CONT(CAST("{c}" AS DOUBLE), 0.75), 4) AS "{c}_q75"',
                ]
            )

        sql = f"SELECT {', '.join(agg_parts)} FROM {table}" f"{_agent_where(deps.agent_name)}"
        try:
            rows = await anyio.to_thread.run_sync(
                lambda: store.query_list(sql), limiter=store.query_limiter
            )
        except Exception as exc:
            return _safe_json({"error": f"Analysis query failed: {exc}"})

        distributions: dict[str, Any] = {}
        if rows:
            row = rows[0]
            for c in target_cols:
                distributions[c] = {
                    "count": row.get(f"{c}_count"),
                    "avg": row.get(f"{c}_avg"),
                    "std": row.get(f"{c}_std"),
                    "min": row.get(f"{c}_min"),
                    "max": row.get(f"{c}_max"),
                    "median": row.get(f"{c}_median"),
                    "q25": row.get(f"{c}_q25"),
                    "q75": row.get(f"{c}_q75"),
                }

        insights: list[str] = []
        for col, stats in distributions.items():
            avg = stats.get("avg")
            mx = stats.get("max", 1.0)
            if avg is not None and mx is not None and mx <= 1.0:
                if avg < 0.5:
                    insights.append(f"{col}: low avg ({avg:.3f}) — may need attention")
                elif avg >= 0.8:
                    insights.append(f"{col}: high avg ({avg:.3f}) — performing well")

        result = {
            "distributions": distributions,
            "columns_analyzed": target_cols,
            "insights": insights,
        }
        await deps.thought_stream.emit_observation(
            f"Analyzed {len(distributions)} columns",
            tool_name="analyze_data",
        )
        out = _truncate_result(_safe_json(result))
        deps.set_cached("analyze_data", cache_str, out)
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


@ft
async def compare_data(
    ctx: RunContextWrapper[OAIContext],
    group_by: str,
    metric_column: str | None = None,
) -> str:
    """Compare metric averages across groups using SQL GROUP BY.

    Args:
        ctx: Run context.
        group_by: Column to group by (e.g., 'environment', 'source_name').
        metric_column: Specific metric to compare. Compares all numeric columns if omitted.

    Returns:
        JSON with per-group averages and row counts.
    """
    deps = ctx.context
    cache_str = f"compare:{group_by}:{metric_column}"
    async with tool_span(
        deps,
        "compare_data",
        cache_str,
        f"Comparing groups in {deps.dataset_label}...",
        {"group_by": group_by, "metric_column": metric_column},
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        if not deps.has_data:
            return deps.no_data_error()

        store = deps.store
        table = deps.table_name
        available_cols = store.get_table_columns(table)

        if group_by not in available_cols:
            similar = [c for c in available_cols if group_by.lower() in c.lower()]
            if similar:
                group_by = similar[0]
            else:
                return _safe_json(
                    {
                        "error": (
                            f"Column '{group_by}' not found. "
                            f"Available: {sorted(available_cols)}"
                        )
                    }
                )

        meta = store.get_metadata(table)
        num_cols = [
            c["column_name"]
            for c in meta.get("columns", [])
            if _is_numeric(c) and c["column_name"] != group_by
        ][:6]

        if metric_column:
            if metric_column in available_cols and metric_column in num_cols:
                num_cols = [metric_column]
            elif metric_column not in available_cols:
                similar = [c for c in num_cols if metric_column.lower() in c.lower()]
                if similar:
                    num_cols = [similar[0]]

        if not num_cols:
            return _safe_json({"error": "No numeric columns to compare."})

        agg_parts = ["COUNT(*) AS _count"] + [
            f'ROUND(AVG(CAST("{c}" AS DOUBLE)), 4) AS "{c}_avg"' for c in num_cols
        ]
        sql = (
            f'SELECT "{group_by}", {", ".join(agg_parts)} FROM {table}'
            f"{_agent_where(deps.agent_name)} "
            f'GROUP BY "{group_by}" ORDER BY _count DESC LIMIT 30'
        )

        try:
            rows = await anyio.to_thread.run_sync(
                lambda: store.query_list(sql), limiter=store.query_limiter
            )
        except Exception as exc:
            return _safe_json({"error": f"Comparison query failed: {exc}"})

        result = {
            "group_by": group_by,
            "groups": len(rows),
            "metrics_compared": num_cols,
            "data": rows,
        }
        await deps.thought_stream.emit_observation(
            f"Compared {len(rows)} groups across {len(num_cols)} metrics",
            tool_name="compare_data",
        )
        out = _truncate_result(_safe_json(result))
        deps.set_cached("compare_data", cache_str, out)
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


@ft
async def query_kpi_data(
    ctx: RunContextWrapper[OAIContext],
    filter_category: str | None = None,
    limit: int = 50,
) -> str:
    """Query KPI data from the kpi_data DuckDB table.

    Args:
        ctx: Run context.
        filter_category: Optional KPI category to filter by (ILIKE match).
        limit: Max records to return.

    Returns:
        JSON with KPI records.
    """
    deps = ctx.context
    cache_str = f"kpi:{filter_category}:{limit}"
    async with tool_span(
        deps,
        "query_kpi_data",
        cache_str,
        "Querying KPI data...",
        {"filter_category": filter_category, "limit": limit},
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        store = deps.store
        if not store.has_table("kpi_data"):
            return _safe_json({"error": "No KPI data available. Trigger a KPI sync first."})

        where = ""
        if filter_category:
            safe_cat = filter_category.replace("'", "''")
            where = f"WHERE kpi_category ILIKE '%{safe_cat}%'"

        sql = f"SELECT * FROM kpi_data {where} LIMIT {min(int(limit), 100)}"
        try:
            rows = await anyio.to_thread.run_sync(
                lambda: store.query_list(sql), limiter=store.query_limiter
            )
            total = await anyio.to_thread.run_sync(
                lambda: store.query_value(f"SELECT COUNT(*) FROM kpi_data {where}"),
                limiter=store.query_limiter,
            )
        except Exception as exc:
            return _safe_json({"error": f"KPI query failed: {exc}"})

        result = {
            "kpi_records": rows,
            "total": int(total or 0),
            "returned": len(rows),
        }
        await deps.thought_stream.emit_observation(
            f"Retrieved {len(rows)} KPI records",
            tool_name="query_kpi_data",
        )
        out = _truncate_result(_safe_json(result))
        deps.set_cached("query_kpi_data", cache_str, out)
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


@ft
async def run_sql(
    ctx: RunContextWrapper[OAIContext],
    sql: str,
    limit: int = 100,
) -> str:
    """Execute a custom SELECT query against DuckDB.

    Use this for any question the other tools cannot answer directly:
    GROUP BY date, counts per metric, HAVING clauses, date truncation,
    multi-table joins, subqueries, window functions, etc.

    Args:
        ctx: Run context.
        sql: A SELECT statement. Use the table name from the system prompt
             (e.g. eval_data, monitoring_data). LIMIT is applied automatically
             if not present.
        limit: Max rows to return (capped at 500).

    Returns:
        JSON with rows and row count.
    """
    deps = ctx.context
    cache_str = ""
    async with tool_span(
        deps,
        "run_sql",
        cache_str,
        f"Running SQL: {sql.strip()[:120]}{'…' if len(sql.strip()) > 120 else ''}",
        {"sql": sql_fingerprint(sql.strip()), "limit": limit},
    ) as (_tracer, _span, _cached):
        sql_stripped = sql.strip().rstrip(";")

        sql_err = check_sql_safety(sql_stripped)
        if sql_err:
            return _safe_json({"error": sql_err})
        if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
            return _safe_json({"error": "Only SELECT statements are permitted."})

        limit_n = min(int(limit), 500)
        if "LIMIT" not in sql_stripped.upper():
            sql_stripped = f"{sql_stripped} LIMIT {limit_n}"

        sql_to_run = sql_stripped
        available_cols: list[str] = []
        _max_retries = 3
        for attempt in range(_max_retries):
            try:
                _current_sql = sql_to_run
                async with _tracer.async_span(
                    "copilot.db.query",
                    **safe_span_attrs(
                        table=deps.table_name,
                        sql=sql_fingerprint(_current_sql),
                        db_system="duckdb",
                        query_kind="select",
                    ),
                ) as _sql_span:
                    rows = await anyio.to_thread.run_sync(
                        lambda _s=_current_sql: deps.store.query_list(_s),
                        limiter=deps.store.query_limiter,
                    )
                    _sql_span.set_output({"row_count": len(rows)})
                _tracer.add_trace("info", "query_done", metadata={"row_count": len(rows)})
                break  # success
            except Exception as exc:
                if attempt < _max_retries - 1:
                    if not available_cols:
                        available_cols = list(deps.store.get_table_columns(deps.table_name))
                    previous_sql = sql_to_run
                    fixed = _attempt_sql_fix(sql_to_run, str(exc), available_cols)
                    if fixed:
                        diff = _describe_sql_fix(previous_sql, fixed)
                        await deps.thought_stream.emit_observation(
                            f"Auto-corrected SQL ({attempt + 1}/{_max_retries - 1}): {diff}",
                            tool_name="run_sql",
                        )
                        _tracer.add_trace(
                            "info",
                            "sql_auto_fix",
                            metadata={"attempt": attempt + 1, "diff": diff},
                        )
                        deps.error_fixes.append({"error": str(exc)[:200], "fix": diff})
                        sql_to_run = fixed
                        continue
                # No fix available or final attempt failed
                if not available_cols:
                    available_cols = list(deps.store.get_table_columns(deps.table_name))
                await deps.thought_stream.emit_observation(f"SQL error: {exc}", tool_name="run_sql")
                hint = _parse_sql_error_hint(str(exc), available_cols, deps.table_name)
                return _safe_json({"error": hint, "sql_attempted": sql_to_run})

        deps.last_sql = sql_to_run  # persist for multi-turn refinement
        deps.sql_executed_this_turn = True
        deps.turn_sql = sql_to_run
        await deps.thought_stream.emit_observation(
            f"SQL returned {len(rows)} rows",
            tool_name="run_sql",
        )
        out = _truncate_result(_safe_json({"rows": rows, "count": len(rows)}))
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": len(out)})
        _span.set_output(out[:500] if len(out) > 500 else out)
        return out


# Collect tools for easy reuse
@ft(strict_mode=False)
async def plot_data(
    ctx: RunContextWrapper[OAIContext],
    sql: str,
    traces: list[dict[str, Any]],
    layout: dict[str, Any] | None = None,
) -> str:
    """Build an interactive Plotly chart rendered in the browser.

    You write the full Plotly trace and layout config. The tool executes the SQL,
    resolves column name strings in each trace's "x" and "y" fields to actual
    data arrays, applies sensible style defaults, and renders the chart in the browser.

    Use this whenever the user asks to plot, chart, visualize, or graph data.
    On follow-ups ("set Y axis 0-1", "make it a bar chart", "add color"), call this
    again with the same SQL and the updated traces/layout.

    Args:
        ctx: Run context.
        sql: SELECT query to fetch chart data (GROUP BY date, metric, etc.).
        traces: List of Plotly trace dicts. Set "x" and "y" to the SQL column names
            as strings -- they are replaced with the actual data arrays.
            Include any Plotly trace properties you need:
            type ("scatter"/"bar"), mode ("lines+markers"), name, line, marker, etc.
            Example: [{"type": "bar", "x": "metric_name", "y": "avg_score", "name": "Score"}]
        layout: Full Plotly layout dict -- title, xaxis, yaxis, margins, annotations,
            colors, legend, etc. Merged on top of sensible defaults.
            Example: {"title": {"text": "Score Trend"}, "yaxis": {"range": [0, 1]}}

    Returns:
        Confirmation that the chart was created.
    """
    deps = ctx.context
    title_text = (layout or {}).get("title", {})
    if isinstance(title_text, dict):
        title_text = title_text.get("text", "chart")
    cache_str = ""
    async with tool_span(
        deps,
        "plot_data",
        cache_str,
        f"Building chart: {title_text}",
        {
            "sql": sql_fingerprint(sql.strip()),
            "layout_title": (layout or {}).get("title", ""),
        },
    ) as (_tracer, _span, _cached):
        if not deps.has_data:
            return deps.no_data_error()

        sql_stripped = sql.strip().rstrip(";")
        sql_err = check_sql_safety(sql_stripped)
        if sql_err:
            return _safe_json({"error": sql_err})
        if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
            return _safe_json({"error": "Only SELECT statements are permitted."})
        sql_stripped = _apply_agent_scope(sql_stripped, deps.agent_name)
        if "LIMIT" not in sql_stripped.upper():
            sql_stripped = f"{sql_stripped} LIMIT 500"

        try:
            async with _tracer.async_span(
                "copilot.db.query",
                **safe_span_attrs(
                    table=deps.table_name,
                    sql=sql_fingerprint(sql_stripped),
                    db_system="duckdb",
                    query_kind="select",
                ),
            ) as _sql_span:
                rows = await anyio.to_thread.run_sync(
                    lambda: deps.store.query_list(sql_stripped),
                    limiter=deps.store.query_limiter,
                )
                _sql_span.set_output({"row_count": len(rows)})
            _tracer.add_trace("info", "query_done", metadata={"row_count": len(rows)})
        except Exception as exc:
            return _safe_json({"error": f"Query failed: {exc}"})

        deps.last_sql = sql_stripped  # persist for multi-turn chart refinement
        deps.sql_executed_this_turn = True
        deps.turn_sql = sql_stripped

        if not rows:
            return "No data returned for the chart."

        def _coerce(v: Any) -> Any:
            if hasattr(v, "isoformat"):
                return v.isoformat()
            if isinstance(v, float) and not math.isfinite(v):
                return None
            return v

        available = list(rows[0].keys())

        def _resolve_col(name: str) -> str | None:
            if name in available:
                return name
            matches = [c for c in available if name.lower() in c.lower()]
            return matches[0] if matches else None

        resolved_traces: list[dict[str, Any]] = []
        for trace in traces:
            t = dict(trace)
            for axis in ("x", "y", "z"):
                if isinstance(t.get(axis), str):
                    col = _resolve_col(t[axis])
                    if col:
                        t[axis] = [_coerce(r[col]) for r in rows]
                    else:
                        return _safe_json(
                            {"error": f"Column '{t[axis]}' not found. Available: {available}"}
                        )
            resolved_traces.append(t)

        default_layout: dict[str, Any] = {
            "autosize": True,
            "margin": {"l": 50, "r": 20, "t": 40, "b": 50},
            "paper_bgcolor": "transparent",
            "plot_bgcolor": "transparent",
            "font": {"family": "Inter, system-ui, sans-serif", "size": 11},
            "xaxis": {
                "showgrid": True,
                "gridcolor": "rgba(0,0,0,0.05)",
                "zeroline": False,
                "showline": True,
                "tickfont": {"size": 10},
            },
            "yaxis": {
                "showgrid": True,
                "gridcolor": "rgba(0,0,0,0.05)",
                "zeroline": False,
                "showline": True,
                "tickfont": {"size": 10},
            },
            "showlegend": len(resolved_traces) > 1,
        }

        def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
            out = dict(base)
            for k, v in override.items():
                if isinstance(v, dict) and isinstance(out.get(k), dict):
                    out[k] = _merge(out[k], v)
                else:
                    out[k] = v
            return out

        deps.chart_spec = {"data": resolved_traces, "layout": _merge(default_layout, layout or {})}

        n_points = len(rows)
        await deps.thought_stream.emit_observation(
            f"Chart ready: {title_text} ({n_points} points, {len(resolved_traces)} series)",
            tool_name="plot_data",
        )
        _tracer.add_trace("info", "tool_complete", metadata={"result_len": n_points})
        out = f"Chart created: '{title_text}' — {n_points} data points, {len(resolved_traces)} series."
        _span.set_output(out[:200] if len(out) > 200 else out)
        return out


@ft
async def analyze_patterns(
    ctx: RunContextWrapper[OAIContext],
    sql: str,
    mode: str = "low",
    report_type: str = "recommendations",
    metric_filter: str | None = None,
) -> str:
    """Identify failure patterns, root causes, and improvement opportunities in the data.

    Use when asked about: what's going wrong, why scores are low, improvement areas,
    root causes, recommendations, patterns across failing cases, or success drivers.
    Write `sql` to scope the exact slice (metric, time range, environment, etc.) and
    include ORDER BY metric_score ASC for mode=low or DESC for mode=high.
    Requires long-format data with metric_name and metric_score columns.

    Args:
        ctx: Run context.
        sql: SELECT query scoping the data to analyze. Must include ORDER BY metric_score
            ASC for mode="low", DESC for "high". LLM writes this to handle arbitrary
            filters (metric, time range, env, source, etc.).
        mode: Analysis framing: "low" (failures), "high" (successes), "overall" (both).
        report_type: "summary", "detailed", "grouped", or "recommendations".
        metric_filter: Optional further filter to one metric within the SQL result set.

    Returns:
        JSON with report, insights, issues_found, records_checked, metrics_covered.
    """
    from app.services.issue_extractor_service import run_analysis_pipeline

    deps = ctx.context
    cache_str = ""
    async with tool_span(
        deps,
        "analyze_patterns",
        cache_str,
        "Analyzing patterns...",
        {"sql": sql_fingerprint(sql.strip()), "mode": mode, "report_type": report_type},
    ) as (_tracer, _span, _cached):
        if not deps.has_data:
            return deps.no_data_error()

        sql_stripped = sql.strip().rstrip(";")
        sql_err = check_sql_safety(sql_stripped)
        if sql_err:
            return _safe_json({"error": sql_err})
        if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
            return _safe_json({"error": "Only SELECT statements are permitted."})
        sql_stripped = _apply_agent_scope(sql_stripped, deps.agent_name)

        try:
            records = await anyio.to_thread.run_sync(
                lambda: deps.store.query_list(sql_stripped),
                limiter=deps.store.query_limiter,
            )
        except Exception as exc:
            return _safe_json({"error": f"Query failed: {exc}"})

        deps.sql_executed_this_turn = True
        deps.turn_sql = sql_stripped

        if records and "metric_name" not in records[0] and "metric_score" not in records[0]:
            return _safe_json(
                {
                    "error": (
                        "analyze_patterns requires long-format data with metric_name and "
                        "metric_score columns. This table appears to be wide-format or "
                        "missing these columns."
                    )
                }
            )

        await deps.thought_stream.emit_observation(
            f"Found {len(records)} records — extracting issues...",
            tool_name="analyze_patterns",
        )

        provider_type = LLMProvider.get_default_provider()
        provider_str = provider_type.value if provider_type else "openai"

        result = await run_analysis_pipeline(
            records=records,
            mode=mode,
            metric_filter=metric_filter,
            report_type=report_type,
            provider=provider_str,
        )

        first_line = result.get("report", "")[:120].split("\n")[0]
        await deps.thought_stream.emit_observation(
            f"Found {result.get('issues_found', 0)} issues — {first_line}",
            tool_name="analyze_patterns",
        )

        _tracer.add_trace(
            "info", "tool_complete", metadata={"issues_found": result.get("issues_found", 0)}
        )
        out = _truncate_result(_safe_json(result))
        _span.set_output(out[:200] if len(out) > 200 else out)
        return out


@ft(strict_mode=False)
async def save_as_dataset(
    ctx: RunContextWrapper[OAIContext],
    sql: str,
    name: str,
    description: str = "",
    tags: list[str] | None = None,
) -> str:
    """Save SQL query results as a named, persisted dataset.

    Use when the user wants to save, export, persist, or create a dataset from
    current results for later analysis or evaluation pipeline use.
    The dataset is stored in DuckDB and accessible via the Datasets API.

    Args:
        ctx: Run context.
        sql: SELECT query whose results to persist. Include any filters the user specified.
        name: Human-readable name for the dataset.
        description: Optional description of the dataset contents.
        tags: Optional list of tag strings for categorization.

    Returns:
        JSON with dataset_id, name, table, row_count, columns.
    """
    deps = ctx.context
    cache_str = ""
    async with tool_span(
        deps,
        "save_as_dataset",
        cache_str,
        f"Saving dataset: {name}",
        {"sql": sql_fingerprint(sql.strip()), "name": name},
    ) as (_tracer, _span, _cached):
        if not deps.has_data:
            return deps.no_data_error()

        sql_stripped = sql.strip().rstrip(";")
        sql_err = check_sql_safety(sql_stripped)
        if sql_err:
            return _safe_json({"error": sql_err})
        if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
            return _safe_json({"error": "Only SELECT statements are permitted."})

        try:
            result = await anyio.to_thread.run_sync(
                lambda: deps.store.create_dataset_from_sql(
                    name=name,
                    sql=sql_stripped,
                    description=description,
                    tags=tags,
                    user_id=deps.user_id,
                ),
                limiter=deps.store.query_limiter,
            )
        except Exception as exc:
            return _safe_json({"error": f"Failed to save dataset: {exc}"})

        deps.sql_executed_this_turn = True
        deps.turn_sql = sql_stripped

        await deps.thought_stream.emit_observation(
            f"Dataset '{name}' saved — {result['row_count']} rows" f" (id: {result['dataset_id']})",
            tool_name="save_as_dataset",
        )

        _tracer.add_trace("info", "tool_complete", metadata={"row_count": result["row_count"]})
        out = _safe_json(result)
        _span.set_output(out[:200] if len(out) > 200 else out)
        return out


@ft(strict_mode=False)
async def download_data(
    ctx: RunContextWrapper[OAIContext],
    sql: str,
    filename: str = "data.csv",
) -> str:
    """Export a SQL query result as a downloadable CSV file.

    Use when the user wants to download, export, or save data as a file.
    Write `sql` to scope exactly what to export (apply any filters the user
    specified). The user will see a Download button in the chat.

    Args:
        ctx: Run context.
        sql: SELECT query whose results to export. Apply any filters the user mentioned.
        filename: Suggested filename for the download (include .csv extension).

    Returns:
        Confirmation with row count.
    """
    deps = ctx.context
    cache_str = ""
    async with tool_span(
        deps,
        "download_data",
        cache_str,
        "Preparing download\u2026",
        {"sql": sql_fingerprint(sql.strip()), "filename": filename},
    ) as (_tracer, _span, _cached):
        if not deps.has_data:
            return deps.no_data_error()

        sql_stripped = sql.strip().rstrip(";")
        sql_err = check_sql_safety(sql_stripped)
        if sql_err:
            return _safe_json({"error": sql_err})
        if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
            return _safe_json({"error": "Only SELECT statements are permitted."})
        sql_stripped = _apply_agent_scope(sql_stripped, deps.agent_name)

        safe_filename = filename if filename.endswith(".csv") else f"{filename}.csv"

        # Get row count without persisting a table
        try:
            row_count = await anyio.to_thread.run_sync(
                lambda: deps.store.query_value(f"SELECT COUNT(*) FROM ({sql_stripped}) __q") or 0,
                limiter=deps.store.query_limiter,
            )
        except Exception as exc:
            return _safe_json({"error": f"Failed to count rows: {exc}"})

        deps.sql_executed_this_turn = True
        deps.turn_sql = sql_stripped

        # Pass SQL + filename to the frontend — it POSTs to /api/store/export
        deps.download_spec = {
            "export_sql": sql_stripped,
            "filename": safe_filename,
            "row_count": int(row_count),
        }

        await deps.thought_stream.emit_observation(
            f"Download ready — {int(row_count):,} rows",
            tool_name="download_data",
        )

        _tracer.add_trace("info", "tool_complete", metadata={"row_count": int(row_count)})
        out = _safe_json(
            {"status": "ready", "row_count": int(row_count), "filename": safe_filename}
        )
        _span.set_output(out)
        return out


@ft
async def describe_metric_signals(
    ctx: RunContextWrapper[OAIContext],
    metric_name: str,
) -> str:
    """Get the detailed JSON field schema for the signals column for a specific metric.

    Call this BEFORE writing SQL that filters, groups, or extracts sub-fields
    from the signals JSON column in monitoring_data.  Returns field paths,
    types, allowed values, and ready-to-use DuckDB extraction examples.

    Args:
        ctx: Run context.
        metric_name: The exact metric_name value as it appears in monitoring_data.
                     Check the schema context or use summarize_data to see available metric names.

    Returns:
        Formatted schema string with field paths, types, values, and SQL examples.
    """
    deps = ctx.context
    cache_str = metric_name
    async with tool_span(
        deps,
        "describe_metric_signals",
        cache_str,
        f"Loading signal schema for '{metric_name}'...",
        {"metric_name": metric_name},
    ) as (_tracer, _span, cached):
        if cached:
            return cached

        from app.copilot.signal_schemas import get_signal_schema_store

        result = get_signal_schema_store().format_for_prompt(metric_name)
        await deps.thought_stream.emit_observation(
            f"Loaded signal schema for '{metric_name}'",
            tool_name="describe_metric_signals",
        )
        deps.set_cached("describe_metric_signals", metric_name, result)
        _span.set_output(result[:200])
        return result


@ft
async def recall_memory(ctx: RunContextWrapper[OAIContext]) -> str:
    """Recall learned SQL patterns and column usage from past sessions.

    Call this before writing complex SQL to see what query patterns have
    worked previously for this dataset. Returns successful SQL patterns,
    frequently queried columns, and known error fixes.

    Args:
        ctx: Run context.

    Returns:
        Formatted memory with patterns, column frequency, and fixes.
    """
    deps = ctx.context
    async with tool_span(
        deps,
        "recall_memory",
        "",
        "Recalling session memory...",
        {},
    ) as (_tracer, _span, _cached):
        from app.copilot.memory import get_copilot_memory_store, schema_fingerprint

        store = deps.store
        table = deps.table_name
        schema_fp = schema_fingerprint(store, table)

        result = get_copilot_memory_store().get_full_memory(
            table, schema_fp, agent_name=deps.agent_name
        )
        await deps.thought_stream.emit_observation(
            "Session memory loaded",
            tool_name="recall_memory",
        )
        _span.set_output(result[:200])
        return result


COPILOT_TOOLS: list[FunctionTool] = [
    summarize_data,
    query_data,
    analyze_data,
    compare_data,
    query_kpi_data,
    run_sql,
    plot_data,
    analyze_patterns,
    save_as_dataset,
    download_data,
    describe_metric_signals,
    recall_memory,
]

SYSTEM_PROMPT = compose_system_prompt()


# Prepended to the compact schemas of the non-selected live datasets so the
# model treats them as queryable fallbacks, not the primary focus.
SECONDARY_LIVE_SCHEMA_HEADER = (
    "-- OTHER LIVE DATASETS (loaded and queryable via run_sql; prefer the primary table\n"
    "-- above — use these only when the question needs their columns, e.g. sentiment /\n"
    "-- human review → human_signals_cases, business KPIs → kpi_data):"
)


async def _build_secondary_live_schemas(store: Any, primary_table: str) -> str:
    """Compact DDL for every *other* loaded live dataset.

    The selected dataset gets the full schema (numeric ranges + per-column
    stats); the remaining live tables get a column-name/type catalog only —
    enough for the model to know they exist and write ``run_sql`` against them,
    without the extra per-table aggregation queries. Tables that aren't loaded
    are skipped. This is what lets a sentiment question be answered from
    ``human_signals_cases`` while ``monitoring`` is the selected dataset.
    """
    from app.services.duckdb_store import get_live_dataset_tables

    blocks: list[str] = []
    for label, t in get_live_dataset_tables():
        if t == primary_table:
            continue
        if not await anyio.to_thread.run_sync(
            lambda t=t: store.has_table(t), limiter=store.query_limiter
        ):
            continue
        try:
            meta_t = await anyio.to_thread.run_sync(
                lambda t=t: store.get_metadata(t), limiter=store.query_limiter
            )
        except Exception:
            continue
        blocks.append(_build_schema_ddl(t, label, meta_t, {}, None))

    if not blocks:
        return ""
    return SECONDARY_LIVE_SCHEMA_HEADER + "\n" + "\n\n".join(blocks)


async def _build_schema_context(oai_ctx: "OAIContext") -> str:
    """Build a column catalog string to prepend to the user message.

    Mirrors the _dataset_context dynamic system prompt in CopilotAgent so the
    OAI agent has the same column-level awareness without pydantic-ai's
    per-call system_prompt hook.
    """
    store = oai_ctx.store
    # Surface the other live datasets even when the selected one is empty, so a
    # question that belongs to a different live table still gets answered.
    secondary = await _build_secondary_live_schemas(store, oai_ctx.table_name)

    if not oai_ctx.has_data:
        note = f"Note: No {oai_ctx.dataset_label} data is loaded in DuckDB yet.\n"
        return f"{note}\n{secondary}\n" if secondary else note

    table = oai_ctx.table_name
    try:
        meta = await anyio.to_thread.run_sync(
            lambda: store.get_metadata(table), limiter=store.query_limiter
        )
    except Exception:
        return ""

    all_cols: list[dict[str, Any]] = meta.get("columns", [])

    num_cols = [c for c in all_cols if _is_numeric(c)][:12]
    num_ranges: dict[str, tuple[Any, Any]] = {}
    if num_cols:
        agg_parts = [
            f'MIN(CAST("{c["column_name"]}" AS DOUBLE)) AS "{c["column_name"]}_mn", '
            f'MAX(CAST("{c["column_name"]}" AS DOUBLE)) AS "{c["column_name"]}_mx"'
            for c in num_cols
        ]
        try:
            rows = await anyio.to_thread.run_sync(
                lambda: store.query_list(f"SELECT {', '.join(agg_parts)} FROM {table}"),
                limiter=store.query_limiter,
            )
            if rows:
                for c in num_cols:
                    n = c["column_name"]
                    num_ranges[n] = (rows[0].get(f"{n}_mn"), rows[0].get(f"{n}_mx"))
        except Exception:
            pass

    # Compute per-column stats (cardinality, null%)
    row_count = meta.get("row_count", 0)
    col_stats = await anyio.to_thread.run_sync(
        lambda: _compute_column_stats(
            store, table, all_cols, int(row_count) if isinstance(row_count, int) else 0
        ),
        limiter=store.query_limiter,
    )

    ddl = _build_schema_ddl(table, oai_ctx.dataset_label, meta, num_ranges, col_stats)

    # Compact schemas for the other loaded live datasets come first so they sit
    # directly under the primary table's DDL.
    extra: list[str] = [secondary] if secondary else []
    from app.copilot.metric_catalog import get_metric_catalog_store
    from app.copilot.schema_hints import get_schema_hints_store

    _hints_injection = get_schema_hints_store().get_injection(table, agent_name=oai_ctx.agent_name)
    if _hints_injection:
        extra.append(_hints_injection)

    # Metric catalog: inject per-metric semantic hints (descriptions, signal payload shape)
    _catalog_metric_names = list(
        (meta.get("filter_values") or {}).get("metric_name", [])
        or (meta.get("filter_values") or {}).get("kpi_name", [])
    )
    _catalog_injection = get_metric_catalog_store().get_injection(
        table, _catalog_metric_names or None
    )
    if _catalog_injection:
        extra.append(_catalog_injection)

    # Cross-session memory: inject learned SQL patterns, column usage, error fixes
    from app.config.env import settings as _settings
    from app.copilot.memory import get_copilot_memory_store, schema_fingerprint

    if _settings.copilot_memory_enabled:
        _mem_injection = get_copilot_memory_store().get_compact_injection(
            table, schema_fingerprint(store, table), agent_name=oai_ctx.agent_name
        )
        if _mem_injection:
            extra.append(_mem_injection)

    if table == "monitoring_data":
        extra.append(
            "-- CONTEXT: This is evaluation data produced by running LLM judge metrics\n"
            "-- against a production AI agent's outputs. Each row = one metric evaluation\n"
            "-- for one agent interaction. Low metric_score means the agent underperformed\n"
            "-- on that metric for that interaction.\n"
            "-- ANALYSIS APPROACH: When asked about patterns in low/high scoring cases,\n"
            "-- report what the DATA shows — counts, distributions, breakdowns by\n"
            "-- metric_name, evaluation_name, source_component, time, and signals sub-fields.\n"
            "-- Do NOT reason about how the metric is designed or implemented.\n"
            "-- For signals sub-fields: call describe_metric_signals(metric_name) first,\n"
            "-- then run_sql with the coercion CTE to get actual grouped counts."
        )

    if oai_ctx.agent_name:
        extra.append(
            f"-- IMPORTANT: Active agent filter — source_name = '{oai_ctx.agent_name}'\n"
            f"-- All queries are automatically scoped; always include this filter in your SQL."
        )
    if oai_ctx.last_sql:
        extra.append(f"-- Last executed SQL (for multi-turn refinement):\n{oai_ctx.last_sql}")
    if oai_ctx.sql_examples_injection:
        extra.append(oai_ctx.sql_examples_injection)

    return ddl + ("\n\n" + "\n\n".join(extra) if extra else "") + "\n"


# ---------------------------------------------------------------------------
# Agent class
# ---------------------------------------------------------------------------


def _build_structured_input(
    message: str,
    conversation_history: list[dict[str, Any]] | None,
) -> str | list[dict[str, str]]:
    """Build structured message input for the OpenAI Agents SDK.

    Returns a plain string for single-turn, or a list of role/content dicts
    preserving conversation structure for multi-turn. This gives the model
    proper role boundaries instead of flattening everything into one string.
    """
    if not conversation_history:
        return message

    messages: list[dict[str, str]] = []
    for m in conversation_history[-6:]:
        if isinstance(m, dict) and "role" in m and "content" in m:
            role = m["role"]
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": m["content"]})

    if not messages:
        return message

    messages.append({"role": "user", "content": message})
    return messages


class OAICopilotAgent:
    """Ask Copilot powered by the OpenAI Agents SDK.

    Parallel implementation to CopilotAgent (pydantic-ai). Both consume the same
    DuckDB tools, ThoughtStream, and CopilotRequest schema; only the agent
    framework differs — enabling a direct side-by-side comparison.
    """

    def __init__(
        self,
        thought_stream: ThoughtStream | None = None,
        llm_provider: LLMProvider | None = None,
    ) -> None:
        """Initialize with optional thought stream and LLM provider."""
        self.thought_stream = thought_stream or ThoughtStream()
        self.llm_provider = llm_provider or LLMProvider()
        self._agent: Agent[OAIContext] | None = None
        self._last_sql: str = ""  # persists between process() calls for multi-turn SQL refinement

    def _get_agent(self) -> Agent[OAIContext]:
        """Create or return the openai-agents Agent (cached for the process lifetime).

        Skills are injected dynamically via a callable ``instructions`` that reads
        ``ctx.context.skills_injection`` at run time — no rebuild needed per request.
        """
        if self._agent is not None:
            return self._agent

        from app.config.env import settings

        # Configure the openai-agents SDK with the right credentials (once).
        api_key = settings.gateway_api_key or settings.openai_api_key
        if api_key:
            from agents import set_default_openai_client
            from openai import AsyncOpenAI

            client_kwargs: dict[str, Any] = {"api_key": api_key}
            if settings.openai_api_base:
                client_kwargs["base_url"] = settings.openai_api_base
            set_default_openai_client(AsyncOpenAI(**client_kwargs), use_for_tracing=False)

        model_name = self.llm_provider.model

        async def _dynamic_instructions(
            ctx: RunContextWrapper[OAIContext],
            _agent: Agent[OAIContext],
        ) -> str:
            return SYSTEM_PROMPT + ctx.context.skills_injection

        self._agent = Agent(
            name="Ask Copilot (OAI)",
            instructions=_dynamic_instructions,
            tools=COPILOT_TOOLS,
            model=model_name,
        )
        return self._agent

    async def process(
        self,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Process a user message and return the agent's response.

        Delegates to ``run_copilot_request()`` which handles guardrails,
        preparation, tracing, and output sanitization.
        """
        result = await run_copilot_request(
            message=message,
            thought_stream=self.thought_stream,
            build_context=self._build_context,
            execute=self._execute,
            dataset_label=dataset_label,
            data_context=data_context,
            conversation_history=conversation_history,
            user_id=user_id,
            agent_name=agent_name,
            provider_label="oai_agents",
            agent_framework="openai_agents",
        )
        return result.response, result.chart_spec, result.download_spec

    def _build_context(
        self,
        prepared: PreparedRequest,
        dataset_label: str | None,
        data_context: dict[str, Any] | None,
        user_id: str | None,
        agent_name: str | None,
    ) -> OAIContext:
        """Construct OAI context from a PreparedRequest."""
        return OAIContext(
            thought_stream=self.thought_stream,
            dataset_label=dataset_label or "evaluation",
            data_context=data_context or {},
            last_sql=self._last_sql,
            sql_examples_injection=prepared.sql_examples_injection,
            skills_injection=prepared.skills_injection,
            user_id=user_id,
            agent_name=agent_name,
        )

    async def _execute(self, prepared: PreparedRequest, ctx: OAIContext) -> str:
        """Run the OAI agent and return raw output.

        Responsible for: schema context, message formatting, framework-specific
        streaming, inner tracer span, and persisting ``last_sql``.
        """
        schema_ctx = await _build_schema_context(ctx)
        current_message = (
            f"<schema>\n{schema_ctx}</schema>\n\n{prepared.message}"
            if schema_ctx
            else prepared.message
        )
        input_data = _build_structured_input(current_message, prepared.conversation_history)

        agent = self._get_agent()
        tracer = get_copilot_tracer()
        # Build rich input for Langfuse — shows system prompt + schema + user message
        prompt_for_trace: list[dict[str, str]] = [
            {"role": "system", "content": (SYSTEM_PROMPT + ctx.skills_injection)[:3000]},
        ]
        if isinstance(input_data, list):
            prompt_for_trace.extend(input_data)
        else:
            prompt_for_trace.append({"role": "user", "content": str(input_data)[:3000]})
        async with tracer.async_span(
            "copilot.agent.execute",
            input=prompt_for_trace,
            model=self.llm_provider.model,
        ) as _span:
            result = Runner.run_streamed(
                agent,
                input=input_data,
                context=ctx,
                hooks=CopilotRunHooks(),
            )
            async for event in result.stream_events():
                if isinstance(event, RunItemStreamEvent) and event.name == "reasoning_item_created":
                    raw = event.item
                    text = getattr(raw, "text", None) or getattr(
                        getattr(raw, "raw_item", None), "text", ""
                    )
                    if text:
                        await ctx.thought_stream.emit_reasoning(text, node_name="OAIAgent")

            output = result.final_output
        if ctx.last_sql:
            self._last_sql = ctx.last_sql
        # Attach token usage so Langfuse can compute cost
        usage = getattr(result, "context_wrapper", None)
        if usage:
            usage = getattr(usage, "usage", None)
        if usage and getattr(usage, "total_tokens", 0) > 0:
            _span.set_attribute(
                "usage",
                {
                    "input": usage.input_tokens or 0,
                    "output": usage.output_tokens or 0,
                    "total": usage.total_tokens or 0,
                },
            )
        _span.set_output(str(output)[:500])
        return output if isinstance(output, str) else str(output)

    @property
    def is_configured(self) -> bool:
        """Check if the agent has a working LLM provider."""
        return LLMProvider.get_default_provider() is not None
