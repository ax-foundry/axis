"""Schema search tool — DuckDB table/column discovery for the orchestrator.

Gives the orchestrator schema awareness without delegating to the SQL agent.
This is a direct metadata lookup, not a multi-step reasoning task.
"""

from __future__ import annotations

import logging
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from universal_computer.agents.tools import FunctionTool

logger = logging.getLogger(__name__)


class SearchSchemaArgs(BaseModel):
    """Arguments for schema search."""

    query: str = Field(
        default="",
        description="Optional keyword to filter tables/columns (e.g. 'score', 'kpi', 'trigger')",
    )
    include_stats: bool = Field(
        default=True,
        description="Include row counts, time ranges, and column cardinality",
    )


class SearchSchemaTool(FunctionTool[SearchSchemaArgs, str]):
    """Search available database tables, columns, and statistics.

    Use this before delegating to the SQL agent to understand what data
    is available. Returns table names, column names/types, row counts,
    time ranges, and optionally column-level statistics.
    """

    tool_name: ClassVar[str] = "search_schema"
    args_model: ClassVar[type] = SearchSchemaArgs
    description: ClassVar[str] = (
        "Search available database tables and columns. Returns schema metadata "
        "including column names, types, row counts, and time ranges. "
        "Use before SQL delegation to find the right table for a question."
    )

    def run(self, args: SearchSchemaArgs) -> str:
        try:
            from app.services.duckdb_store import get_store, DATASET_TABLE_MAP
        except ImportError:
            return "DuckDB store not available"

        store = get_store()

        query_lower = args.query.lower()
        results: list[str] = []

        for label, table_name in DATASET_TABLE_MAP.items():
            if not store.has_table(table_name):
                continue

            try:
                meta = store.get_metadata(table_name)
            except Exception:
                continue

            raw_columns = meta.get("columns", [])
            row_count = meta.get("row_count", "?")
            time_range = meta.get("time_range", {})

            # Columns can be list[str] or list[dict] depending on metadata version
            col_info: list[tuple[str, str]] = []
            for c in raw_columns:
                if isinstance(c, dict):
                    col_info.append((c.get("column_name", "?"), c.get("column_type", "?")))
                else:
                    col_info.append((str(c), "?"))

            # Filter by query keyword if provided
            if query_lower:
                table_match = query_lower in table_name.lower() or query_lower in label.lower()
                col_match = any(query_lower in name.lower() for name, _ in col_info)
                if not table_match and not col_match:
                    continue

            section = [f"## {label} ({table_name})"]
            if args.include_stats:
                section.append(f"Rows: {row_count}")
                if time_range:
                    section.append(f"Time range: {time_range.get('min', '?')} to {time_range.get('max', '?')}")

            # List columns, highlighting matches
            col_lines = []
            for col_name, col_type in col_info:
                if query_lower and query_lower in col_name.lower():
                    col_lines.append(f"  **{col_name}** ({col_type})")
                else:
                    col_lines.append(f"  {col_name} ({col_type})")

            if col_lines:
                section.append("Columns:")
                section.extend(col_lines[:50])  # Cap at 50 columns
                if len(col_lines) > 50:
                    section.append(f"  ... and {len(col_lines) - 50} more")

            results.append("\n".join(section))

        if not results:
            return f"No tables found matching '{args.query}'" if args.query else "No tables available"

        return "\n\n".join(results)
