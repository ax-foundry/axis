import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

from .paths import resolve_config_path

logger = logging.getLogger(__name__)

# YAML config file path for agents
AGENTS_CONFIG_PATH = resolve_config_path("agents.yaml")


@dataclass
class AgentConfig:
    """Agent display configuration for the SourceSelector."""

    name: str = ""
    label: str = ""
    role: str | None = None
    avatar: str | None = None
    description: str | None = None
    biography: str | None = None
    active: bool = True
    trace_names: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON serialization."""
        return {
            "name": self.name,
            "label": self.label,
            "role": self.role,
            "avatar": self.avatar,
            "description": self.description,
            "biography": self.biography,
            "active": self.active,
            "trace_names": self.trace_names,
        }


def load_agents_config() -> list[AgentConfig]:
    """Load agent registry from YAML config file.

    Returns an empty list if the file doesn't exist or is malformed.
    """
    if not AGENTS_CONFIG_PATH.exists():
        logger.info(f"No agents config found at {AGENTS_CONFIG_PATH}, using empty registry")
        return []

    try:
        with AGENTS_CONFIG_PATH.open() as f:
            yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

        agents_data = yaml_config.get("agents", [])
        if not isinstance(agents_data, list):
            logger.warning("agents.yaml 'agents' key is not a list, using empty registry")
            return []

        agents = []
        for entry in agents_data:
            if isinstance(entry, dict) and entry.get("name"):
                agents.append(
                    AgentConfig(
                        name=entry["name"],
                        label=str(entry.get("label", entry["name"])),
                        role=entry.get("role"),
                        avatar=entry.get("avatar"),
                        description=entry.get("description"),
                        biography=entry.get("biography"),
                        active=entry.get("active", True),
                        trace_names=entry.get("trace_names", []),
                    )
                )

        logger.info(f"Loaded {len(agents)} agent(s) from {AGENTS_CONFIG_PATH}")
        return agents
    except Exception as e:
        logger.warning(f"Failed to load agents config: {e}")
        return []


# Global agents config instance
agents_config = load_agents_config()
