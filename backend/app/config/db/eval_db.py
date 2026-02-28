import logging
from dataclasses import dataclass
from typing import Any

import yaml

from ..env import settings
from ..paths import resolve_config_path
from ._base import BaseDBImportConfig, parse_base_fields

logger = logging.getLogger(__name__)

EVAL_DB_CONFIG_PATH = resolve_config_path("eval_db.yaml")


@dataclass
class EvalDBConfig(BaseDBImportConfig):
    """Evaluation database configuration loaded from YAML or env vars."""

    enabled: bool = False
    auto_load: bool = False
    eval_runner_enabled: bool = True


def load_eval_db_config() -> EvalDBConfig:
    """Load eval database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = EvalDBConfig()

    # Try loading from YAML config file first
    if EVAL_DB_CONFIG_PATH.exists():
        try:
            with EVAL_DB_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("eval_db"):
                db_config = yaml_config["eval_db"]
                base = parse_base_fields(
                    db_config,
                    env_password=settings.eval_db_password,
                    env_url=settings.eval_db_url,
                )

                config = EvalDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_load=db_config.get("auto_load", False),
                    eval_runner_enabled=db_config.get("eval_runner_enabled", True),
                )
                logger.info("Loaded eval DB config from %s", EVAL_DB_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load eval DB YAML config: %s", e)

    # Fall back to env vars
    if settings.eval_db_url or settings.eval_db_host:
        query_timeout = min(settings.eval_db_query_timeout, 120)
        row_limit = min(settings.eval_db_row_limit, 50000)

        config = EvalDBConfig(
            enabled=True,
            auto_load=settings.eval_db_auto_load,
            url=settings.eval_db_url,
            host=settings.eval_db_host,
            port=settings.eval_db_port,
            database=settings.eval_db_name,
            username=settings.eval_db_user,
            password=settings.eval_db_password,
            ssl_mode=settings.eval_db_ssl_mode,
            dataset_query=settings.eval_db_dataset_query,
            results_query=settings.eval_db_results_query,
            query_timeout=query_timeout,
            row_limit=row_limit,
        )
        logger.info("Loaded eval DB config from environment variables")

    return config


eval_db_config = load_eval_db_config()
