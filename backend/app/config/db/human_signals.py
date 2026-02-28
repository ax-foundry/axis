import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

from ..env import settings
from ..paths import resolve_config_path
from ._base import BaseDBImportConfig, parse_base_fields

logger = logging.getLogger(__name__)

HUMAN_SIGNALS_CONFIG_PATH = resolve_config_path("human_signals_db.yaml")


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

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled (either via auto_load or legacy auto_connect)."""
        return (self.auto_load or self.auto_connect) and self.is_configured


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
                )

                config = HumanSignalsDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_connect=db_config.get("auto_connect", False),
                    auto_load=db_config.get("auto_load", False),
                    schema_name=db_config.get("schema", "public"),
                    table=db_config.get("table"),
                    visible_metrics=db_config.get("visible_metrics", []) or [],
                    visible_kpis=db_config.get("visible_kpis", []) or [],
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
