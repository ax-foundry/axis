import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Hard ceiling on rows loaded from any import query. Sized against the Cloud Run
# memory budget, not against what the source table holds.
MAX_ROW_LIMIT = 50000


def clamp_row_limit(requested: int, *, dataset: str) -> int:
    """Clamp a configured row_limit to MAX_ROW_LIMIT, logging when it bites.

    Silently reducing the value hides the fact that a sync is truncating: the
    operator sets 500000, the import loads 50000, and nothing in the logs or the
    config surface says otherwise. Warn instead so the ceiling is visible.
    """
    if requested > MAX_ROW_LIMIT:
        logger.warning(
            "%s: configured row_limit %d exceeds the %d ceiling - loading at most %d rows. "
            "Rows beyond the limit are dropped by the import query's ORDER BY.",
            dataset,
            requested,
            MAX_ROW_LIMIT,
            MAX_ROW_LIMIT,
        )
        return MAX_ROW_LIMIT
    return requested


@dataclass
class BaseDBImportConfig:
    """Base database import configuration with shared fields.

    All database configs (eval, monitoring, human_signals) inherit from this.

    Postgres YAML uses flat fields (host, port, database, username, password,
    ssl_mode). BigQuery YAML uses a nested ``connection_params`` dict:

        db_type: bigquery
        connection_params:
          project_id: my-project
          dataset: my_dataset
          location: US
    """

    # Connection (Postgres flat fields — zero-touch backward compat)
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str = "prefer"
    db_type: str = "postgres"

    # Generic params dict for non-Postgres backends (BigQuery, Snowflake, …)
    connection_params: dict[str, Any] = field(default_factory=dict)

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

    # Incremental integrity (split-sync tables)
    # Natural key per table: incremental slices upsert (DELETE+INSERT by key)
    # instead of blind-appending, so re-pulled rows replace stale copies.
    dataset_primary_key: list[str] = field(default_factory=list)
    results_primary_key: list[str] = field(default_factory=list)
    # Re-pull window: incremental queries restart this many minutes before the
    # stored watermark, so late-arriving/updated source rows aren't skipped by
    # the strict `>` watermark comparison. Only applied when the table has a
    # primary key configured (lag without upsert would duplicate rows).
    incremental_lag_minutes: int = 120
    # Periodic full-rebuild backstop (hours between forced full syncs);
    # 0 disables it.
    full_rebuild_interval_hours: int = 0

    # Table restrictions and filters (for wizard UI)
    tables: list[str] = field(default_factory=list)
    filters: list[dict[str, str]] = field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        """Check if enough config is provided to connect."""
        if self.db_type == "bigquery":
            return bool(self.connection_params)
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
    dataset: str = "db import",
) -> dict[str, Any]:
    """Parse shared BaseDBImportConfig fields from a YAML dict.

    Args:
        db_config: Parsed YAML dictionary for the database block.
        env_password: Fallback password from env var (used when YAML value is empty).
        env_url: Fallback URL from env var (used when YAML value is empty).
        dataset: Name used to identify this config in the row_limit warning.
    """
    query_timeout = min(db_config.get("query_timeout", 60), 120)
    row_limit = clamp_row_limit(db_config.get("row_limit", 10000), dataset=dataset)

    def _key_list(value: Any) -> list[str]:
        """Accept a single column name or a list of column names."""
        if not value:
            return []
        if isinstance(value, str):
            return [value]
        return [str(c) for c in value]

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
        "dataset_primary_key": _key_list(db_config.get("dataset_primary_key")),
        "results_primary_key": _key_list(db_config.get("results_primary_key")),
        "incremental_lag_minutes": db_config.get("incremental_lag_minutes", 120),
        "full_rebuild_interval_hours": db_config.get("full_rebuild_interval_hours", 0),
        "tables": db_config.get("tables", []) or [],
        "filters": db_config.get("filters", []) or [],
        "connection_params": db_config.get("connection_params", {}) or {},
    }
