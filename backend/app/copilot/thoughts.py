import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

logger = logging.getLogger("axis.copilot.thoughts")


class ThoughtType(StrEnum):
    """Types of thoughts the copilot can emit."""

    REASONING = "reasoning"  # Internal reasoning/thinking
    TOOL_USE = "tool_use"  # Using a tool/skill
    OBSERVATION = "observation"  # Observing data or results
    PLANNING = "planning"  # Creating or updating a plan
    REFLECTION = "reflection"  # Evaluating progress or quality
    DECISION = "decision"  # Making a decision
    ERROR = "error"  # Error occurred
    SUCCESS = "success"  # Task completed successfully


# Color mapping for thought types (used by frontend)
THOUGHT_COLORS: dict[ThoughtType, str] = {
    ThoughtType.REASONING: "#3B82F6",  # blue
    ThoughtType.TOOL_USE: "#8B5CF6",  # purple
    ThoughtType.OBSERVATION: "#10B981",  # green
    ThoughtType.PLANNING: "#F59E0B",  # amber
    ThoughtType.REFLECTION: "#6366F1",  # indigo
    ThoughtType.DECISION: "#EC4899",  # pink
    ThoughtType.ERROR: "#EF4444",  # red
    ThoughtType.SUCCESS: "#22C55E",  # green
}


@dataclass
class Thought:
    """A single thought emitted by the copilot.

    Represents a discrete unit of reasoning or action that can be
    streamed to the frontend for real-time transparency.
    """

    type: ThoughtType
    content: str
    node_name: str | None = None  # Which graph node emitted this
    skill_name: str | None = None  # Which skill is being used (if any)
    metadata: dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        """Convert thought to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "type": self.type.value,
            "content": self.content,
            "node_name": self.node_name,
            "skill_name": self.skill_name,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
            "color": THOUGHT_COLORS.get(self.type, "#6B7280"),
        }

    def to_json(self) -> str:
        """Convert thought to JSON string."""
        return json.dumps(self.to_dict())


class ThoughtStream:
    """Async pub/sub system for streaming thoughts via SSE.

    Provides a way to emit thoughts from the copilot pipeline and
    subscribe to receive them for real-time streaming to clients.
    """

    def __init__(self) -> None:
        """Initialize the thought stream."""
        self._queue: asyncio.Queue[Thought | None] = asyncio.Queue()
        self._closed = False
        self._thoughts: list[Thought] = []
        logger.info("ThoughtStream initialized")

    async def emit(self, thought: Thought) -> None:
        """Emit a thought to all subscribers.

        Args:
            thought: The thought to emit
        """
        if self._closed:
            logger.warning("Attempted to emit thought on closed stream")
            return

        self._thoughts.append(thought)
        await self._queue.put(thought)
        logger.info(
            f"THOUGHT EMITTED: type={thought.type.value}, node={thought.node_name}, content={thought.content[:80]}..."
        )

    async def emit_reasoning(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a reasoning thought."""
        await self.emit(
            Thought(
                type=ThoughtType.REASONING,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_tool_use(
        self, content: str, skill_name: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a tool use thought."""
        await self.emit(
            Thought(
                type=ThoughtType.TOOL_USE,
                content=content,
                skill_name=skill_name,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_observation(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit an observation thought."""
        await self.emit(
            Thought(
                type=ThoughtType.OBSERVATION,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_planning(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a planning thought."""
        await self.emit(
            Thought(
                type=ThoughtType.PLANNING,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_reflection(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a reflection thought."""
        await self.emit(
            Thought(
                type=ThoughtType.REFLECTION,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_decision(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a decision thought."""
        await self.emit(
            Thought(
                type=ThoughtType.DECISION,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_error(self, content: str, node_name: str | None = None, **metadata: Any) -> None:
        """Convenience method to emit an error thought."""
        await self.emit(
            Thought(
                type=ThoughtType.ERROR,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def emit_success(
        self, content: str, node_name: str | None = None, **metadata: Any
    ) -> None:
        """Convenience method to emit a success thought."""
        await self.emit(
            Thought(
                type=ThoughtType.SUCCESS,
                content=content,
                node_name=node_name,
                metadata=metadata,
            )
        )

    async def subscribe(self) -> "ThoughtStreamIterator":
        """Subscribe to receive thoughts.

        Returns:
            An async iterator that yields thoughts as they are emitted.
        """
        logger.info(f"ThoughtStream subscriber created. Queue size: {self._queue.qsize()}")
        return ThoughtStreamIterator(self._queue)

    async def close(self) -> None:
        """Close the stream and signal subscribers to stop."""
        if not self._closed:
            self._closed = True
            logger.info(f"ThoughtStream closing. Total thoughts emitted: {len(self._thoughts)}")
            await self._queue.put(None)  # Signal end of stream
            logger.info("ThoughtStream closed (None sentinel sent)")

    @property
    def thoughts(self) -> list[Thought]:
        """Get all thoughts emitted so far."""
        return self._thoughts.copy()

    @property
    def is_closed(self) -> bool:
        """Check if the stream is closed."""
        return self._closed


class ThoughtStreamIterator:
    """Async iterator for consuming thoughts from a ThoughtStream."""

    def __init__(self, queue: asyncio.Queue[Thought | None]) -> None:
        """Initialize the iterator with a thought queue."""
        self._queue = queue
        logger.info("ThoughtStreamIterator created")

    def __aiter__(self) -> "ThoughtStreamIterator":
        """Return self as the async iterator."""
        return self

    async def __anext__(self) -> Thought:
        """Get the next thought from the stream."""
        logger.info("ThoughtStreamIterator waiting for next thought...")
        thought = await self._queue.get()
        if thought is None:
            logger.info("ThoughtStreamIterator received None sentinel, stopping")
            raise StopAsyncIteration
        logger.info(f"ThoughtStreamIterator received thought: {thought.type.value}")
        return thought
