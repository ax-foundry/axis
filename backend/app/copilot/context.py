"""Shared base context for copilot tool execution.

Both ``CopilotDeps`` (pydantic-ai) and ``OAIContext`` (OpenAI Agents SDK)
inherit from ``BaseCopilotContext``, giving all tools a uniform interface
for caching, DuckDB access, thought streaming, and dataset scoping.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.copilot.thoughts import ThoughtStream


def _safe_json(obj: Any) -> str:
    """JSON serializer that handles dates and other non-native types."""

    def _default(o: Any) -> Any:
        if hasattr(o, "isoformat"):
            return o.isoformat()
        return str(o)

    return json.dumps(obj, default=_default)


@dataclass
class BaseCopilotContext:
    """Base context shared by both agent implementations.

    Provides DuckDB access, tool result caching, thought streaming,
    and dataset scoping.
    """

    thought_stream: ThoughtStream
    dataset_label: str = "evaluation"
    data_context: dict[str, Any] = field(default_factory=dict)
    _cache: dict[str, str] = field(default_factory=dict)
    chart_spec: dict[str, Any] | None = None
    download_spec: dict[str, Any] | None = None
    user_id: str | None = None
    skills_injection: str = ""
    last_sql: str = ""
    sql_examples_injection: str = ""
    agent_name: str | None = None

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
