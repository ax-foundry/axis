import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

from ..env import settings
from ..paths import resolve_config_path
from ._base import BaseDBImportConfig, parse_base_fields

logger = logging.getLogger(__name__)

HUMAN_SIGNALS_CONFIG_PATH = resolve_config_path("human_signals_db.yaml")

# Large, detail-only fields that can inflate an aggregated case row. Each maps
# to the source_names whose cases keep the field: "*" keeps it for every source,
# [] omits it for all. The raw input blob is omitted by default — it is often
# the largest field and unused by the aggregate views; keep the conversation
# (the primary content) and the small structured output. Override per source
# via the `heavy_field_sources` YAML block.
DEFAULT_HEAVY_FIELD_SOURCES: dict[str, list[str]] = {
    "additional_input": [],
    "Full_Conversation": ["*"],
    "additional_output": ["*"],
}


@dataclass
class HumanSignalsDBConfig(BaseDBImportConfig):
    """Human signals database configuration loaded from YAML or env vars."""

    enabled: bool = False
    auto_connect: bool = False
    auto_load: bool = False
    schema_name: str = "public"
    table: str | None = None
    visible_metrics: list[str] = field(default_factory=list)
    visible_kpis: list[str] = field(default_factory=list)
    heavy_field_sources: dict[str, list[str]] = field(
        default_factory=lambda: dict(DEFAULT_HEAVY_FIELD_SOURCES)
    )

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled (either via auto_load or legacy auto_connect)."""
        return (self.auto_load or self.auto_connect) and self.is_configured

    def keeps_heavy_field(self, field_name: str, source_name: str | None) -> bool:
        """Whether a heavy detail field is stored on a case for the given source.

        Kept when the field's allowlist contains "*" or the case's source_name.
        Fields with no policy default to kept, so unlisted callers are
        unaffected; the omit decision applies only to entries in the map.
        """
        allow = self.heavy_field_sources.get(field_name, ["*"])
        return "*" in allow or (source_name or "") in allow


def load_human_signals_db_config() -> HumanSignalsDBConfig:
    """Load human signals database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = HumanSignalsDBConfig()

    # Try loading from YAML config file first
    if HUMAN_SIGNALS_CONFIG_PATH.exists():
        try:
            with HUMAN_SIGNALS_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("human_signals_db"):
                db_config = yaml_config["human_signals_db"]
                base = parse_base_fields(
                    db_config,
                    env_password=settings.human_signals_db_password,
                    env_url=settings.human_signals_db_url,
                    dataset="human_signals_db",
                )

                # Merge YAML overrides over the defaults per field, so a single
                # field's policy can be changed without restating the rest.
                heavy_field_sources = dict(DEFAULT_HEAVY_FIELD_SOURCES)
                heavy_field_sources.update(db_config.get("heavy_field_sources") or {})

                config = HumanSignalsDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_connect=db_config.get("auto_connect", False),
                    auto_load=db_config.get("auto_load", False),
                    schema_name=db_config.get("schema", "public"),
                    table=db_config.get("table"),
                    visible_metrics=db_config.get("visible_metrics", []) or [],
                    visible_kpis=db_config.get("visible_kpis", []) or [],
                    heavy_field_sources=heavy_field_sources,
                )
                logger.info("Loaded human signals DB config from %s", HUMAN_SIGNALS_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load YAML config: %s", e)

    # Fall back to env vars
    if settings.human_signals_db_url or settings.human_signals_db_host:
        config = HumanSignalsDBConfig(
            enabled=True,
            auto_connect=settings.human_signals_db_auto_connect,
            auto_load=False,
            host=settings.human_signals_db_host,
            port=settings.human_signals_db_port,
            database=settings.human_signals_db_name,
            username=settings.human_signals_db_user,
            password=settings.human_signals_db_password,
            schema_name=settings.human_signals_db_schema,
            table=settings.human_signals_db_table,
            ssl_mode=settings.human_signals_db_ssl_mode,
            url=settings.human_signals_db_url,
        )
        logger.info("Loaded human signals DB config from environment variables")

    return config


human_signals_db_config = load_human_signals_db_config()
