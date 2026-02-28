import logging
from dataclasses import dataclass
from typing import Any

import yaml

from ..paths import resolve_config_path

logger = logging.getLogger(__name__)

DUCKDB_CONFIG_PATH = resolve_config_path("duckdb.yaml")


@dataclass
class DuckDBConfig:
    """DuckDB embedded analytics store configuration."""

    enabled: bool = True
    path: str = "data/local_store.duckdb"
    # Global startup behavior:
    # - "startup": run background sync on app startup
    # - "manual": never sync on startup; only via explicit /api/store/sync calls
    sync_mode: str = "startup"
    # Legacy key kept for backward compatibility in duckdb.yaml.
    auto_sync_on_startup: bool = True
    sync_chunk_size: int = 10_000
    max_sync_rows: int = 2_000_000  # Safety net -- warns + stops if hit
    query_concurrency: int = 8  # Max concurrent DuckDB read queries
    sync_workers: int = 1  # Parallel readers per dataset sync


def load_duckdb_config() -> DuckDBConfig:
    """Load DuckDB config from YAML file with hardcoded defaults."""
    config = DuckDBConfig()

    if DUCKDB_CONFIG_PATH.exists():
        try:
            with DUCKDB_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("duckdb"):
                db_config = yaml_config["duckdb"]
                legacy_auto_sync = db_config.get("auto_sync_on_startup")
                if "sync_mode" in db_config:
                    sync_mode = db_config.get("sync_mode", "startup")
                else:
                    # Backward compatibility: infer mode from legacy boolean.
                    sync_mode = "startup" if legacy_auto_sync is not False else "manual"
                config = DuckDBConfig(
                    enabled=db_config.get("enabled", True),
                    path=db_config.get("path", "data/local_store.duckdb"),
                    sync_mode=sync_mode,
                    auto_sync_on_startup=legacy_auto_sync if legacy_auto_sync is not None else True,
                    sync_chunk_size=db_config.get("sync_chunk_size", 10_000),
                    max_sync_rows=db_config.get("max_sync_rows", 2_000_000),
                    query_concurrency=db_config.get("query_concurrency", 8),
                    sync_workers=db_config.get("sync_workers", 1),
                )
                logger.info("Loaded DuckDB config from %s", DUCKDB_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load DuckDB YAML config: %s", e)

    return config


duckdb_config = load_duckdb_config()
