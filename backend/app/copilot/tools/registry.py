import logging

from app.copilot.tools.base import BaseTool, ToolMetadata
from app.copilot.tools.loader import ToolLoader

logger = logging.getLogger("axis.copilot.tools.registry")

# Global registry instance
_registry_instance: "ToolRegistry | None" = None


class ToolRegistry:
    """Singleton registry for managing copilot tools."""

    def __init__(self) -> None:
        """Initialize the tool registry."""
        self._tools: dict[str, BaseTool] = {}
        self._metadata: dict[str, ToolMetadata] = {}
        self._loader = ToolLoader()
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "ToolRegistry":
        """Get the singleton registry instance."""
        global _registry_instance
        if _registry_instance is None:
            _registry_instance = cls()
            _registry_instance.initialize()
        return _registry_instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (for testing)."""
        global _registry_instance
        _registry_instance = None

    def initialize(self) -> None:
        """Initialize the registry by discovering and loading tools."""
        if self._initialized:
            return

        logger.info("Initializing tool registry...")

        # Discover filesystem-defined tools
        discovered = self._loader.discover_tools()
        for metadata in discovered:
            self._metadata[metadata.name] = metadata

        # Register built-in tools
        self._register_builtin_tools()

        self._initialized = True
        logger.info(f"Registry initialized with {len(self._tools)} tools")

    def _register_builtin_tools(self) -> None:
        """Register the built-in tool implementations."""
        from app.copilot.tools.builtin.analyze import AnalyzeTool
        from app.copilot.tools.builtin.compare import CompareTool
        from app.copilot.tools.builtin.evaluate import EvaluateTool
        from app.copilot.tools.builtin.query import QueryTool
        from app.copilot.tools.builtin.summarize import SummarizeTool

        builtin_tools = [
            EvaluateTool(),
            CompareTool(),
            AnalyzeTool(),
            QueryTool(),
            SummarizeTool(),
        ]

        for tool in builtin_tools:
            self.register(tool)
            # Merge with any filesystem metadata
            if tool.name in self._metadata:
                # Filesystem metadata takes precedence for instructions
                fs_meta = self._metadata[tool.name]
                if fs_meta.instructions:
                    tool._metadata.instructions = fs_meta.instructions

    def register(self, tool: BaseTool) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool
        if tool.name not in self._metadata:
            self._metadata[tool.name] = tool.metadata
        logger.debug(f"Registered tool: {tool.name}")

    def unregister(self, tool_name: str) -> None:
        """Unregister a tool."""
        if tool_name in self._tools:
            del self._tools[tool_name]
            logger.debug(f"Unregistered tool: {tool_name}")

    def get_tool(self, tool_name: str) -> BaseTool | None:
        """Get a tool by name."""
        return self._tools.get(tool_name)

    def get_metadata(self, tool_name: str) -> ToolMetadata | None:
        """Get tool metadata by name."""
        return self._metadata.get(tool_name)

    def list_tools(self) -> list[BaseTool]:
        """List all registered tools."""
        return list(self._tools.values())

    def list_metadata(self) -> list[ToolMetadata]:
        """List metadata for all known tools."""
        return list(self._metadata.values())

    def find_tools_by_tag(self, tag: str) -> list[BaseTool]:
        """Find tools with a specific tag."""
        return [tool for tool in self._tools.values() if tag in tool.metadata.tags]

    def find_tools_by_query(self, query: str) -> list[BaseTool]:
        """Find tools relevant to a query (simple keyword matching)."""
        query_lower = query.lower()
        results = []

        for tool in self._tools.values():
            # Check name, description, and tags
            if (
                query_lower in tool.name.lower()
                or query_lower in tool.metadata.description.lower()
                or any(query_lower in tag.lower() for tag in tool.metadata.tags)
            ):
                results.append(tool)

        return results
