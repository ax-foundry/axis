import json
import logging
from dataclasses import dataclass, field
from typing import Any

import anyio
from pydantic_ai import Agent, RunContext

from app.copilot.llm.provider import LLMProvider
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.agent")

_NUMERIC_TYPES = frozenset(
    {"DOUBLE", "FLOAT", "INTEGER", "BIGINT", "DECIMAL", "REAL", "HUGEINT", "UBIGINT", "SMALLINT"}
)


def _safe_json(obj: Any) -> str:
    """JSON serializer that handles dates and other non-native types."""

    def _default(o: Any) -> Any:
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    return json.dumps(obj, default=_default)


def _is_numeric(col_info: dict[str, Any]) -> bool:
    return any(t in col_info.get("column_type", "").upper() for t in _NUMERIC_TYPES)


@dataclass
class CopilotDeps:
    """Dependencies for copilot tools — DuckDB-powered, no in-memory DataFrames."""

    thought_stream: ThoughtStream
    dataset_label: str = "evaluation"
    data_context: dict[str, Any] = field(default_factory=dict)
    _cache: dict[str, str] = field(default_factory=dict)

    @property
    def table_name(self) -> str:
        """DuckDB table name for the current dataset label."""
        from app.services.duckdb_store import DATASET_TABLE_MAP

        return DATASET_TABLE_MAP.get(self.dataset_label, "eval_data")

    @property
    def store(self):
        """DuckDB store singleton."""
        from app.services.duckdb_store import get_store

        return get_store()

    @property
    def has_data(self) -> bool:
        """True if the dataset table exists in DuckDB."""
        return self.store.has_table(self.table_name)

    def _cache_key(self, tool: str, params: str) -> str:
        """Generate a cache key incorporating table name and current row count."""
        rc = self.store.get_metadata(self.table_name).get("row_count", 0)
        return f"{tool}:{hash(params)}:{self.table_name}:{rc}"

    def get_cached(self, tool: str, params: str) -> str | None:
        """Return cached tool result or None if not cached."""
        return self._cache.get(self._cache_key(tool, params))

    def set_cached(self, tool: str, params: str, result: str) -> None:
        """Store a tool result in the in-session cache."""
        self._cache[self._cache_key(tool, params)] = result

    def no_data_error(self) -> str:
        """Return a standard JSON error message when dataset is not available."""
        return _safe_json(
            {
                "error": (
                    f"No {self.dataset_label} data available. "
                    "Upload a CSV or trigger a sync first."
                )
            }
        )


class CopilotAgent:
    """Ask Echo — DuckDB-first AI assistant for data analysis.

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

    def _get_agent(self) -> Agent[CopilotDeps, str]:
        """Create or return the pydantic-ai agent with DuckDB tools."""
        if self._agent is not None:
            return self._agent

        model = self.llm_provider._get_model()

        self._agent = Agent(
            model,
            deps_type=CopilotDeps,
            system_prompt=(
                "You are Ask Echo, an AI assistant that analyzes data stored in DuckDB. "
                "Always use tools to answer data questions — never fabricate numbers. "
                "Use summarize_data for overviews, query_data for record lookups and filtering, "
                "analyze_data for statistics, compare_data for group comparisons, "
                "and query_kpi_data when the dataset is kpi."
            ),
        )

        @self._agent.system_prompt
        def _dataset_context(ctx: RunContext[CopilotDeps]) -> str:
            deps = ctx.deps
            if not deps.has_data:
                return f"\nNote: No {deps.dataset_label} data is loaded in DuckDB yet."
            meta = deps.store.get_metadata(deps.table_name)
            cols = [c["column_name"] for c in meta.get("columns", [])][:30]
            return (
                f"\nCurrent dataset: {deps.dataset_label} | "
                f"Table: {deps.table_name} | "
                f"Rows: {meta.get('row_count', '?')} | "
                f"Columns: {', '.join(cols)}"
            )

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
            cached = deps.get_cached("summarize_data", cache_str)
            if cached:
                return cached

            await deps.thought_stream.emit_tool_use(
                f"Summarizing {deps.dataset_label} dataset...",
                skill_name="summarize_data",
            )

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
                "columns": meta.get("columns", []),
                "filter_values": meta.get("filter_values", {}),
            }
            if meta.get("time_range"):
                result["time_range"] = meta["time_range"]
            if meta.get("summary_stats"):
                result["summary_stats"] = meta["summary_stats"]

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
                            lambda: store.query_list(f"SELECT {agg} FROM {table}"),
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
                skill_name="summarize_data",
            )
            out = _safe_json(result)
            deps.set_cached("summarize_data", cache_str, out)
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
            cached = deps.get_cached("query_data", cache_str)
            if cached:
                return cached

            await deps.thought_stream.emit_tool_use(
                "Querying data...",
                skill_name="query_data",
            )

            if not deps.has_data:
                return deps.no_data_error()

            store = deps.store
            table = deps.table_name
            available_cols = await anyio.to_thread.run_sync(
                lambda: store.get_table_columns(table), limiter=store.query_limiter
            )

            result: dict[str, Any] = {"table": table}
            conditions: list[str] = []

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
                                f'SELECT * FROM {table} ORDER BY CAST("{col}" AS DOUBLE) ASC NULLS LAST LIMIT 1'
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
                                f'SELECT * FROM {table} ORDER BY CAST("{col}" AS DOUBLE) DESC NULLS LAST LIMIT 1'
                            ),
                            limiter=store.query_limiter,
                        )
                        result["max_record"] = max_row[0] if max_row else None
                    except Exception as exc:
                        logger.debug("Max query failed: %s", exc)

            await deps.thought_stream.emit_observation(
                f"Query returned {result.get('total_matching', 0)} matching records",
                skill_name="query_data",
            )
            out = _safe_json(result)
            deps.set_cached("query_data", cache_str, out)
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
            cached = deps.get_cached("analyze_data", cache_str)
            if cached:
                return cached

            await deps.thought_stream.emit_tool_use(
                "Analyzing data statistics...",
                skill_name="analyze_data",
            )

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

            sql = f"SELECT {', '.join(agg_parts)} FROM {table}"
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
                skill_name="analyze_data",
            )
            out = _safe_json(result)
            deps.set_cached("analyze_data", cache_str, out)
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
            cached = deps.get_cached("compare_data", cache_str)
            if cached:
                return cached

            await deps.thought_stream.emit_tool_use(
                f"Comparing by {group_by}...",
                skill_name="compare_data",
            )

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
                f'SELECT "{group_by}", {", ".join(agg_parts)} FROM {table} '
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
                skill_name="compare_data",
            )
            out = _safe_json(result)
            deps.set_cached("compare_data", cache_str, out)
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
            cached = deps.get_cached("query_kpi_data", cache_str)
            if cached:
                return cached

            await deps.thought_stream.emit_tool_use(
                "Querying KPI data...",
                skill_name="query_kpi_data",
            )

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
                skill_name="query_kpi_data",
            )
            out = _safe_json(result)
            deps.set_cached("query_kpi_data", cache_str, out)
            return out

    async def process(
        self,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> str:
        """Process a user message using DuckDB-powered tools.

        Args:
            message: User's message/query.
            dataset_label: Dataset to query (evaluation, monitoring, human_signals, kpi).
            data_context: Optional schema hints (columns, format, row_count).
            conversation_history: Prior conversation turns for multi-turn context.

        Returns:
            Agent's response string.
        """
        logger.info("Processing: %s... (dataset=%s)", message[:100], dataset_label)

        # Embed conversation history directly in the message
        full_message = message
        if conversation_history:
            history_lines = [
                f"{m['role'].upper()}: {m['content']}"
                for m in conversation_history[-6:]
                if isinstance(m, dict) and "role" in m and "content" in m
            ]
            if history_lines:
                full_message = (
                    "Previous conversation:\n"
                    + "\n".join(history_lines)
                    + f"\n\nCurrent question: {message}"
                )

        deps = CopilotDeps(
            thought_stream=self.thought_stream,
            dataset_label=dataset_label or "evaluation",
            data_context=data_context or {},
        )

        await self.thought_stream.emit_reasoning(
            f"Processing: {message[:100]}...",
            node_name="Agent",
        )

        try:
            agent = self._get_agent()
            result = await agent.run(full_message, deps=deps)
            await self.thought_stream.emit_success("Request completed", node_name="Agent")
            return result.output

        except Exception as e:
            logger.error("Agent error: %s", e, exc_info=True)
            await self.thought_stream.emit_error(f"Error: {e}", node_name="Agent")
            return f"I encountered an error: {e}"

        finally:
            await self.thought_stream.close()

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
        ]
