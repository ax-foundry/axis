import asyncio
import logging
from typing import Any

from pydantic_graph import Graph

from app.copilot.graph.deps import GraphDeps
from app.copilot.graph.nodes import AnalyzerNode, ExecutorNode, PlannerNode, ReflectorNode
from app.copilot.graph.state import CopilotState
from app.copilot.llm.provider import LLMProvider
from app.copilot.skills.registry import SkillRegistry
from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.orchestrator")


class CopilotOrchestrator:
    """Main orchestrator for the AI Copilot.

    Coordinates the graph pipeline execution and thought streaming.
    """

    def __init__(
        self,
        thought_stream: ThoughtStream | None = None,
        llm_provider: LLMProvider | None = None,
    ) -> None:
        """Initialize the orchestrator.

        Args:
            thought_stream: Stream for emitting thoughts (created if not provided)
            llm_provider: LLM provider to use (auto-detected if not provided)
        """
        self.thought_stream = thought_stream or ThoughtStream()
        self.llm_provider = llm_provider
        self._graph: Graph[CopilotState, GraphDeps, str] | None = None

        # Initialize skill registry
        self._skill_registry = SkillRegistry.get_instance()

    def _create_graph(self) -> Graph[CopilotState, GraphDeps, str]:
        """Create the pydantic-graph pipeline."""
        if self._graph is None:
            self._graph = Graph(
                nodes=[AnalyzerNode, PlannerNode, ExecutorNode, ReflectorNode],
            )
        return self._graph

    async def process(
        self,
        message: str,
        data_context: dict[str, Any] | None = None,
        data: list[dict[str, Any]] | None = None,
    ) -> str:
        """Process a user message through the copilot pipeline.

        Args:
            message: User's message/query
            data_context: Context about the loaded data (format, columns, etc.)
            data: Actual data rows for analysis

        Returns:
            Final response from the copilot
        """
        logger.info("=== ORCHESTRATOR PROCESS START ===")
        logger.info(f"Message: {message[:100]}...")
        logger.info(f"Data context: {data_context}")
        logger.info(f"Data rows: {len(data) if data else 0}")

        # Initialize state
        state = CopilotState(
            message=message,
            data_context=data_context or {},
            data=data,
        )
        logger.info("State initialized")

        # Initialize dependencies
        logger.info(f"Creating GraphDeps with llm_provider={self.llm_provider}")
        deps = GraphDeps(
            thought_stream=self.thought_stream,
            llm_provider=self.llm_provider,
            _skill_registry=self._skill_registry,
        )
        logger.info(f"GraphDeps created. has_llm={deps.has_llm}")

        # Create and run graph
        graph = self._create_graph()
        logger.info(
            f"Graph created with nodes: {graph.nodes if hasattr(graph, 'nodes') else 'unknown'}"
        )

        try:
            logger.info("Emitting initial reasoning thought...")
            await self.thought_stream.emit_reasoning(
                f"Processing request: {message}",
                node_name="Orchestrator",
            )
            logger.info("Initial thought emitted")

            # Run the graph starting with AnalyzerNode
            logger.info("Starting graph.run with AnalyzerNode...")
            result = await graph.run(
                AnalyzerNode(),
                state=state,
                deps=deps,
            )
            logger.info(f"Graph run completed. Result type: {type(result)}, result: {result}")

            # Extract final response
            if hasattr(result, "output"):
                response = result.output
                logger.info("Extracted response from result.output")
            else:
                response = state.final_response or str(result)
                logger.info("Using state.final_response or str(result)")

            logger.info(f"Final response length: {len(response) if response else 0}")

            await self.thought_stream.emit_success(
                "Request completed successfully.",
                node_name="Orchestrator",
            )

            return response

        except Exception as e:
            logger.error(f"Orchestrator error: {e}", exc_info=True)
            await self.thought_stream.emit_error(
                f"An error occurred: {e}",
                node_name="Orchestrator",
            )
            return f"I encountered an error while processing your request: {e}"

        finally:
            logger.info("Closing thought stream...")
            # Close the thought stream
            await self.thought_stream.close()
            logger.info("=== ORCHESTRATOR PROCESS END ===")

    async def process_with_streaming(
        self,
        message: str,
        data_context: dict[str, Any] | None = None,
        data: list[dict[str, Any]] | None = None,
    ) -> tuple[asyncio.Task[str], ThoughtStream]:
        """Process a message with streaming thoughts.

        Returns a task for the final response and the thought stream
        so the caller can iterate over thoughts while waiting.

        Args:
            message: User's message/query
            data_context: Context about the loaded data
            data: Actual data rows for analysis

        Returns:
            Tuple of (response task, thought stream)
        """
        # Create a new thought stream for this request
        thought_stream = ThoughtStream()
        self.thought_stream = thought_stream

        # Start processing in a task
        task = asyncio.create_task(self.process(message, data_context, data))

        return task, thought_stream

    def get_available_skills(self) -> list[dict[str, Any]]:
        """Get information about available skills.

        Returns:
            List of skill info dictionaries
        """
        skills = self._skill_registry.list_skills()
        return [
            {
                "name": skill.name,
                "description": skill.metadata.description,
                "version": skill.metadata.version,
                "parameters": [
                    {
                        "name": p.name,
                        "type": p.type,
                        "description": p.description,
                        "required": p.required,
                        "default": p.default,
                    }
                    for p in skill.metadata.parameters
                ],
                "tags": skill.metadata.tags,
            }
            for skill in skills
        ]

    @property
    def is_configured(self) -> bool:
        """Check if the orchestrator has a working LLM provider."""
        if self.llm_provider:
            return True
        return LLMProvider.get_default_provider() is not None
