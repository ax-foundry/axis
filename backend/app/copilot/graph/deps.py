import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.copilot.llm.provider import LLMProvider
from app.copilot.thoughts import ThoughtStream

if TYPE_CHECKING:
    from app.copilot.tools.registry import ToolRegistry

logger = logging.getLogger("axis.copilot.graph.deps")


@dataclass
class GraphDeps:
    """Dependencies injected into graph nodes.

    Contains shared resources like the LLM provider, thought stream,
    and tool registry that nodes need for execution.
    """

    # Thought streaming
    thought_stream: ThoughtStream

    # LLM provider
    llm_provider: LLMProvider | None = None

    # Tool registry (lazy loaded)
    _tool_registry: "ToolRegistry | None" = field(default=None, repr=False)

    # Configuration
    max_iterations: int = 3
    quality_threshold: float = 0.7

    def __post_init__(self) -> None:
        """Initialize LLM provider if not provided."""
        logger.info(f"GraphDeps __post_init__: llm_provider={self.llm_provider}")
        if self.llm_provider is None:
            default_provider = LLMProvider.get_default_provider()
            logger.info(f"GraphDeps: default_provider={default_provider}")
            if default_provider:
                self.llm_provider = LLMProvider(provider=default_provider)
                logger.info(f"GraphDeps: Created LLM provider with {default_provider}")
            else:
                logger.warning("GraphDeps: No LLM provider available!")
        logger.info(f"GraphDeps initialized: has_llm={self.has_llm}")

    @property
    def tool_registry(self) -> "ToolRegistry":
        """Get the tool registry, creating it if needed."""
        if self._tool_registry is None:
            from app.copilot.tools.registry import ToolRegistry

            self._tool_registry = ToolRegistry.get_instance()
        return self._tool_registry

    @property
    def has_llm(self) -> bool:
        """Check if an LLM provider is available."""
        return self.llm_provider is not None

    async def emit_thought(
        self,
        thought_type: str,
        content: str,
        node_name: str | None = None,
        tool_name: str | None = None,
        **metadata: Any,
    ) -> None:
        """Convenience method to emit a thought.

        Args:
            thought_type: Type of thought (reasoning, tool_use, etc.)
            content: Thought content
            node_name: Name of the node emitting the thought
            tool_name: Name of the tool being used (if any)
            **metadata: Additional metadata
        """
        from app.copilot.thoughts import Thought, ThoughtType

        thought = Thought(
            type=ThoughtType(thought_type),
            content=content,
            node_name=node_name,
            tool_name=tool_name,
            metadata=metadata,
        )
        await self.thought_stream.emit(thought)
