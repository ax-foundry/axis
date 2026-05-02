"""Minimal reference implementation of a custom copilot agent.

Copy this file as a starting point for your own agent.  The only hard
requirements are:

1. ``__init__`` accepts ``thought_stream: ThoughtStream | None = None``
2. ``is_configured`` property returns a bool
3. ``process(**kwargs)`` returns ``(response: str, chart_spec, download_spec)``

You do **not** need to close the thought stream — the router does it for you.
"""

from __future__ import annotations

import logging
from typing import Any

from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.plugins.example_agent")


class DemoAgent:
    """Reference agent that returns a static response.

    Replace the body of ``process()`` with your own logic — call an external
    API, run a LangGraph workflow, query a vector store, etc.
    """

    def __init__(self, thought_stream: ThoughtStream | None = None) -> None:
        self.thought_stream = thought_stream or ThoughtStream()

    @property
    def is_configured(self) -> bool:
        # Return False here if your agent needs credentials that aren't set.
        return True

    async def process(
        self,
        *,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Return a static acknowledgement with example thought emissions."""
        await self.thought_stream.emit_reasoning(
            f"DemoAgent received: {message[:80]}",
            node_name="DemoAgent",
        )
        await self.thought_stream.emit_planning(
            f"Dataset in scope: {dataset_label or 'none'}",
            node_name="DemoAgent",
        )
        await self.thought_stream.emit_success("Done", node_name="DemoAgent")

        response = f"**[DemoAgent]** Received: _{message}_"
        chart_spec = None
        download_spec = None
        return response, chart_spec, download_spec
