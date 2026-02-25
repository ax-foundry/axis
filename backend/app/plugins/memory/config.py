import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any, ClassVar

import yaml

from app.config import resolve_config_path

logger = logging.getLogger(__name__)

MEMORY_CONFIG_PATH = resolve_config_path("memory.yaml")

# Default color palette for auto-assigning action colors
_DEFAULT_ACTION_PALETTE = [
    "#3498DB",
    "#E74C3C",
    "#F39C12",
    "#8B9F4F",
    "#9B59B6",
    "#1ABC9C",
    "#D4AF37",
    "#7F8C8D",
]

# UI roles: declarative documentation of which roles the frontend depends on
_UI_ROLES: dict[str, list[str]] = {
    "table": ["name", "category", "action", "product", "threshold_type", "status"],
    "detail": ["group_by", "confidence", "quality", "compound_trigger"],
    "hard_stops": ["action", "mitigants", "group_by", "category", "product", "description"],
    "quality": ["quality", "threshold_type", "name", "group_by", "description"],
    "diagram": ["group_by", "name", "action", "mitigants"],
    "summary": ["action", "product", "group_by", "mitigants"],
    "batches": ["batch", "status", "category", "created_at"],
}


@dataclass
class MemoryFieldRoles:
    """Maps functional roles to CSV column names.

    Defaults match current column names if omitted from config.
    """

    id: str = "id"
    name: str = "rule_name"
    action: str = "action"
    category: str = "risk_category"
    group_by: str = "risk_factor"
    product: str = "product_type"
    quality: str = "decision_quality"
    threshold_type: str = "threshold_type"
    threshold_value: str = "threshold"
    description: str = "outcome_description"
    mitigants: str = "mitigants"
    status: str = "ingestion_status"
    batch: str = "batch_id"
    agent: str = "agent_name"
    created_at: str = "created_at"
    confidence: str = "confidence"
    compound_trigger: str = "compound_trigger"
    source: str = "source"
    source_type: str = "source_type"
    historical_exceptions: str = "historical_exceptions"
    data_fields: str = "data_fields"
    ingestion_error: str = "ingestion_error"
    ingested_at: str = "ingested_at"

    # All known role names (class-level constant)
    ALL_ROLES: ClassVar[list[str]] = [
        "id",
        "name",
        "action",
        "category",
        "group_by",
        "product",
        "quality",
        "threshold_type",
        "threshold_value",
        "description",
        "mitigants",
        "status",
        "batch",
        "agent",
        "created_at",
        "confidence",
        "compound_trigger",
        "source",
        "source_type",
        "historical_exceptions",
        "data_fields",
        "ingestion_error",
        "ingested_at",
    ]

    def to_dict(self) -> dict[str, str]:
        """Return role->column mapping as a plain dict."""
        return {role: getattr(self, role) for role in self.ALL_ROLES}

    def column_for(self, role: str) -> str:
        """Get the CSV column name for a given role."""
        return getattr(self, role, role)


@dataclass
class MemoryConfig:
    """Memory / rule-extractions display configuration."""

    # Field role mappings
    field_roles: MemoryFieldRoles = field(default_factory=MemoryFieldRoles)

    # Roles that MUST exist in uploaded data
    required_roles: list[str] = field(
        default_factory=lambda: ["id", "name", "action", "batch", "status"]
    )

    # Display labels for roles (auto-titlecased from role if omitted)
    labels: dict[str, str] = field(default_factory=dict)

    # Roles containing list/array data
    list_fields: list[str] = field(default_factory=lambda: ["mitigants", "data_fields"])

    # Which roles appear as filter dropdowns
    filter_roles: list[str] = field(
        default_factory=lambda: ["action", "product", "category", "threshold_type", "status"]
    )

    # Hard stops config
    hard_stops: dict[str, Any] = field(
        default_factory=lambda: {"action_value": "decline", "require_empty_mitigants": True}
    )

    # Quality values
    quality_values: dict[str, str] = field(
        default_factory=lambda: {
            "aligned": "aligned",
            "divergent": "divergent",
            "partial": "partial",
        }
    )

    # Soft threshold value
    soft_threshold_value: str = "soft"

    # action_name -> hex color
    action_colors: dict[str, str] = field(default_factory=dict)

    # Contradictory pairs
    contradictory_pairs: list[list[str]] = field(default_factory=list)

    @property
    def contradictory_frozensets(self) -> set[frozenset[str]]:
        """Convert contradictory_pairs list to a set of frozensets for O(1) lookup."""
        return {frozenset(pair) for pair in self.contradictory_pairs if len(pair) == 2}

    def get_action_color(self, action: str, index: int = 0) -> str:
        """Get color for an action. Falls back to palette cycling."""
        if action in self.action_colors:
            return self.action_colors[action]
        return _DEFAULT_ACTION_PALETTE[index % len(_DEFAULT_ACTION_PALETTE)]

    def label(self, role: str) -> str:
        """Get display label for a role. Falls back to titlecased role name."""
        if role in self.labels:
            return self.labels[role]
        return role.replace("_", " ").title()

    def validate_required_roles(self, record: dict[str, Any]) -> list[str]:
        """Return list of missing required role keys in a record."""
        return [role for role in self.required_roles if role not in record]

    def to_api_dict(self) -> dict[str, Any]:
        """Build the response dict for the /api/memory/config endpoint."""
        # Labels for all roles
        all_labels = {role: self.label(role) for role in MemoryFieldRoles.ALL_ROLES}

        return {
            "field_roles": self.field_roles.to_dict(),
            "required_roles": self.required_roles,
            "labels": all_labels,
            "list_fields": self.list_fields,
            "filter_roles": self.filter_roles,
            "hard_stops": self.hard_stops,
            "quality_values": self.quality_values,
            "soft_threshold_value": self.soft_threshold_value,
            "action_colors": self.action_colors,
            "contradictory_pairs": self.contradictory_pairs,
            "ui_roles": _UI_ROLES,
        }

    @property
    def config_hash(self) -> str:
        """MD5 hash of the API response dict for cache invalidation."""
        response_dict = self.to_api_dict()
        return hashlib.md5(json.dumps(response_dict, sort_keys=True).encode()).hexdigest()


def _validate_memory_config(config: MemoryConfig) -> None:
    """Validate memory config at load time. Logs errors for invalid config."""
    roles_dict = config.field_roles.to_dict()
    valid_roles = set(MemoryFieldRoles.ALL_ROLES)

    # Check field_roles values are unique (no two roles -> same column)
    seen: dict[str, str] = {}
    for role, col in roles_dict.items():
        if col in seen:
            logger.error(
                "Memory config: duplicate column '%s' mapped by both '%s' and '%s'",
                col,
                seen[col],
                role,
            )
        seen[col] = role

    # Validate required_roles are valid role names
    for role in config.required_roles:
        if role not in valid_roles:
            logger.error("Memory config: required_role '%s' is not a valid role name", role)

    # Validate list_fields are valid role names
    for role in config.list_fields:
        if role not in valid_roles:
            logger.error("Memory config: list_field '%s' is not a valid role name", role)

    # Validate filter_roles are valid role names
    for role in config.filter_roles:
        if role not in valid_roles:
            logger.error("Memory config: filter_role '%s' is not a valid role name", role)

    # Validate hard_stops has required keys
    hs = config.hard_stops
    if "action_value" not in hs or not isinstance(hs.get("action_value"), str):
        logger.error("Memory config: hard_stops.action_value must be a string")
    if "require_empty_mitigants" not in hs or not isinstance(
        hs.get("require_empty_mitigants"), bool
    ):
        logger.error("Memory config: hard_stops.require_empty_mitigants must be a boolean")

    # Validate quality_values has required keys
    qv = config.quality_values
    for key in ("aligned", "divergent", "partial"):
        if key not in qv:
            logger.error("Memory config: quality_values missing required key '%s'", key)


def load_memory_config() -> MemoryConfig:
    """Load memory config from YAML file."""
    config = MemoryConfig()

    if MEMORY_CONFIG_PATH.exists():
        try:
            with MEMORY_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            mem = yaml_config.get("memory", {})
            if not isinstance(mem, dict):
                _validate_memory_config(config)
                return config

            # Parse field_roles
            raw_roles = mem.get("field_roles", {})
            if isinstance(raw_roles, dict):
                fr_kwargs: dict[str, str] = {}
                for role in MemoryFieldRoles.ALL_ROLES:
                    if role in raw_roles:
                        fr_kwargs[role] = str(raw_roles[role])
                config.field_roles = MemoryFieldRoles(**fr_kwargs)

            # Parse required_roles
            raw_req = mem.get("required_roles")
            if isinstance(raw_req, list):
                config.required_roles = [str(r) for r in raw_req if r]

            # Parse labels
            raw_labels = mem.get("labels", {})
            if isinstance(raw_labels, dict):
                config.labels = {str(k): str(v) for k, v in raw_labels.items()}

            # Parse list_fields
            raw_lf = mem.get("list_fields")
            if isinstance(raw_lf, list):
                config.list_fields = [str(r) for r in raw_lf if r]

            # Parse filter_roles
            raw_fr = mem.get("filter_roles")
            if isinstance(raw_fr, list):
                config.filter_roles = [str(r) for r in raw_fr if r]

            # Parse hard_stops
            raw_hs = mem.get("hard_stops")
            if isinstance(raw_hs, dict):
                config.hard_stops = {
                    "action_value": str(raw_hs.get("action_value", "decline")),
                    "require_empty_mitigants": bool(raw_hs.get("require_empty_mitigants", True)),
                }

            # Parse quality_values
            raw_qv = mem.get("quality_values")
            if isinstance(raw_qv, dict):
                config.quality_values = {str(k): str(v) for k, v in raw_qv.items()}

            # Parse soft_threshold_value
            raw_stv = mem.get("soft_threshold_value")
            if raw_stv is not None:
                config.soft_threshold_value = str(raw_stv)

            # Parse action_colors
            raw_colors = mem.get("action_colors", {})
            if isinstance(raw_colors, dict):
                config.action_colors = {str(k): str(v) for k, v in raw_colors.items()}

            # Parse contradictory_pairs
            raw_pairs = mem.get("contradictory_pairs", [])
            if isinstance(raw_pairs, list):
                config.contradictory_pairs = [
                    [str(a) for a in pair]
                    for pair in raw_pairs
                    if isinstance(pair, list) and len(pair) == 2
                ]

            logger.info("Loaded memory config from %s", MEMORY_CONFIG_PATH)
        except Exception as e:
            logger.warning("Failed to load memory YAML config: %s", e)

    _validate_memory_config(config)
    return config


memory_config = load_memory_config()
