"""SQL delegation tool — wraps the existing CopilotAgent.

This is the critical bridge between the orchestrator (universal_computer SDK)
and the existing pydantic-ai SQL agent. It calls ``CopilotAgent.process()``
exactly as the SSE endpoint does, so the SQL agent's full toolset, memory,
schema injection, and skills system work unchanged.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.copilot.orchestrator.contracts import ArtifactRef, DelegationResult
from app.copilot.orchestrator.delegation.base import BaseDelegationTool, DelegationArgs

logger = logging.getLogger(__name__)


class SQLDelegationArgs(BaseModel):
    """Arguments for the SQL delegation tool."""

    task: str = Field(description="The data query or analysis task to delegate to the SQL agent")
    dataset_label: str = Field(
        default="monitoring",
        description=(
            "Which dataset to query. Options: "
            "'monitoring' (evaluation metrics), "
            "'kpi' (business KPIs), "
            "'human_signals' (Slack conversation signals), "
            "'evaluation' (eval results)"
        ),
    )
    agent_name: str | None = Field(
        default=None,
        description="Optional: filter to a specific agent's data (e.g. 'athena')",
    )
    context: str = Field(default="", description="Additional context or constraints")


class DelegateToSQLTool(BaseDelegationTool):
    """Delegate a data query task to the SQL specialist agent.

    The SQL agent connects to DuckDB and can: summarize schemas, query/filter data,
    run aggregations, compare groups, generate Plotly charts, and save datasets.
    It has cross-session memory for learned SQL patterns and error fixes.

    Use this for: lookups, filtering, aggregations, GROUP BY, time series, pass rates,
    KPI values, signal extraction, and any question answerable with SQL.
    """

    tool_name: ClassVar[str] = "delegate_to_sql"
    args_model: ClassVar[type] = SQLDelegationArgs
    description: ClassVar[str] = (
        "Delegate a data query task to the SQL specialist agent. "
        "Use for lookups, aggregations, time series, pass rates, KPI values, "
        "and any question answerable with SQL against DuckDB."
    )
    agent_name: str = "sql"

    async def _execute(
        self, args: DelegationArgs, *, delegation_id: str
    ) -> DelegationResult:
        sql_args = SQLDelegationArgs.model_validate(args.model_dump())

        try:
            from app.copilot.oai_agent import OAICopilotAgent
        except ImportError as e:
            return DelegationResult.error_result("sql", f"OAICopilotAgent import failed: {e}")

        # Create a child ThoughtStream that forwards thoughts to the parent
        # but whose close() does NOT kill the parent stream.
        # The SQL agent's run_copilot_request() closes its stream at the end —
        # if we shared the parent stream, it would send the None sentinel
        # and kill the orchestrator's SSE connection prematurely.
        from app.copilot.orchestrator.bridge.thought_bridge import ForwardingThoughtStream

        child_stream = ForwardingThoughtStream(parent=self.thought_stream)
        agent = OAICopilotAgent(thought_stream=child_stream)

        if not agent.is_configured:
            return DelegationResult.error_result(
                "sql", "SQL agent not configured (no LLM API credentials)"
            )

        start = time.monotonic()
        try:
            response, chart_spec, download_spec = await agent.process(
                message=sql_args.task,
                dataset_label=sql_args.dataset_label,
                agent_name=sql_args.agent_name,
            )
        except Exception as e:
            return DelegationResult.error_result("sql", f"SQL agent execution failed: {e}")

        latency_ms = (time.monotonic() - start) * 1000
        artifacts: list[dict[str, Any]] = []

        # If chart_spec was generated, record it
        if chart_spec:
            # Save chart spec to workspace for potential reuse
            chart_path = f"data/sql_chart_{delegation_id[:8]}.json"
            try:
                import json

                self.workspace.write_file(
                    chart_path, json.dumps(chart_spec).encode("utf-8")
                )
                artifacts.append(
                    DelegationResult.from_artifact(
                        ArtifactRef(
                            path=chart_path,
                            format="json",
                            description="Plotly chart specification",
                        )
                    )
                )
            except Exception:
                logger.warning("Failed to save chart spec to workspace", exc_info=True)

        return DelegationResult(
            status="success",
            agent="sql",
            summary=response,
            artifacts=artifacts,
            chart_spec=chart_spec,
            download_spec=download_spec,
            metrics={
                "latency_ms": round(latency_ms, 1),
                "dataset_label": sql_args.dataset_label,
            },
        )
