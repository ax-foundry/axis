import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.copilot.thoughts import ThoughtStream

logger = logging.getLogger("axis.copilot.tools")


@dataclass
class ToolParameter:
    """A parameter that a tool accepts."""

    name: str
    type: str  # string, integer, float, boolean, array, object
    description: str | None = None
    required: bool = False
    default: Any = None


@dataclass
class ToolMetadata:
    """Metadata describing a tool."""

    name: str
    description: str
    version: str = "1.0.0"
    parameters: list[ToolParameter] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    enabled: bool = True

    # Optional instruction markdown
    instructions: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolMetadata":
        """Create metadata from a dictionary (e.g., from JSON)."""
        parameters = [
            ToolParameter(
                name=p.get("name", ""),
                type=p.get("type", "string"),
                description=p.get("description"),
                required=p.get("required", False),
                default=p.get("default"),
            )
            for p in data.get("parameters", [])
        ]

        return cls(
            name=data.get("name", ""),
            description=data.get("description", ""),
            version=data.get("version", "1.0.0"),
            parameters=parameters,
            tags=data.get("tags", []),
            enabled=data.get("enabled", True),
        )


class BaseTool(ABC):
    """Abstract base class for copilot tools."""

    def __init__(self, metadata: ToolMetadata) -> None:
        """Initialize the tool.

        Args:
            metadata: Tool metadata
        """
        self._metadata = metadata

    @property
    def metadata(self) -> ToolMetadata:
        """Get tool metadata."""
        return self._metadata

    @property
    def name(self) -> str:
        """Get tool name."""
        return self._metadata.name

    @abstractmethod
    async def execute(
        self,
        message: str,
        data: list[dict[str, Any]] | None = None,
        data_context: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        thought_stream: "ThoughtStream | None" = None,
    ) -> Any:
        """Execute the tool.

        Args:
            message: User's message/query
            data: Evaluation data rows (if available)
            data_context: Context about the data (format, columns, etc.)
            params: Tool-specific parameters
            thought_stream: Stream for emitting thoughts

        Returns:
            Tool execution result
        """
        ...

    def validate_params(self, params: dict[str, Any] | None) -> dict[str, Any]:
        """Validate and fill in default parameter values."""
        params = params or {}
        validated = {}

        for param in self._metadata.parameters:
            if param.name in params:
                validated[param.name] = params[param.name]
            elif param.default is not None:
                validated[param.name] = param.default
            elif param.required:
                raise ValueError(f"Required parameter '{param.name}' is missing")

        return validated

    async def emit_thought(
        self,
        thought_stream: "ThoughtStream | None",
        content: str,
        thought_type: str = "observation",
    ) -> None:
        """Helper to emit a thought if stream is available."""
        if thought_stream:
            from app.copilot.thoughts import Thought, ThoughtType

            thought = Thought(
                type=ThoughtType(thought_type),
                content=content,
                tool_name=self.name,
            )
            await thought_stream.emit(thought)
