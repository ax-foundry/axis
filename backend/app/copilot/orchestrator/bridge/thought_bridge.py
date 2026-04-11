"""Bridge between universal_computer TaskEvents and the ThoughtStream SSE system.

Translates UC SDK streaming events into ThoughtStream emissions so the
orchestrator's internal reasoning and tool calls appear in the SSE stream
alongside sub-agent thoughts.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from openai.types.responses import (
    ResponseReasoningSummaryTextDeltaEvent,
    ResponseTextDeltaEvent,
)

from universal_computer.agents import ToolCalledEvent
from universal_computer.agents.events import (
    TaskLifecycleIdleEvent,
    TaskLifecycleRunningEvent,
    TaskLifecycleStoppedEvent,
)

if TYPE_CHECKING:
    pass

from app.copilot.thoughts import Thought, ThoughtStream

logger = logging.getLogger(__name__)


class ForwardingThoughtStream(ThoughtStream):
    """A child ThoughtStream that forwards emissions to a parent but ignores close().

    Used when delegating to sub-agents that call ``thought_stream.close()`` at
    the end of their pipeline. Without this, the sub-agent's close() would send
    the None sentinel to the parent SSE generator, killing the connection before
    the orchestrator finishes.
    """

    def __init__(self, parent: ThoughtStream) -> None:
        super().__init__()
        self._parent = parent

    async def emit(self, thought: Thought) -> None:
        """Forward to parent (skip local queue — we don't subscribe to this stream)."""
        if self._parent.is_closed:
            return
        await self._parent.emit(thought)

    async def close(self) -> None:
        """No-op: don't close the parent. The orchestrator owns the parent lifecycle."""
        # Close our own queue so any local subscribers stop,
        # but do NOT close the parent.
        if not self._closed:
            self._closed = True
            await self._queue.put(None)

# Accumulate text deltas and emit when we hit a sentence boundary or threshold
_FLUSH_CHARS = 120


class ThoughtBridge:
    """Translates UC TaskEvent stream into ThoughtStream emissions."""

    def __init__(self, thought_stream: ThoughtStream) -> None:
        self._stream = thought_stream
        self._text_buffer = ""

    async def handle_event(self, event: Any) -> None:
        """Process a single UC TaskEvent and emit the corresponding thought."""
        match event:
            case ToolCalledEvent():
                # Flush any accumulated text first
                await self._flush_text()
                desc = event.tool_call.describe()
                tool_type = "function"
                spec = event.tool_call.tool.as_responses_tool()
                tool_name = spec.get("name", desc.split("(")[0])
                approval = " [requires approval]" if event.requires_approval else ""
                await self._stream.emit_tool_use(
                    f"Calling {tool_name}{approval}",
                    tool_name=tool_name,
                    node_name="Orchestrator",
                )

            case ResponseTextDeltaEvent():
                self._text_buffer += event.delta
                # Emit on sentence boundaries or buffer threshold
                if self._should_flush():
                    await self._flush_text()

            case ResponseReasoningSummaryTextDeltaEvent():
                self._text_buffer += event.delta
                if self._should_flush():
                    await self._flush_text()

            case TaskLifecycleRunningEvent():
                await self._stream.emit_planning(
                    "Orchestrator processing...",
                    node_name="Orchestrator",
                )

            case TaskLifecycleIdleEvent():
                await self._flush_text()

            case TaskLifecycleStoppedEvent():
                await self._flush_text()

    async def flush(self) -> None:
        """Flush any remaining buffered text."""
        await self._flush_text()

    def _should_flush(self) -> bool:
        buf = self._text_buffer
        if len(buf) >= _FLUSH_CHARS:
            return True
        if buf and buf[-1] in ".!?\n":
            return True
        return False

    async def _flush_text(self) -> None:
        text = self._text_buffer.strip()
        if text:
            await self._stream.emit_reasoning(text, node_name="Orchestrator")
        self._text_buffer = ""
