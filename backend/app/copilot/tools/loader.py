import json
import logging
from pathlib import Path

from app.copilot.tools.base import ToolMetadata

logger = logging.getLogger("axis.copilot.tools.loader")

# Default tools directory path
DEFAULT_TOOLS_DIR = Path(__file__).parent.parent.parent / "tools"


class ToolLoader:
    """Loads tool definitions from the filesystem."""

    def __init__(self, tools_dir: Path | None = None) -> None:
        """Initialize the tool loader."""
        self.tools_dir = tools_dir or DEFAULT_TOOLS_DIR

    def discover_tools(self) -> list[ToolMetadata]:
        """Discover all tools in the tools directory."""
        tools = []

        if not self.tools_dir.exists():
            logger.warning(f"Tools directory does not exist: {self.tools_dir}")
            return tools

        for tool_dir in self.tools_dir.iterdir():
            if tool_dir.is_dir():
                metadata = self._load_tool_metadata(tool_dir)
                if metadata:
                    tools.append(metadata)

        logger.info(f"Discovered {len(tools)} tools in {self.tools_dir}")
        return tools

    def _load_tool_metadata(self, tool_dir: Path) -> ToolMetadata | None:
        """Load tool metadata from a tool directory."""
        metadata_file = tool_dir / "metadata.json"

        if not metadata_file.exists():
            logger.debug(f"No metadata.json in {tool_dir}")
            return None

        try:
            with metadata_file.open() as f:
                data = json.load(f)

            metadata = ToolMetadata.from_dict(data)

            # Load optional instructions
            instructions_file = tool_dir / "TOOL.md"
            if instructions_file.exists():
                with instructions_file.open() as f:
                    metadata.instructions = f.read()

            logger.debug(f"Loaded tool: {metadata.name}")
            return metadata

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {metadata_file}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error loading tool from {tool_dir}: {e}")
            return None

    def load_tool(self, tool_name: str) -> ToolMetadata | None:
        """Load a specific tool by name."""
        tool_dir = self.tools_dir / tool_name

        if not tool_dir.exists():
            logger.warning(f"Tool directory not found: {tool_dir}")
            return None

        return self._load_tool_metadata(tool_dir)
