"""Shared base class and parser for all database import configs."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class BaseDBImportConfig:
    """Base database import configuration with shared fields.

    All database configs (eval, monitoring, human_signals) inherit from this.
    """

    # Connection
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str = "prefer"
    db_type: str = "postgres"

    # Query
    dataset_query: str | None = None
    results_query: str | None = None
    query_timeout: int = 60
    row_limit: int = 10000

    # Import
    column_rename_map: dict[str, str] = field(default_factory=dict)
    partition_column: str | None = None
    refresh_interval_minutes: int = 0
    incremental_column: str | None = None

    # Table restrictions and filters (for wizard UI)
    tables: list[str] = field(default_factory=list)
    filters: list[dict[str, str]] = field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        """Check if enough config is provided to connect."""
        if self.url:
            return True
        return bool(self.host and self.database)

    @property
    def has_query(self) -> bool:
        """Check if both split SQL queries are configured."""
        return bool(
            self.dataset_query
            and self.dataset_query.strip()
            and self.results_query
            and self.results_query.strip()
        )


def parse_base_fields(
    db_config: dict[str, Any],
    *,
    env_password: str | None = None,
    env_url: str | None = None,
) -> dict[str, Any]:
    """Parse shared BaseDBImportConfig fields from a YAML dict.

    Args:
        db_config: Parsed YAML dictionary for the database block.
        env_password: Fallback password from env var (used when YAML value is empty).
        env_url: Fallback URL from env var (used when YAML value is empty).
    """
    query_timeout = min(db_config.get("query_timeout", 60), 120)
    row_limit = min(db_config.get("row_limit", 10000), 50000)
    return {
        "url": db_config.get("url") or env_url,
        "host": db_config.get("host"),
        "port": db_config.get("port", 5432),
        "database": db_config.get("database"),
        "username": db_config.get("username"),
        "password": db_config.get("password") or env_password,
        "ssl_mode": db_config.get("ssl_mode", "prefer"),
        "db_type": db_config.get("db_type", "postgres"),
        "dataset_query": db_config.get("dataset_query"),
        "results_query": db_config.get("results_query"),
        "query_timeout": query_timeout,
        "row_limit": row_limit,
        # YAML "columns" key -> column_rename_map (backward compat)
        "column_rename_map": db_config.get("columns", {}) or {},
        "partition_column": db_config.get("partition_column"),
        "refresh_interval_minutes": db_config.get("refresh_interval_minutes", 0),
        "incremental_column": db_config.get("incremental_column"),
        "tables": db_config.get("tables", []) or [],
        "filters": db_config.get("filters", []) or [],
    }
