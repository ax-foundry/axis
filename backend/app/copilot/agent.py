import logging
import math
import re
from dataclasses import dataclass
from typing import Any

import anyio
from pydantic_ai import (
    Agent,
    CallToolsNode,
    ModelRequest,
    ModelResponse,
    RunContext,
    TextPart,
    ThinkingPart,
    UserPromptPart,
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

logger = logging.getLogger("axis.copilot.agent")

_NUMERIC_TYPES = frozenset(
    {"DOUBLE", "FLOAT", "INTEGER", "BIGINT", "DECIMAL", "REAL", "HUGEINT", "UBIGINT", "SMALLINT"}
)


_MAX_RESULT_CHARS = 6_000  # Cap individual tool result size sent to LLM

# Backward-compat aliases — internal tools reference underscore-prefixed names
_check_sql_safety = check_sql_safety


def _is_numeric(col_info: dict[str, Any]) -> bool:
    return any(t in col_info.get("column_type", "").upper() for t in _NUMERIC_TYPES)


# Human-readable descriptions for AXIS structural columns that are skipped by
# auto-discovery (free-text / ID fields). Shown in the schema catalog when a
# column has no sampled values or numeric range so the LLM understands the content.
_COLUMN_DESCRIPTIONS: dict[str, str] = {
    # Identifiers
    "dataset_id": "unique record identifier",
    "id": "unique record identifier",
    "case_id": "unique case identifier",
    "trace_id": "observability trace ID for linking to Langfuse / external systems",
    # Input / output text
    "query": "input prompt or test question sent to the LLM",
    "actual_output": "LLM response text",
    "expected_output": "ground truth / reference answer",
    "full_conversation": "full conversation history (multi-turn)",
    "context": "retrieved context passages used for generation",
    # Metric detail
    "explanation": "metric explanation or reasoning text produced by the judge",
    # Timestamps
    "timestamp": "ISO datetime of the record",
    "created_at": "ISO datetime the record was created",
}

# Maps real column names (lowercase) → common user synonyms injected into DDL comments.
# Helps the LLM map natural-language terms to the correct column names.
_COLUMN_SYNONYMS: dict[str, list[str]] = {
    # Scoring
    "metric_score": ["score", "quality", "rating", "value"],
    "metric_name": ["metric", "measure", "indicator"],
    "metric_category": ["category"],
    "metric_type": ["type"],
    # Source / routing
    "source_name": ["agent", "bot", "model", "system", "assistant"],
    "source_component": ["component", "module", "service", "step"],
    "source_type": ["platform", "provider", "integration"],
    "environment": ["env", "deployment", "stage"],
    "evaluation_name": ["experiment", "run", "eval", "batch"],
    # Identity
    "case_id": ["id", "case", "record", "session"],
    "trace_id": ["trace", "span"],
    # Content
    "query": ["question", "input", "prompt", "request"],
    "actual_output": ["output", "response", "answer", "reply", "result"],
    "expected_output": ["expected", "ground_truth", "reference"],
    "explanation": ["reason", "reasoning", "justification"],
    # Time
    "timestamp": ["date", "time", "created_at", "when"],
    # KPI
    "kpi_name": ["kpi", "indicator"],
    "kpi_value": ["value", "kpi_score"],
    "kpi_category": ["kpi_group"],
    # Latency
    "latency": ["latency_ms", "response_time", "duration", "time_ms"],
}


def _parse_sql_error_hint(
    error_msg: str,
    available_columns: list[str],
    table: str,
) -> str:
    """Convert a raw DuckDB exception into an actionable hint for the LLM.

    Detects the most common failure modes (bad column name, bad cast, table
    not found, syntax error) and appends targeted fix instructions so the
    agent can call run_sql again with a corrected query on the next turn.
    """
    msg = str(error_msg)
    hint_parts: list[str] = [f"SQL error: {msg}"]

    msg_lower = msg.lower()

    # ── column not found ────────────────────────────────────────────────────
    col_match = re.search(r'[Cc]olumn[^"\'`]*["\']?`?([A-Za-z_]\w*)["\']?`?', msg)
    if (
        col_match
        or "binder error" in msg_lower
        or ("not found" in msg_lower and "column" in msg_lower)
    ):
        bad_col = col_match.group(1).lower() if col_match else ""
        if bad_col and available_columns:
            # fuzzy: real column contains bad name or bad name contains real column
            suggestions = [
                c for c in available_columns if bad_col in c.lower() or c.lower() in bad_col
            ]
            # also check synonyms: user said synonym, find the real column
            for real_col, synonyms in _COLUMN_SYNONYMS.items():
                if bad_col in synonyms and real_col in available_columns:
                    suggestions.insert(0, real_col)
            suggestions = list(dict.fromkeys(suggestions))[:4]  # dedupe, cap
            if suggestions:
                hint_parts.append(
                    f'Hint: column "{bad_col}" not found. Did you mean: {", ".join(suggestions)}?'
                )
            else:
                hint_parts.append(f"Hint: available columns: {', '.join(available_columns[:25])}")
        elif available_columns:
            hint_parts.append(f"Hint: available columns: {', '.join(available_columns[:25])}")

    # ── type / cast error ───────────────────────────────────────────────────
    elif any(
        k in msg_lower for k in ("cannot cast", "conversion error", "invalid type", "overflow")
    ):
        hint_parts.append(
            "Hint: use TRY_CAST(col AS DOUBLE) to safely cast numeric columns — returns NULL on failure."
        )

    # ── table not found ─────────────────────────────────────────────────────
    elif "table" in msg_lower and any(
        k in msg_lower for k in ("not found", "does not exist", "unknown")
    ):
        hint_parts.append(
            f'Hint: use the exact table name from the schema context — e.g. "{table}".'
        )

    # ── syntax error ────────────────────────────────────────────────────────
    elif any(k in msg_lower for k in ("syntax error", "parser error", "unexpected token")):
        hint_parts.append(
            "Hint: check SQL syntax — double-quote column names with spaces/capitals, "
            "no trailing semicolon, balanced parentheses."
        )

    hint_parts.append("Rewrite the SQL and call run_sql again.")
    return " | ".join(hint_parts)


def _attempt_sql_fix(sql: str, error_msg: str, available_columns: list[str]) -> str | None:
    """Try to auto-correct a failed SQL query based on the error message.

    Handles column-not-found (fuzzy match) and type/cast errors (TRY_CAST).
    Returns the corrected SQL string, or ``None`` if no automatic fix is possible.
    """
    msg_lower = error_msg.lower()

    # ── Column not found — try to replace bad column with best match ───────
    col_match = re.search(r'[Cc]olumn[^"\'`]*["\']?`?([A-Za-z_]\w*)["\']?`?', error_msg)
    if col_match or ("binder error" in msg_lower and "not found" in msg_lower):
        bad_col = col_match.group(1) if col_match else None
        if bad_col:
            # Find best match: exact case-insensitive, then substring
            best: str | None = None
            for c in available_columns:
                if c.lower() == bad_col.lower():
                    best = c
                    break
            if not best:
                for c in available_columns:
                    if bad_col.lower() in c.lower():
                        best = c
                        break
            if not best:
                # Check synonyms
                for real_col, syns in _COLUMN_SYNONYMS.items():
                    if bad_col.lower() in syns and real_col in available_columns:
                        best = real_col
                        break
            if best and best != bad_col:
                # Replace in SQL — handle both quoted and unquoted references
                fixed = re.sub(
                    rf'(?<!")(?<!\w){re.escape(bad_col)}(?!\w)(?!")',
                    f'"{best}"',
                    sql,
                )
                # Also handle already-quoted references
                fixed = fixed.replace(f'"{bad_col}"', f'"{best}"')
                if fixed != sql:
                    return fixed

    # ── Type/cast error — wrap in TRY_CAST ─────────────────────────────────
    if any(k in msg_lower for k in ("cannot cast", "conversion error", "invalid type")):
        col_match2 = re.search(r'"(\w+)"', error_msg)
        if col_match2:
            col = col_match2.group(1)
            # Replace CAST("col" AS DOUBLE) with TRY_CAST("col" AS DOUBLE)
            fixed = sql.replace(f'CAST("{col}"', f'TRY_CAST("{col}"')
            # Also handle bare column references in AVG/SUM etc
            if fixed == sql:
                fixed = re.sub(
                    rf'AVG\("{re.escape(col)}"\)',
                    f'AVG(TRY_CAST("{col}" AS DOUBLE))',
                    sql,
                )
            if fixed != sql:
                return fixed

    return None


def _describe_sql_fix(before: str, after: str) -> str:
    """Return a concise human-readable description of what changed between two SQL strings."""
    # Find first differing token to give a focused description
    b_tokens = before.split()
    a_tokens = after.split()
    changes: list[str] = []
    for bt, at in zip(b_tokens, a_tokens, strict=False):
        if bt != at:
            # Strip quotes for readability
            bt_clean = bt.strip('"').strip("'").rstrip(",")
            at_clean = at.strip('"').strip("'").rstrip(",")
            changes.append(f"{bt_clean} \u2192 {at_clean}")
            if len(changes) >= 2:
                break
    if changes:
        return ", ".join(changes)
    # Fallback: length-based description
    return f"rewritten ({len(before)} \u2192 {len(after)} chars)"


_KNOWN_TABLES = frozenset({"monitoring_data", "eval_data", "human_signals_cases", "kpi_data"})


def _agent_where(agent_name: str | None) -> str:
    """Return a SQL WHERE clause fragment for source_name filtering, or empty string."""
    if not agent_name:
        return ""
    safe = agent_name.replace("'", "''")
    return f" WHERE source_name = '{safe}'"


def _apply_agent_scope(sql: str, agent_name: str | None) -> str:
    """Rewrite bare table references to scoped subqueries filtered by source_name.

    Replaces known table names with ``(SELECT * FROM tbl WHERE source_name = '<agent>') tbl``
    so that aggregations and column projections in LLM-generated SQL remain correct.
    """
    if not agent_name:
        return sql
    safe = agent_name.replace("'", "''")
    result = sql
    for table in _KNOWN_TABLES:
        result = re.sub(
            rf"\b{re.escape(table)}\b",
            f"(SELECT * FROM {table} WHERE source_name = '{safe}') {table}",
            result,
            flags=re.IGNORECASE,
        )
    return result


def _truncate_result(s: str, max_chars: int = _MAX_RESULT_CHARS) -> str:
    """Trim a JSON result string so it never blows up the LLM context."""
    if len(s) <= max_chars:
        return s
    truncated = s[:max_chars]
    omitted = len(s) - max_chars
    return truncated + f'… [truncated, {omitted} chars omitted]"}}'


def _trim_filter_values(
    fv: dict[str, Any], max_cols: int = 8, max_vals: int = 15
) -> dict[str, Any]:
    """Return a pruned filter_values dict to avoid huge token counts."""
    trimmed: dict[str, Any] = {}
    for col, vals in list(fv.items())[:max_cols]:
        if isinstance(vals, list) and len(vals) > max_vals:
            trimmed[col] = [*vals[:max_vals], f"… +{len(vals) - max_vals} more"]
        else:
            trimmed[col] = vals
    skipped = len(fv) - max_cols
    if skipped > 0:
        trimmed["__note__"] = f"{skipped} more columns omitted"
    return trimmed


def _compute_column_stats(
    store: Any,
    table: str,
    columns: list[dict[str, Any]],
    row_count: int,
) -> dict[str, dict[str, int]]:
    """Compute NULL% and approximate cardinality for each column in one query.

    Uses ``APPROX_COUNT_DISTINCT`` (HyperLogLog) instead of exact ``COUNT(DISTINCT)``
    because exact counts on 50 columns with high-cardinality text fields can be slow.
    The LLM only needs order-of-magnitude cardinality, not exact numbers.
    """
    if not columns or row_count == 0:
        return {}

    # Cap to first 50 columns (matching the DDL cap)
    cols = columns[:50]
    parts: list[str] = []
    for c in cols:
        name = c["column_name"]
        parts.append(f'APPROX_COUNT_DISTINCT("{name}") AS "{name}__uniq"')
        parts.append(f'COUNT(*) FILTER (WHERE "{name}" IS NULL) AS "{name}__nulls"')

    sql = f"SELECT {', '.join(parts)} FROM {table}"
    try:
        rows = store.query_list(sql)
    except Exception:
        return {}

    if not rows:
        return {}

    row = rows[0]
    stats: dict[str, dict[str, int]] = {}
    for c in cols:
        name = c["column_name"]
        n_unique = row.get(f"{name}__uniq", 0) or 0
        n_nulls = row.get(f"{name}__nulls", 0) or 0
        null_pct = round(100 * n_nulls / row_count) if row_count > 0 else 0
        stats[name] = {"n_unique": int(n_unique), "null_pct": int(null_pct)}

    return stats


def _build_schema_ddl(
    table: str,
    dataset_label: str,
    meta: dict[str, Any],
    num_ranges: dict[str, tuple[Any, Any]],
    column_stats: dict[str, dict[str, int]] | None = None,
) -> str:
    """Render schema context as a DDL CREATE TABLE with inline annotations.

    DDL format matches LLM training data — models pattern-match CREATE TABLE
    statements far better than custom catalog formats, improving SQL accuracy.
    Includes row count, time range, sampled values, numeric ranges, and
    structural column descriptions as inline comments.
    """
    all_cols: list[dict[str, Any]] = meta.get("columns", [])
    filter_values: dict[str, Any] = meta.get("filter_values", {})
    row_count = meta.get("row_count", "?")
    time_range: dict[str, str] | None = meta.get("time_range")

    header_parts: list[str] = [
        f"{row_count:,} rows" if isinstance(row_count, int) else f"{row_count} rows"
    ]
    if time_range:
        mn = str(time_range.get("min", ""))[:10]
        mx = str(time_range.get("max", ""))[:10]
        if mn and mx:
            header_parts.append(f"{mn} → {mx}")

    lines: list[str] = [
        f"\nDataset: {dataset_label}",
        f'CREATE TABLE {table} (  -- {" | ".join(header_parts)}',
    ]

    # For the derived human-signals table, explain the column naming convention so the
    # agent knows how to filter and group by metric vs signal key.
    if table == "human_signals_cases":
        lines.insert(
            1,
            (
                "-- Schema note: columns named {metric}__{signal} are flattened from a JSON\n"
                "-- 'signals' blob. The prefix before '__' is the metric_name; the suffix is the\n"
                "-- signal key within that metric.\n"
                "--\n"
                "-- DATA TYPES: Signal values are stored as VARCHAR. They may contain:\n"
                "--   - Plain strings: 'billing inquiry'\n"
                '--   - JSON arrays: \'["billing", "account access"]\'  (use json_extract)\n'
                '--   - JSON objects: \'{"key": "value"}\'  (use json_extract_string)\n'
                "--   - Booleans/numbers stored as text: 'true', '42'\n"
                "--\n"
                "-- For JSON array columns, to count individual values:\n"
                "--   SELECT val, COUNT(*) FROM (\n"
                "--     SELECT json_extract_string(TRY_CAST(col AS JSON), '$[' || i || ']') AS val\n"
                "--     FROM human_signals_cases,\n"
                "--          generate_series(0, CAST(json_array_length(TRY_CAST(col AS JSON)) AS BIGINT) - 1) AS t(i)\n"
                "--     WHERE json_array_length(TRY_CAST(col AS JSON)) > 0\n"
                "--   ) GROUP BY val ORDER BY COUNT(*) DESC\n"
                "--\n"
                "-- For simple string columns, use GROUP BY directly.\n"
                "-- Full_Conversation is a JSON array of chat messages — not suitable for SQL filtering."
            ),
        )

    for col in all_cols[:50]:
        col_name = col["column_name"]
        col_type = col.get("column_type", "VARCHAR")

        if _is_numeric(col) and col_name in num_ranges:
            mn, mx = num_ranges[col_name]
            comment = f"range: {mn} → {mx}"
        elif col_name in filter_values:
            vals = filter_values[col_name]
            if isinstance(vals, list):
                sample = ", ".join(str(v) for v in vals[:8])
                suffix = " …" if len(vals) > 8 else ""
                comment = f"values: {sample}{suffix}"
            else:
                comment = str(vals)
        else:
            comment = _COLUMN_DESCRIPTIONS.get(col_name.lower(), "")

        # Append synonym aliases so the LLM maps natural-language terms → exact column names
        synonyms = _COLUMN_SYNONYMS.get(col_name.lower())
        if synonyms:
            alias_str = f"alias: {', '.join(synonyms)}"
            comment = f"{comment} | {alias_str}" if comment else alias_str

        # Prepend column statistics (cardinality, null%) when available
        col_stat = column_stats.get(col_name) if column_stats else None
        if col_stat:
            stats_parts: list[str] = []
            if col_stat["n_unique"] > 0:
                stats_parts.append(f"{col_stat['n_unique']} unique")
            if col_stat["null_pct"] > 0:
                stats_parts.append(f"{col_stat['null_pct']}% null")
            elif col_stat["null_pct"] == 0:
                stats_parts.append("0% null")
            stats_prefix = ", ".join(stats_parts)
            if stats_prefix and comment:
                comment = f"{stats_prefix} | {comment}"
            elif stats_prefix:
                comment = stats_prefix

        line = f'    "{col_name}" {col_type},'
        if comment:
            line += f"  -- {comment}"
        lines.append(line)

    if len(all_cols) > 50:
        lines.append(f"    -- … +{len(all_cols) - 50} more columns")

    lines.append(");")

    sample_sql = _build_sample_sql(table, all_cols, filter_values)
    if sample_sql:
        lines.append(sample_sql)

    return "\n".join(lines)


def _build_sample_sql(
    table: str,
    all_cols: list[dict[str, Any]],
    filter_values: dict[str, Any],
) -> str:
    """Generate table-specific example queries illustrating DuckDB syntax.

    Called at prompt-build time so examples always reflect the live schema.
    Capped at 3 examples to keep token cost low.
    """
    col_names = {c["column_name"] for c in all_cols}
    num_cols = [c["column_name"] for c in all_cols if _is_numeric(c)]
    # Low-cardinality string columns useful for GROUP BY
    cat_cols = [c for c in filter_values if c in col_names and c not in num_cols]
    has_ts = "timestamp" in col_names

    examples: list[str] = []

    # 1. Always: basic fetch with timestamp sort if available
    order = 'ORDER BY "timestamp" DESC ' if has_ts else ""
    examples.append(f"SELECT * FROM {table} {order}LIMIT 10")

    # 2. Time-series aggregation when timestamp + numeric column exist
    if has_ts and num_cols:
        num = num_cols[0]
        examples.append(
            f"SELECT DATE_TRUNC('week', CAST(\"timestamp\" AS TIMESTAMP)) AS week,\n"
            f'       AVG(TRY_CAST("{num}" AS DOUBLE)) AS avg_{num}\n'
            f"FROM {table}\n"
            f"GROUP BY week ORDER BY week"
        )

    # 3. Group-by aggregation when categorical + numeric columns exist
    if cat_cols and num_cols:
        cat, num = cat_cols[0], num_cols[0]
        examples.append(
            f'SELECT "{cat}",\n'
            f'       AVG(TRY_CAST("{num}" AS DOUBLE)) AS avg_{num},\n'
            f"       COUNT(*) AS n\n"
            f"FROM {table}\n"
            f'GROUP BY "{cat}" ORDER BY avg_{num} DESC'
        )
    elif cat_cols:
        # Fallback: count by category when no numeric col
        cat = cat_cols[0]
        examples.append(
            f'SELECT "{cat}", COUNT(*) AS n\n' f"FROM {table}\n" f'GROUP BY "{cat}" ORDER BY n DESC'
        )

    if not examples:
        return ""

    lines = ["\nSample queries (always double-quote column names in DuckDB):"]
    for ex in examples[:3]:
        lines.append("  -- " + ex.replace("\n", "\n  "))
    return "\n".join(lines)


@dataclass
class CopilotDeps(BaseCopilotContext):
    """Pydantic-AI copilot dependencies — inherits all shared fields from BaseCopilotContext."""


def _build_message_history(history: list[dict[str, Any]]) -> list[Any]:
    """Convert frontend conversation history dicts to pydantic-ai ModelMessage objects."""
    messages: list[Any] = []
    for turn in history:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if not content:
            continue
        if role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=content)]))
        elif role == "assistant":
            messages.append(ModelResponse(parts=[TextPart(content=content)]))
    return messages


class CopilotAgent:
    """Ask AXIS — DuckDB-first AI assistant for data analysis.

    Tools query DuckDB directly via SQL — no large JSON payloads.
    """

    def __init__(
        self,
        thought_stream: ThoughtStream | None = None,
        llm_provider: LLMProvider | None = None,
    ) -> None:
        """Initialize with optional thought stream and LLM provider."""
        self.thought_stream = thought_stream or ThoughtStream()
        self.llm_provider = llm_provider or LLMProvider()
        self._agent: Agent[CopilotDeps, str] | None = None
        self._last_sql: str = ""  # persists between process() calls for multi-turn SQL refinement

    def _get_agent(self) -> Agent[CopilotDeps, str]:
        """Create or return the pydantic-ai agent with DuckDB tools."""
        if self._agent is not None:
            return self._agent

        model = self.llm_provider._get_model()

        self._agent = Agent(
            model,
            deps_type=CopilotDeps,
            system_prompt=compose_system_prompt(),
        )

        @self._agent.system_prompt
        def _dataset_context(ctx: RunContext[CopilotDeps]) -> str:
            """Inject DDL-style schema context so the agent knows types and sample values."""
            deps = ctx.deps
            if not deps.has_data:
                return f"\nNote: No {deps.dataset_label} data is loaded in DuckDB yet."
            store = deps.store
            table = deps.table_name
            meta = store.get_metadata(table)
            all_cols = meta.get("columns", [])

            # One batched query for all numeric column ranges
            num_cols = [c for c in all_cols if _is_numeric(c)][:12]
            num_ranges: dict[str, tuple[Any, Any]] = {}
            if num_cols:
                agg_parts = [
                    f'MIN(CAST("{c["column_name"]}" AS DOUBLE)) AS "{c["column_name"]}_mn", '
                    f'MAX(CAST("{c["column_name"]}" AS DOUBLE)) AS "{c["column_name"]}_mx"'
                    for c in num_cols
                ]
                try:
                    row = store.query_list(f"SELECT {', '.join(agg_parts)} FROM {table}")
                    if row:
                        for c in num_cols:
                            n = c["column_name"]
                            num_ranges[n] = (row[0].get(f"{n}_mn"), row[0].get(f"{n}_mx"))
                except Exception:
                    pass

            # Compute per-column stats (cardinality, null%)
            row_count = meta.get("row_count", 0)
            col_stats = _compute_column_stats(
                store, table, all_cols, int(row_count) if isinstance(row_count, int) else 0
            )

            ddl = _build_schema_ddl(table, deps.dataset_label, meta, num_ranges, col_stats)

            extra: list[str] = []
            from app.copilot.metric_catalog import get_metric_catalog_store
            from app.copilot.schema_hints import get_schema_hints_store

            _hints_injection = get_schema_hints_store().get_injection(
                table, agent_name=deps.agent_name
            )
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
                    table, schema_fingerprint(store, table), agent_name=deps.agent_name
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

            if deps.agent_name:
                extra.append(
                    f"-- IMPORTANT: Active agent filter — source_name = '{deps.agent_name}'\n"
                    f"-- All queries are automatically scoped; always include this filter in your SQL."
                )
            if deps.last_sql:
                extra.append(f"-- Last executed SQL (for multi-turn refinement):\n{deps.last_sql}")
            if deps.sql_examples_injection:
                extra.append(deps.sql_examples_injection)
            if deps.user_id:
                extra.append(
                    f"-- Current user: {deps.user_id}\n"
                    f"-- To list only this user's saved datasets query:\n"
                    f"--   SELECT dataset_id, name, table_name, row_count, created_at\n"
                    f"--   FROM axis_datasets WHERE user_id = '{deps.user_id}' ORDER BY created_at DESC"
                )

            return ddl + ("\n\n" + "\n\n".join(extra) if extra else "")

        @self._agent.system_prompt
        def _skill_context(ctx: RunContext[CopilotDeps]) -> str:
            """Inject pre-selected skill bodies into the system prompt."""
            return ctx.deps.skills_injection

        self._register_tools()
        return self._agent

    def _register_tools(self) -> None:
        """Register all DuckDB-powered tools on the agent."""
        agent = self._agent

        @agent.tool
        async def summarize_data(
            ctx: RunContext[CopilotDeps],
            include_numeric_stats: bool = True,
        ) -> str:
            """Generate a summary of the dataset: schema, row count, filter values, and stats.

            Args:
                ctx: Run context.
                include_numeric_stats: Whether to compute per-column min/avg/max.

            Returns:
                JSON with dataset overview.
            """
            deps = ctx.deps
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

                all_cols = meta.get("columns", [])
                result: dict[str, Any] = {
                    "dataset": deps.dataset_label,
                    "table": table,
                    "row_count": meta.get("row_count", 0),
                    # Return column names + types only (skip per-column stats to save tokens)
                    "columns": [
                        {"name": c["column_name"], "type": c.get("column_type", "")}
                        for c in all_cols
                    ],
                    "filter_values": _trim_filter_values(meta.get("filter_values", {})),
                }
                if meta.get("time_range"):
                    result["time_range"] = meta["time_range"]

                if include_numeric_stats:
                    num_cols = [
                        c["column_name"] for c in meta.get("columns", []) if _is_numeric(c)
                    ][:8]
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

        @agent.tool
        async def query_data(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            cache_str = (
                f"query:{filter_column}:{filter_value}:{find_min_column}"
                f":{find_max_column}:{search_text}:{limit}"
            )
            async with tool_span(
                deps,
                "query_data",
                cache_str,
                "Querying data...",
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

        @agent.tool
        async def analyze_data(
            ctx: RunContext[CopilotDeps],
            columns: list[str] | None = None,
        ) -> str:
            """Compute statistics (avg, min, max, std, quartiles) for numeric columns via SQL.

            Args:
                ctx: Run context.
                columns: Specific columns to analyze. Analyzes all numeric columns if omitted.

            Returns:
                JSON with per-column distribution statistics and insights.
            """
            deps = ctx.deps
            cache_str = f"analyze:{sorted(columns) if columns else 'all'}"
            async with tool_span(
                deps,
                "analyze_data",
                cache_str,
                "Analyzing data statistics...",
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

                sql = (
                    f"SELECT {', '.join(agg_parts)} FROM {table}" f"{_agent_where(deps.agent_name)}"
                )
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

        @agent.tool
        async def compare_data(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            cache_str = f"compare:{group_by}:{metric_column}"
            async with tool_span(
                deps,
                "compare_data",
                cache_str,
                f"Comparing by {group_by}...",
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

        @agent.tool
        async def query_kpi_data(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
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

        @agent.tool
        async def plot_data(
            ctx: RunContext[CopilotDeps],
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
                    Example: [{"type": "scatter", "mode": "lines+markers",
                               "x": "day", "y": "avg_score", "name": "Step Reliability",
                               "line": {"color": "#3D5A80", "width": 2}}]
                layout: Full Plotly layout dict -- title, xaxis, yaxis, margins, annotations,
                    colors, legend, etc. Merged on top of sensible defaults (transparent bg,
                    Inter font, subtle grid). To set Y axis range 0-1 pass:
                    {"yaxis": {"range": [0, 1]}}.
                    Example: {"title": {"text": "Score Trend"},
                               "yaxis": {"range": [0, 1], "title": "avg score"},
                               "xaxis": {"title": "day"}}

            Returns:
                Confirmation that the chart was created.
            """
            deps = ctx.deps
            _title_raw = (layout or {}).get("title", {})
            title_text: str = (
                _title_raw.get("text", "chart")
                if isinstance(_title_raw, dict)
                else _title_raw or "chart"
            )
            async with tool_span(
                deps,
                "plot_data",
                "",
                f"Building chart: {title_text}",
                {
                    "sql": sql_fingerprint(sql.strip()),
                    "layout_title": title_text,
                },
            ) as (_tracer, _span, _cached):
                if not deps.has_data:
                    return deps.no_data_error()

                sql_stripped = sql.strip().rstrip(";")
                sql_err = _check_sql_safety(sql_stripped)
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

                # Resolve column name strings → data arrays in each trace
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
                                    {
                                        "error": (
                                            f"Column '{t[axis]}' not found. "
                                            f"Available: {available}"
                                        )
                                    }
                                )
                    resolved_traces.append(t)

                # Default layout — agent's layout is deep-merged on top
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

                # Deep merge: agent's layout overrides defaults at each nested key
                def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
                    out = dict(base)
                    for k, v in override.items():
                        if isinstance(v, dict) and isinstance(out.get(k), dict):
                            out[k] = _merge(out[k], v)
                        else:
                            out[k] = v
                    return out

                merged_layout = _merge(default_layout, layout or {})

                deps.chart_spec = {"data": resolved_traces, "layout": merged_layout}

                n_points = len(rows)
                await deps.thought_stream.emit_observation(
                    f"Chart ready: {title_text} ({n_points} points, {len(resolved_traces)} series)",
                    tool_name="plot_data",
                )
                _tracer.add_trace("info", "tool_complete", metadata={"result_len": n_points})
                out = (
                    f"Chart created: '{title_text}' — {n_points} data points, "
                    f"{len(resolved_traces)} series."
                )
                _span.set_output(out[:200] if len(out) > 200 else out)
                return out

        @agent.tool
        async def analyze_patterns(
            ctx: RunContext[CopilotDeps],
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

            deps = ctx.deps
            async with tool_span(
                deps,
                "analyze_patterns",
                "",
                "Analyzing patterns...",
                {
                    "sql": sql_fingerprint(sql.strip()),
                    "mode": mode,
                    "report_type": report_type,
                },
            ) as (_tracer, _span, _cached):
                if not deps.has_data:
                    return deps.no_data_error()

                sql_stripped = sql.strip().rstrip(";")
                sql_err = _check_sql_safety(sql_stripped)
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

                cache_key = f"analyze_patterns:{hash(sql)}:{mode}:{report_type}:{metric_filter}"
                deps._cache[cache_key] = _safe_json(result)

                out = _truncate_result(_safe_json(result))
                _span.set_output(out[:200] if len(out) > 200 else out)
                return out

        @agent.tool
        async def save_as_dataset(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            async with tool_span(
                deps,
                "save_as_dataset",
                "",
                f"Saving dataset: {name}",
                {"sql": sql_fingerprint(sql.strip()), "name": name},
            ) as (_tracer, _span, _cached):
                if not deps.has_data:
                    return deps.no_data_error()

                sql_stripped = sql.strip().rstrip(";")
                sql_err = _check_sql_safety(sql_stripped)
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
                    f"Dataset '{name}' saved — {result['row_count']} rows"
                    f" (id: {result['dataset_id']})",
                    tool_name="save_as_dataset",
                )

                out = _safe_json(result)
                _span.set_output(out[:200] if len(out) > 200 else out)
                return out

        @agent.tool
        async def download_data(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            async with tool_span(
                deps,
                "download_data",
                sql,
                "Preparing download…",
                {"sql": sql_fingerprint(sql.strip()), "filename": filename},
            ) as (_tracer, _span, _cached):
                if not deps.has_data:
                    return deps.no_data_error()

                sql_stripped = sql.strip().rstrip(";")
                sql_err = _check_sql_safety(sql_stripped)
                if sql_err:
                    return _safe_json({"error": sql_err})
                if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
                    return _safe_json({"error": "Only SELECT statements are permitted."})
                sql_stripped = _apply_agent_scope(sql_stripped, deps.agent_name)

                safe_filename = filename if filename.endswith(".csv") else f"{filename}.csv"

                # Get row count without persisting a table
                try:
                    row_count = await anyio.to_thread.run_sync(
                        lambda: deps.store.query_value(f"SELECT COUNT(*) FROM ({sql_stripped}) __q")
                        or 0,
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

                out = _safe_json(
                    {"status": "ready", "row_count": int(row_count), "filename": safe_filename}
                )
                _span.set_output(out)
                return out

        @agent.tool
        async def run_sql(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            sql_stripped = sql.strip().rstrip(";")
            async with tool_span(
                deps,
                "run_sql",
                "",
                f"Running SQL: {sql_stripped[:120]}{'…' if len(sql_stripped) > 120 else ''}",
                {"sql": sql_fingerprint(sql.strip()), "limit": limit},
            ) as (_tracer, _span, _cached):
                # Safety: block DDL/DML and non-SELECT statements
                sql_err = _check_sql_safety(sql_stripped)
                if sql_err:
                    return _safe_json({"error": sql_err})
                if not sql_stripped.upper().lstrip().startswith(("SELECT", "WITH")):
                    return _safe_json({"error": "Only SELECT statements are permitted."})

                # Inject LIMIT if missing
                limit_n = min(int(limit), 500)
                sql_upper = sql_stripped.upper()
                if "LIMIT" not in sql_upper:
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
                                # Build a human-readable diff for the thought
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
                        await deps.thought_stream.emit_observation(
                            f"SQL error: {exc}", tool_name="run_sql"
                        )
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

        @agent.tool
        async def describe_metric_signals(
            ctx: RunContext[CopilotDeps],
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
            deps = ctx.deps
            async with tool_span(
                deps,
                "describe_metric_signals",
                metric_name,
                f"Loading signal schema for '{metric_name}'…",
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
                _span.set_output(result[:200])
                return result

        @agent.tool
        async def recall_memory(ctx: RunContext[CopilotDeps]) -> str:
            """Recall learned SQL patterns and column usage from past sessions.

            Call this before writing complex SQL to see what query patterns have
            worked previously for this dataset. Returns successful SQL patterns,
            frequently queried columns, and known error fixes.

            Args:
                ctx: Run context.

            Returns:
                Formatted memory with patterns, column frequency, and fixes.
            """
            deps = ctx.deps
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

    async def process(
        self,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Process a user message using DuckDB-powered tools.

        Delegates to ``run_copilot_request()`` which handles guardrails,
        preparation, tracing, and output sanitization.
        """
        result = await run_copilot_request(
            message=message,
            thought_stream=self.thought_stream,
            build_context=self._build_deps,
            execute=self._execute,
            dataset_label=dataset_label,
            data_context=data_context,
            conversation_history=conversation_history,
            user_id=user_id,
            agent_name=agent_name,
            provider_label="pydantic_ai",
            agent_framework="pydantic_ai",
        )
        return result.response, result.chart_spec, result.download_spec

    def _build_deps(
        self,
        prepared: PreparedRequest,
        dataset_label: str | None,
        data_context: dict[str, Any] | None,
        user_id: str | None,
        agent_name: str | None,
    ) -> CopilotDeps:
        """Construct pydantic-ai CopilotDeps from a PreparedRequest."""
        return CopilotDeps(
            thought_stream=self.thought_stream,
            dataset_label=dataset_label or "evaluation",
            data_context=data_context or {},
            skills_injection=prepared.skills_injection,
            last_sql=self._last_sql,
            sql_examples_injection=prepared.sql_examples_injection,
            user_id=user_id,
            agent_name=agent_name,
        )

    async def _execute(self, prepared: PreparedRequest, deps: CopilotDeps) -> str:
        """Run the pydantic-ai agent and return raw output.

        Responsible for: framework-specific streaming, inner tracer span,
        and persisting ``last_sql`` back to ``self._last_sql``.
        """
        message_history = (
            _build_message_history(prepared.conversation_history)
            if prepared.conversation_history
            else None
        )
        agent = self._get_agent()
        tracer = get_copilot_tracer()
        async with tracer.async_span(
            "copilot.agent.execute",
            input=prepared.message,
            model=self.llm_provider.model,
        ) as _span:
            async with agent.iter(
                prepared.message, deps=deps, message_history=message_history
            ) as agent_run:
                async for node in agent_run:
                    if isinstance(node, CallToolsNode):
                        for part in node.model_response.parts:
                            if isinstance(part, ThinkingPart) and part.thinking:
                                await deps.thought_stream.emit_reasoning(
                                    part.thinking, node_name="Model"
                                )
            result = agent_run.result
        if deps.last_sql:
            self._last_sql = deps.last_sql
        # Attach full prompt context for Langfuse visibility — shows what the LLM
        # actually saw (system prompt + schema DDL + skills + user message)
        try:
            all_msgs = agent_run.all_messages()
            prompt_parts: list[dict[str, str]] = []
            for msg in all_msgs:
                for part in getattr(msg, "parts", []):
                    content = getattr(part, "content", None)
                    if isinstance(content, str) and content.strip():
                        prompt_parts.append(
                            {
                                "role": type(part).__name__,
                                "content": content[:2000],
                            }
                        )
            if prompt_parts:
                _span.set_input(prompt_parts)
        except Exception:
            pass  # best-effort — don't break execution
        # Attach token usage so Langfuse can compute cost
        usage = agent_run.usage
        if usage and usage.has_values:
            _span.set_attribute(
                "usage",
                {
                    "input": usage.input_tokens or 0,
                    "output": usage.output_tokens or 0,
                    "total": usage.total_tokens or 0,
                },
            )
        _span.set_output(str(result.output)[:500])
        return result.output

    @property
    def is_configured(self) -> bool:
        """Check if the agent has a working LLM provider."""
        return LLMProvider.get_default_provider() is not None

    def get_available_tools(self) -> list[dict[str, Any]]:
        """Get information about available tools."""
        return [
            {
                "name": "summarize_data",
                "description": "Overview of the dataset: schema, row count, filter values, stats",
            },
            {
                "name": "query_data",
                "description": "Look up records, find min/max values, filter by column value",
            },
            {
                "name": "analyze_data",
                "description": "Statistical analysis: avg, std, min, max, quartiles per column",
            },
            {
                "name": "compare_data",
                "description": "Compare metrics across groups (GROUP BY)",
            },
            {
                "name": "query_kpi_data",
                "description": "Query KPI data from the kpi_data table",
            },
            {
                "name": "run_sql",
                "description": "Execute custom SELECT SQL — for date grouping, counts, HAVING, window functions, etc.",
            },
            {
                "name": "plot_data",
                "description": "Build an interactive Plotly chart from a SQL query — rendered in the browser",
            },
            {
                "name": "analyze_patterns",
                "description": "LLM-powered pattern detection and improvement recommendations from a SQL-scoped data slice",
            },
            {
                "name": "save_as_dataset",
                "description": "Persist SQL query results as a named dataset for later analysis or evaluation pipeline use",
            },
            {
                "name": "download_data",
                "description": "Export SQL query results as a downloadable CSV file — renders a Download button in the chat",
            },
        ]
