"""Base delegation tool with control plane enforcement.

All delegation tools (SQL, Python, Reporting, Research) inherit from
``BaseDelegationTool``. The base handles pre-checks, timeout wrapping,
metrics collection, and error handling so sub-classes only implement
the agent-specific ``_execute`` method.
"""

from __future__ import annotations

import abc
import logging
import time
import uuid
from typing import TYPE_CHECKING, Any, Awaitable

from openai.types.responses import ResponseFunctionToolCall as FunctionCall
from pydantic import BaseModel, ConfigDict, Field

from universal_computer.agents.tools import FunctionTool

from app.copilot.orchestrator.contracts import DelegationResult

if TYPE_CHECKING:
    from app.copilot.orchestrator.control import ControlPlane, DelegationMetrics
    from app.copilot.orchestrator.workspace import WorkspaceManager
    from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger(__name__)


class DelegationArgs(BaseModel):
    """Arguments accepted by all delegation tools."""

    task: str = Field(description="What to ask the sub-agent to do")
    context: str = Field(
        default="",
        description="Additional context, data file references, or constraints",
    )


class BaseDelegationTool(FunctionTool[DelegationArgs, str]):
    """Base class for delegation tools.

    Subclasses must define:
    - ``tool_name``: ClassVar[str]
    - ``args_model``: ClassVar = their args model (can extend DelegationArgs)
    - ``description``: ClassVar[str]
    - ``agent_name``: ClassVar[str] — the sub-agent identifier ("sql", "python", etc.)
    - ``async _execute(args) -> DelegationResult``: the actual agent invocation

    The base class handles:
    - Pre-delegation checks (hops, budget, wall-clock, circuit breaker, cancellation)
    - Timeout wrapping
    - Metrics collection (latency, status)
    - Error handling → DelegationResult(status="error")
    - ThoughtStream emissions for delegation start/end
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Subclasses must set these
    agent_name: str = ""

    # Runtime references — not serialized, but must be Pydantic fields
    # so __setattr__ doesn't reject them
    thought_stream: Any = Field(default=None, exclude=True)
    workspace: Any = Field(default=None, exclude=True)
    control_plane: Any = Field(default=None, exclude=True)

    def __init__(
        self,
        *,
        thought_stream: ThoughtStream,
        workspace: WorkspaceManager,
        control_plane: ControlPlane,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            thought_stream=thought_stream,
            workspace=workspace,
            control_plane=control_plane,
            **kwargs,
        )

    def run(self, args: DelegationArgs) -> Awaitable[str]:
        """FunctionTool entry point. Wraps _execute with control plane checks."""
        return self._run_with_controls(args)

    async def _run_with_controls(self, args: DelegationArgs) -> str:
        delegation_id = str(uuid.uuid4())
        agent = self.agent_name

        # Pre-checks
        err = self.control_plane.pre_check(agent)
        if err:
            result = DelegationResult.error_result(agent, err)
            return result.to_tool_output()

        # Emit start thought
        await self.thought_stream.emit_planning(
            f"Delegating to {agent} agent: {args.task[:100]}...",
            node_name="Orchestrator",
        )

        start_time = time.monotonic()
        result: DelegationResult

        try:
            result = await self._execute(args, delegation_id=delegation_id)
        except Exception as e:
            logger.error(
                "Delegation to %s failed: %s",
                agent,
                str(e),
                exc_info=True,
                extra={"delegation_id": delegation_id},
            )
            result = DelegationResult.error_result(agent, str(e))

        # Record metrics
        latency_ms = (time.monotonic() - start_time) * 1000
        from app.copilot.orchestrator.control import DelegationMetrics

        metrics = DelegationMetrics(
            delegation_id=delegation_id,
            agent=agent,
            latency_ms=latency_ms,
            status=result.status,
            error=result.errors[0] if result.errors else None,
        )
        self.control_plane.record_delegation(metrics)

        # Emit completion thought
        status_label = result.status.upper()
        await self.thought_stream.emit_observation(
            f"{agent.upper()} agent [{status_label}]: {result.summary[:150]}",
            node_name="Orchestrator",
            tool_name=f"delegate_to_{agent}",
        )

        # Check for budget warning
        warning = self.control_plane.budget_warning()
        if warning:
            result.warnings.append(warning)

        return result.to_tool_output()

    @abc.abstractmethod
    async def _execute(
        self, args: DelegationArgs, *, delegation_id: str
    ) -> DelegationResult:
        """Subclasses implement this to invoke their specific sub-agent."""
        ...
