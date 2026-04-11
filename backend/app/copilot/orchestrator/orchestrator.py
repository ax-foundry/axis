"""Multi-agent orchestrator built on the universal_computer SDK.

The orchestrator is a supervisor that holds conversation state and delegates
to specialized sub-agents (SQL, Python, Reporting, Research) via FunctionTools.
It has no data tools of its own — it routes, synthesizes, and explains.

``OrchestratorAgent.process()`` has the same signature as ``CopilotAgent.process()``
so it can be used as a drop-in replacement in the SSE streaming endpoint.
"""

from __future__ import annotations

import logging
from typing import Any

from openai.types.responses import (
    ResponseTextDoneEvent,
)

from universal_computer import Manifest, UnixLocalSandboxClient
from universal_computer.agents import Agent, Task, ToolCalledEvent
from universal_computer.agents.plugins.compaction import Compaction, StaticCompactionPolicy

from app.copilot.orchestrator import config as cfg
from app.copilot.orchestrator.bridge.thought_bridge import ThoughtBridge
from app.copilot.orchestrator.control import ControlPlane
from app.copilot.orchestrator.contracts import DelegationResult
from app.copilot.orchestrator.delegation.sql_tool import DelegateToSQLTool
from app.copilot.orchestrator.prompts import build_orchestrator_prompt
from app.copilot.orchestrator.tools.search_schema import SearchSchemaTool
from app.copilot.orchestrator.tools.synthesize import SynthesizeTool
from app.copilot.orchestrator.workspace import WorkspaceManager
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger(__name__)


class OrchestratorAgent:
    """Multi-agent supervisor that delegates to specialized sub-agents.

    Drop-in compatible with ``CopilotAgent`` — same ``process()`` signature,
    same return type, same SSE streaming contract.
    """

    def __init__(self, thought_stream: ThoughtStream) -> None:
        self.thought_stream = thought_stream
        self._is_configured: bool | None = None

    @property
    def is_configured(self) -> bool:
        """Check if the orchestrator can be used (needs OpenAI API key)."""
        if self._is_configured is None:
            try:
                from app.copilot.llm.provider import LLMProvider

                self._is_configured = LLMProvider.is_configured("openai")
            except ImportError:
                self._is_configured = False
        return self._is_configured

    async def process(
        self,
        message: str,
        dataset_label: str | None = None,
        data_context: dict[str, Any] | None = None,
        conversation_history: list[dict[str, Any]] | None = None,
        user_id: str | None = None,
        agent_name: str | None = None,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Process a user message via the multi-agent orchestrator.

        Returns (response_text, chart_spec, download_spec) — same as CopilotAgent.
        """
        control_plane = ControlPlane()
        workspace = WorkspaceManager(request_id=control_plane.request_id)

        try:
            return await self._run(
                message=message,
                dataset_label=dataset_label,
                data_context=data_context,
                conversation_history=conversation_history,
                user_id=user_id,
                agent_name=agent_name,
                control_plane=control_plane,
                workspace=workspace,
            )
        except Exception as e:
            logger.error("Orchestrator failed: %s", e, exc_info=True)
            await self.thought_stream.emit_error(
                f"Orchestrator error: {e}", node_name="Orchestrator"
            )
            return f"Sorry, an error occurred: {e}", None, None
        finally:
            # Always close the thought stream so the SSE generator gets the sentinel
            await self.thought_stream.close()
            await workspace.cleanup()
            logger.info(
                "Orchestrator completed: %s",
                control_plane.summary(),
            )

    async def _run(
        self,
        *,
        message: str,
        dataset_label: str | None,
        data_context: dict[str, Any] | None,
        conversation_history: list[dict[str, Any]] | None,
        user_id: str | None,
        agent_name: str | None,
        control_plane: ControlPlane,
        workspace: WorkspaceManager,
    ) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        # Build delegation and utility tools
        sql_tool = DelegateToSQLTool(
            thought_stream=self.thought_stream,
            workspace=workspace,
            control_plane=control_plane,
        )
        search_tool = SearchSchemaTool()
        synthesize_tool = SynthesizeTool(workspace=workspace)

        tools = [sql_tool, search_tool, synthesize_tool]

        # Try to add Python delegation tool if available
        try:
            from app.copilot.orchestrator.delegation.python_tool import DelegateToPythonTool

            python_tool = DelegateToPythonTool(
                thought_stream=self.thought_stream,
                workspace=workspace,
                control_plane=control_plane,
            )
            tools.append(python_tool)
        except ImportError:
            logger.debug("Python delegation tool not available")

        # Build UC Agent
        manifest = Manifest(root=str(workspace.root))
        uc_agent: Agent[None] = Agent(
            default_manifest=manifest,
            model=cfg.ORCHESTRATOR_MODEL,
            user_instructions=build_orchestrator_prompt(),
            plugins=[
                Compaction(policy=StaticCompactionPolicy(threshold=cfg.COMPACTION_THRESHOLD)),
            ],
            tools=tools,
        )

        client = UnixLocalSandboxClient()
        bridge = ThoughtBridge(self.thought_stream)

        # Track chart_spec/download_spec from delegation results
        last_chart_spec: dict[str, Any] | None = None
        last_download_spec: dict[str, Any] | None = None
        response_text = ""

        await self.thought_stream.emit_planning(
            "Analyzing your question and deciding which agents to involve...",
            node_name="Orchestrator",
        )

        async with uc_agent.start(client=client, client_options=None) as task:
            # Build conversation context
            context: list[dict[str, Any]] = []

            # Add conversation history if provided
            if conversation_history:
                for msg in conversation_history[-10:]:  # last 10 turns
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    if role in ("user", "assistant") and content:
                        context.append({"role": role, "content": content})

            # Add the current message
            context.append({"role": "user", "content": message})

            # If dataset_label is provided, add it as context
            if dataset_label:
                context.insert(-1, {
                    "role": "user",
                    "content": f"[Context: The user is working with the '{dataset_label}' dataset.]",
                })

            # Run the orchestrator task
            async for event in task.run(context):
                # Bridge UC events to ThoughtStream
                await bridge.handle_event(event)

                if isinstance(event, ToolCalledEvent):
                    # Auto-approve all delegation tools
                    await event.tool_call(task)

                    # Extract chart_spec/download_spec from delegation results
                    # (they're embedded in the DelegationResult JSON in the context)
                    self._extract_specs_from_context(
                        task, last_chart_spec_ref=[last_chart_spec],
                        last_download_spec_ref=[last_download_spec],
                    )

                elif isinstance(event, ResponseTextDoneEvent):
                    response_text = event.text

            # Flush any remaining bridge text
            await bridge.flush()

        # Extract final chart/download specs from the task context
        chart_spec, download_spec = self._find_specs_in_context(task)

        if not response_text:
            response_text = "I wasn't able to generate a response. Please try rephrasing your question."

        await self.thought_stream.emit_success(
            f"Analysis complete ({control_plane.hop_count} delegation(s), "
            f"{control_plane.elapsed_s():.1f}s)",
            node_name="Orchestrator",
        )

        return response_text, chart_spec, download_spec

    def _extract_specs_from_context(
        self,
        task: Task,
        last_chart_spec_ref: list,
        last_download_spec_ref: list,
    ) -> None:
        """Extract chart/download specs from the most recent function_call_output in context."""
        # Walk context backwards to find the last function_call_output
        for item in reversed(task.context):
            if isinstance(item, dict) and item.get("type") == "function_call_output":
                try:
                    import json

                    output = json.loads(item.get("output", "{}"))
                    if "chart_spec" in output and output["chart_spec"]:
                        last_chart_spec_ref[0] = output["chart_spec"]
                    if "download_spec" in output and output["download_spec"]:
                        last_download_spec_ref[0] = output["download_spec"]
                except (json.JSONDecodeError, TypeError):
                    pass
                break

    def _find_specs_in_context(
        self, task: Task
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Scan the full task context for any chart_spec or download_spec."""
        chart_spec = None
        download_spec = None

        for item in task.context:
            if isinstance(item, dict) and item.get("type") == "function_call_output":
                try:
                    import json

                    output = json.loads(item.get("output", "{}"))
                    if "chart_spec" in output and output["chart_spec"]:
                        chart_spec = output["chart_spec"]
                    if "download_spec" in output and output["download_spec"]:
                        download_spec = output["download_spec"]
                except (json.JSONDecodeError, TypeError):
                    pass

        return chart_spec, download_spec
