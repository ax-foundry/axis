import logging
from dataclasses import asdict, dataclass, field
from typing import Any

import yaml

from .paths import resolve_config_path

logger = logging.getLogger(__name__)

METRIC_DEFINITIONS_PATH = resolve_config_path("metric_definitions.yaml")


@dataclass
class MetricDefinition:
    """A single metric's description and documentation link."""

    description: str = ""
    link: str = ""
    agents: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-friendly dict."""
        return asdict(self)


@dataclass
class MetricDefinitionsConfig:
    """Definitions for metrics across all domains."""

    monitoring: dict[str, MetricDefinition] = field(default_factory=dict)
    kpi: dict[str, MetricDefinition] = field(default_factory=dict)
    signals: dict[str, MetricDefinition] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize all domains to JSON-friendly dict."""
        return {
            "monitoring": {k: v.to_dict() for k, v in self.monitoring.items()},
            "kpi": {k: v.to_dict() for k, v in self.kpi.items()},
            "signals": {k: v.to_dict() for k, v in self.signals.items()},
        }


def _parse_domain(data: dict[str, Any] | None) -> dict[str, MetricDefinition]:
    """Parse a single domain's metric definitions from raw YAML dict."""
    if not data or not isinstance(data, dict):
        return {}
    result: dict[str, MetricDefinition] = {}
    for name, entry in data.items():
        if isinstance(entry, dict):
            result[name] = MetricDefinition(
                description=str(entry.get("description", "")),
                link=str(entry.get("link", "")),
                agents=entry.get("agents") or [],
            )
        else:
            # Bare key with no fields — just register the name
            result[str(name)] = MetricDefinition()
    return result


def load_metric_definitions() -> MetricDefinitionsConfig:
    """Load metric definitions from YAML config.

    Returns an empty config if the file is missing or malformed.
    """
    path = METRIC_DEFINITIONS_PATH
    if not path.exists():
        logger.debug("No metric_definitions.yaml found at %s — using empty defaults", path)
        return MetricDefinitionsConfig()

    try:
        with path.open() as f:
            raw = yaml.safe_load(f) or {}
    except Exception:
        logger.exception("Failed to load metric_definitions.yaml")
        return MetricDefinitionsConfig()

    defs = raw.get("metric_definitions", raw)
    if not isinstance(defs, dict):
        logger.warning("metric_definitions.yaml: expected dict, got %s", type(defs).__name__)
        return MetricDefinitionsConfig()

    return MetricDefinitionsConfig(
        monitoring=_parse_domain(defs.get("monitoring")),
        kpi=_parse_domain(defs.get("kpi")),
        signals=_parse_domain(defs.get("signals")),
    )


metric_definitions_config = load_metric_definitions()
