import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).parent.parent.parent
CUSTOM_DIR: Path = Path(os.environ.get("AXIS_CUSTOM_DIR", str(_PROJECT_ROOT / "custom")))
_CONFIG_DIR = CUSTOM_DIR / "config"


def resolve_config_path(filename: str) -> Path:
    """Resolve config file path from custom/config/."""
    return _CONFIG_DIR / filename


def require_config_path(filename: str) -> Path:
    """Resolve and validate a config file exists.

    Raises FileNotFoundError with setup hint.
    """
    path = resolve_config_path(filename)
    if not path.exists():
        raise FileNotFoundError(
            f"Config file not found: {path}. Run 'make setup' to create config files."
        )
    return path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8500
    DEBUG: bool = True
    APP_NAME: str = "AXIS"

    # Feature flags
    copilot_enabled: bool = Field(
        default=True, description="Enable/disable the AI Copilot sidebar in the frontend."
    )

    # Plugins
    AXIS_PLUGINS_ENABLED: str = Field(
        default="*",
        description='Comma-separated plugin names to enable, or "*" for all. Empty string disables all.',
    )

    # Frontend URL for CORS
    FRONTEND_URL: str = "http://localhost:3500"
    FRONTEND_URLS: str | None = Field(
        default=None,
        description="Comma-separated list of additional frontend origins for CORS.",
    )

    # AI Configuration
    openai_api_base: str | None = Field(
        default=None, description="Optional base URL for OpenAI-compatible APIs."
    )
    openai_api_key: str | None = Field(
        default=None, description="OpenAI API key for LLM judge evaluation."
    )
    anthropic_api_key: str | None = Field(
        default=None, description="Anthropic API key for Claude-based judge evaluation."
    )
    gateway_api_key: str | None = Field(
        default=None, description="API key for the gateway or platform."
    )
    ai_toolkit_url: str | None = Field(default=None, description="Location of AI Toolkit Server")
    llm_model_name: str = Field(default="gpt-4", description="Default language model name.")
    embedding_model_name: str = Field(
        default="text-embedding-ada-002", description="Default embedding model name."
    )

    # Human Signals Database Configuration (env vars)
    human_signals_db_url: str | None = Field(
        default=None,
        description="Full PostgreSQL connection URL for human signals database (overrides individual settings).",
    )
    human_signals_db_host: str | None = Field(
        default=None, description="Human signals database host."
    )
    human_signals_db_port: int = Field(default=5432, description="Human signals database port.")
    human_signals_db_name: str | None = Field(
        default=None, description="Human signals database name."
    )
    human_signals_db_user: str | None = Field(
        default=None, description="Human signals database username."
    )
    human_signals_db_password: str | None = Field(
        default=None, description="Human signals database password."
    )
    human_signals_db_schema: str = Field(
        default="public", description="Human signals database schema."
    )
    human_signals_db_table: str | None = Field(
        default=None, description="Human signals database table name."
    )
    human_signals_db_ssl_mode: str = Field(
        default="prefer", description="SSL mode for human signals database connection."
    )
    human_signals_db_auto_connect: bool = Field(
        default=False, description="Auto-connect to human signals database on page load."
    )

    # Monitoring Database Configuration (env vars)
    monitoring_db_url: str | None = Field(
        default=None,
        description="Full PostgreSQL connection URL for monitoring database (overrides individual settings).",
    )
    monitoring_db_host: str | None = Field(default=None, description="Monitoring database host.")
    monitoring_db_port: int = Field(default=5432, description="Monitoring database port.")
    monitoring_db_name: str | None = Field(default=None, description="Monitoring database name.")
    monitoring_db_user: str | None = Field(
        default=None, description="Monitoring database username."
    )
    monitoring_db_password: str | None = Field(
        default=None, description="Monitoring database password."
    )
    monitoring_db_schema: str = Field(default="public", description="Monitoring database schema.")
    monitoring_db_table: str | None = Field(
        default=None, description="Monitoring database table name."
    )
    monitoring_db_ssl_mode: str = Field(
        default="prefer", description="SSL mode for monitoring database connection."
    )
    monitoring_db_auto_connect: bool = Field(
        default=False, description="Auto-connect to monitoring database on page load."
    )

    # Evaluation Database Configuration (env vars)
    eval_db_url: str | None = Field(
        default=None,
        description="Full PostgreSQL connection URL for eval database (overrides individual settings).",
    )
    eval_db_host: str | None = Field(default=None, description="Eval database host.")
    eval_db_port: int = Field(default=5432, description="Eval database port.")
    eval_db_name: str | None = Field(default=None, description="Eval database name.")
    eval_db_user: str | None = Field(default=None, description="Eval database username.")
    eval_db_password: str | None = Field(default=None, description="Eval database password.")
    eval_db_ssl_mode: str = Field(
        default="prefer", description="SSL mode for eval database connection."
    )
    eval_db_auto_load: bool = Field(
        default=False, description="Auto-load evaluation data from database on startup."
    )
    eval_db_dataset_query: str | None = Field(
        default=None, description="SQL query for evaluation_dataset table."
    )
    eval_db_results_query: str | None = Field(
        default=None, description="SQL query for evaluation_results table."
    )
    eval_db_query_timeout: int = Field(
        default=60, description="Query timeout in seconds (max 120)."
    )
    eval_db_row_limit: int = Field(default=10000, description="Maximum rows to load (max 50000).")

    # KPI Database Configuration (env vars)
    kpi_db_url: str | None = Field(
        default=None,
        description="Full PostgreSQL connection URL for KPI database (overrides individual settings).",
    )
    kpi_db_host: str | None = Field(default=None, description="KPI database host.")
    kpi_db_port: int = Field(default=5432, description="KPI database port.")
    kpi_db_name: str | None = Field(default=None, description="KPI database name.")
    kpi_db_user: str | None = Field(default=None, description="KPI database username.")
    kpi_db_password: str | None = Field(default=None, description="KPI database password.")
    kpi_db_ssl_mode: str = Field(
        default="prefer", description="SSL mode for KPI database connection."
    )
    kpi_db_auto_load: bool = Field(
        default=False, description="Auto-load KPI data from database on startup."
    )

    # Graph Database Configuration (FalkorDB)
    graph_db_host: str = Field(default="localhost", description="FalkorDB host.")
    graph_db_port: int = Field(default=6379, description="FalkorDB port.")
    graph_db_name: str = Field(default="knowledge_graph", description="Graph name inside FalkorDB.")
    graph_db_password: str | None = Field(default=None, description="FalkorDB password.")

    # Agent Replay Configuration (Langfuse)
    agent_replay_enabled: bool = Field(
        default=False, description="Enable agent replay plugin (off by default)."
    )
    langfuse_public_key: str | None = Field(
        default=None, description="Langfuse public key for agent replay."
    )
    langfuse_secret_key: str | None = Field(
        default=None, description="Langfuse secret key for agent replay."
    )
    langfuse_host: str = Field(
        default="https://cloud.langfuse.com", description="Langfuse API host."
    )

    # Agent Replay DB Configuration (env vars)
    agent_replay_db_enabled: bool = Field(
        default=False, description="Enable agent replay DB lookup."
    )
    agent_replay_db_url: str | None = Field(
        default=None, description="Full PostgreSQL connection URL for agent replay lookup DB."
    )
    agent_replay_db_host: str | None = Field(
        default=None, description="Agent replay lookup DB host."
    )
    agent_replay_db_port: int = Field(default=5432, description="Agent replay lookup DB port.")
    agent_replay_db_name: str | None = Field(
        default=None, description="Agent replay lookup DB name."
    )
    agent_replay_db_user: str | None = Field(
        default=None, description="Agent replay lookup DB username."
    )
    agent_replay_db_password: str | None = Field(
        default=None, description="Agent replay lookup DB password."
    )
    agent_replay_db_ssl_mode: str = Field(
        default="prefer", description="SSL mode for agent replay lookup DB."
    )
    agent_replay_db_schema: str = Field(
        default="public", description="Agent replay lookup DB schema."
    )
    agent_replay_db_table: str = Field(
        default="trace_lookup", description="Agent replay lookup DB table."
    )
    agent_replay_db_search_column: str = Field(
        default="", description="Column to match against the search query (empty = trace ID only)."
    )
    agent_replay_db_search_column_label: str = Field(
        default="", description="Display name for the search column in the frontend."
    )
    agent_replay_db_trace_id_column: str = Field(
        default="langfuse_trace_id", description="Column containing the Langfuse trace ID."
    )
    agent_replay_db_agent_name_column: str | None = Field(
        default=None, description="Column with agent name (null to disable)."
    )
    agent_replay_db_query_timeout: int = Field(
        default=10, description="Query timeout in seconds (max 30)."
    )
    agent_replay_db_connect_timeout: int = Field(
        default=10, description="Connect timeout in seconds (max 30)."
    )
    agent_replay_db_pool_min_size: int = Field(
        default=0, description="Min idle connections in pool."
    )
    agent_replay_db_pool_max_size: int = Field(
        default=5, description="Max connections in pool (max 20)."
    )

    # Theme Configuration (env vars)
    axis_theme_active: str | None = Field(
        default=None,
        description="Active theme palette name (e.g., 'sage_green', 'professional_blue').",
    )
    axis_theme_primary: str | None = Field(
        default=None, description="Override primary color (hex)."
    )
    axis_theme_primary_light: str | None = Field(
        default=None, description="Override primary light color (hex)."
    )
    axis_theme_primary_dark: str | None = Field(
        default=None, description="Override primary dark color (hex)."
    )
    axis_theme_primary_soft: str | None = Field(
        default=None, description="Override primary soft color (hex)."
    )
    axis_theme_primary_pale: str | None = Field(
        default=None, description="Override primary pale color (hex)."
    )
    axis_theme_accent_gold: str | None = Field(
        default=None, description="Override accent gold color (hex)."
    )
    axis_theme_accent_silver: str | None = Field(
        default=None, description="Override accent silver color (hex)."
    )
    axis_theme_hero_image: str | None = Field(
        default=None, description="URL or path to hero background image."
    )
    axis_theme_logo_url: str | None = Field(default=None, description="URL or path to logo image.")
    axis_theme_favicon_url: str | None = Field(default=None, description="URL or path to favicon.")
    axis_theme_app_icon_url: str | None = Field(
        default=None, description="URL or path to app icon (sidebar, etc.)."
    )
    # Hero image filter options
    axis_theme_hero_contrast: float | None = Field(
        default=None, description="Hero image contrast filter (1.0 = normal, 0.8 = less contrast)."
    )
    axis_theme_hero_saturation: float | None = Field(
        default=None,
        description="Hero image saturation filter (1.0 = normal, 0.8 = less saturated).",
    )
    axis_theme_hero_brightness: float | None = Field(
        default=None, description="Hero image brightness filter (1.0 = normal, 0.8 = darker)."
    )
    axis_theme_hero_opacity: float | None = Field(
        default=None,
        description="Hero image opacity (1.0 = fully visible, 0.5 = semi-transparent).",
    )
    axis_theme_hero_mode: str | None = Field(
        default=None,
        description="Hero section mode: 'dark' (default) or 'light' (white background).",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()


# YAML config file path
HUMAN_SIGNALS_CONFIG_PATH = resolve_config_path("human_signals_db.yaml")


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


def _parse_base_fields(db_config: dict[str, Any]) -> dict[str, Any]:
    """Parse shared BaseDBImportConfig fields from a YAML dict."""
    query_timeout = min(db_config.get("query_timeout", 60), 120)
    row_limit = min(db_config.get("row_limit", 10000), 50000)
    return {
        "url": db_config.get("url"),
        "host": db_config.get("host"),
        "port": db_config.get("port", 5432),
        "database": db_config.get("database"),
        "username": db_config.get("username"),
        "password": db_config.get("password"),
        "ssl_mode": db_config.get("ssl_mode", "prefer"),
        "db_type": db_config.get("db_type", "postgres"),
        "dataset_query": db_config.get("dataset_query"),
        "results_query": db_config.get("results_query"),
        "query_timeout": query_timeout,
        "row_limit": row_limit,
        # YAML "columns" key → column_rename_map (backward compat)
        "column_rename_map": db_config.get("columns", {}) or {},
        "partition_column": db_config.get("partition_column"),
        "refresh_interval_minutes": db_config.get("refresh_interval_minutes", 0),
        "incremental_column": db_config.get("incremental_column"),
        "tables": db_config.get("tables", []) or [],
        "filters": db_config.get("filters", []) or [],
    }


VALID_STORES = ("data", "monitoring", "human_signals")


def get_import_config(store: str) -> BaseDBImportConfig:
    """Return the DB import config for a given target store.

    Raises ValueError on unknown store.
    """
    registry: dict[str, BaseDBImportConfig] = {
        "data": eval_db_config,
        "monitoring": monitoring_db_config,
        "human_signals": human_signals_db_config,
    }
    if store not in registry:
        raise ValueError(f"Unknown store: {store!r}. Valid stores: {list(registry.keys())}")
    return registry[store]


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
                base = _parse_base_fields(db_config)

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
                logger.info(f"Loaded human signals DB config from {HUMAN_SIGNALS_CONFIG_PATH}")
                return config
        except Exception as e:
            logger.warning(f"Failed to load YAML config: {e}")

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


# Global human signals DB config instance
human_signals_db_config = load_human_signals_db_config()


# YAML config file path for monitoring
MONITORING_CONFIG_PATH = resolve_config_path("monitoring_db.yaml")


@dataclass
class AnomalyDetectionConfig:
    """Anomaly detection settings for monitoring trend data."""

    enabled: bool = False
    min_data_points: int = 5
    # Z-score
    z_score_enabled: bool = True
    z_score_threshold: float = 2.0
    z_score_severity: str = "warning"
    z_score_lookback_window: int = 20
    z_score_metrics: list[str] = field(default_factory=list)
    # Moving average
    ma_enabled: bool = True
    ma_window_size: int = 5
    ma_deviation_threshold: float = 0.15
    ma_severity: str = "warning"
    ma_metrics: list[str] = field(default_factory=list)
    # Rate of change
    roc_enabled: bool = True
    roc_threshold: float = 0.3
    roc_severity: str = "error"
    roc_metrics: list[str] = field(default_factory=list)


@dataclass
class MonitoringDBConfig(BaseDBImportConfig):
    """Monitoring database configuration loaded from YAML or env vars."""

    enabled: bool = False
    auto_connect: bool = False
    auto_load: bool = False
    schema_name: str = "public"
    table: str | None = None
    # Score thresholds for chart reference lines and health status
    thresholds_default_good: float = 0.7
    thresholds_default_pass: float = 0.5
    thresholds_per_source: dict[str, dict[str, float]] = field(default_factory=dict)
    # Anomaly detection config
    anomaly_detection: AnomalyDetectionConfig = field(default_factory=AnomalyDetectionConfig)
    visible_metrics: list[str] = field(default_factory=list)

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled (either via auto_load or legacy auto_connect)."""
        return (self.auto_load or self.auto_connect) and self.is_configured


def _parse_thresholds(
    db_config: dict[str, Any],
) -> tuple[float, float, dict[str, dict[str, float]]]:
    """Parse the thresholds section from monitoring_db YAML config.

    Returns (default_good, default_pass, per_source_dict).
    """
    default_good = 0.7
    default_pass = 0.5
    per_source: dict[str, dict[str, float]] = {}

    thresholds = db_config.get("thresholds")
    if isinstance(thresholds, dict):
        defaults = thresholds.get("default")
        if isinstance(defaults, dict):
            default_good = float(defaults.get("good", 0.7))
            default_pass = float(defaults.get("pass", 0.5))
        ps = thresholds.get("per_source")
        if isinstance(ps, dict):
            for source_name, vals in ps.items():
                if isinstance(vals, dict):
                    per_source[str(source_name)] = {
                        "good": float(vals.get("good", default_good)),
                        "pass": float(vals.get("pass", default_pass)),
                    }

    return default_good, default_pass, per_source


def _parse_anomaly_detection(db_config: dict[str, Any]) -> AnomalyDetectionConfig:
    """Parse the anomaly_detection section from monitoring_db YAML config."""
    config = AnomalyDetectionConfig()
    ad = db_config.get("anomaly_detection")
    if not isinstance(ad, dict):
        return config

    valid_severities = {"warning", "error"}

    def _sev(val: str, default: str) -> str:
        return val if val in valid_severities else default

    def _metrics_list(val: Any) -> list[str]:
        if isinstance(val, list):
            return [str(m) for m in val if m]
        return []

    z = ad.get("z_score", {}) if isinstance(ad.get("z_score"), dict) else {}
    ma = ad.get("moving_average", {}) if isinstance(ad.get("moving_average"), dict) else {}
    roc = ad.get("rate_of_change", {}) if isinstance(ad.get("rate_of_change"), dict) else {}

    return AnomalyDetectionConfig(
        enabled=bool(ad.get("enabled", False)),
        min_data_points=max(3, int(ad.get("min_data_points", 5))),
        z_score_enabled=bool(z.get("enabled", True)),
        z_score_threshold=float(z.get("threshold", 2.0)),
        z_score_severity=_sev(str(z.get("severity", "warning")), "warning"),
        z_score_lookback_window=int(z.get("lookback_window", 20)),
        z_score_metrics=_metrics_list(z.get("metrics")),
        ma_enabled=bool(ma.get("enabled", True)),
        ma_window_size=max(2, int(ma.get("window_size", 5))),
        ma_deviation_threshold=float(ma.get("deviation_threshold", 0.15)),
        ma_severity=_sev(str(ma.get("severity", "warning")), "warning"),
        ma_metrics=_metrics_list(ma.get("metrics")),
        roc_enabled=bool(roc.get("enabled", True)),
        roc_threshold=float(roc.get("threshold", 0.3)),
        roc_severity=_sev(str(roc.get("severity", "error")), "error"),
        roc_metrics=_metrics_list(roc.get("metrics")),
    )


def load_monitoring_db_config() -> MonitoringDBConfig:
    """Load monitoring database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = MonitoringDBConfig()

    # Try loading from YAML config file first
    if MONITORING_CONFIG_PATH.exists():
        try:
            with MONITORING_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("monitoring_db"):
                db_config = yaml_config["monitoring_db"]
                base = _parse_base_fields(db_config)

                t_good, t_pass, t_per_source = _parse_thresholds(db_config)
                anomaly_cfg = _parse_anomaly_detection(db_config)

                config = MonitoringDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_connect=db_config.get("auto_connect", False),
                    auto_load=db_config.get("auto_load", False),
                    schema_name=db_config.get("schema", "public"),
                    table=db_config.get("table"),
                    thresholds_default_good=t_good,
                    thresholds_default_pass=t_pass,
                    thresholds_per_source=t_per_source,
                    anomaly_detection=anomaly_cfg,
                    visible_metrics=db_config.get("visible_metrics", []) or [],
                )
                logger.info(f"Loaded monitoring DB config from {MONITORING_CONFIG_PATH}")
                return config
        except Exception as e:
            logger.warning(f"Failed to load monitoring YAML config: {e}")

    # Fall back to env vars
    if settings.monitoring_db_url or settings.monitoring_db_host:
        config = MonitoringDBConfig(
            enabled=True,
            auto_connect=settings.monitoring_db_auto_connect,
            auto_load=False,
            host=settings.monitoring_db_host,
            port=settings.monitoring_db_port,
            database=settings.monitoring_db_name,
            username=settings.monitoring_db_user,
            password=settings.monitoring_db_password,
            schema_name=settings.monitoring_db_schema,
            table=settings.monitoring_db_table,
            ssl_mode=settings.monitoring_db_ssl_mode,
            url=settings.monitoring_db_url,
        )
        logger.info("Loaded monitoring DB config from environment variables")

    return config


# Global monitoring DB config instance
monitoring_db_config = load_monitoring_db_config()


# YAML config file path for eval database
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
                base = _parse_base_fields(db_config)

                config = EvalDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_load=db_config.get("auto_load", False),
                    eval_runner_enabled=db_config.get("eval_runner_enabled", True),
                )
                logger.info(f"Loaded eval DB config from {EVAL_DB_CONFIG_PATH}")
                return config
        except Exception as e:
            logger.warning(f"Failed to load eval DB YAML config: {e}")

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


# Global eval DB config instance
eval_db_config = load_eval_db_config()


# YAML config file path for KPI database
KPI_DB_CONFIG_PATH = resolve_config_path("kpi_db.yaml")


@dataclass
class KpiDBConfig:
    """Agent KPI database configuration loaded from YAML or env vars.

    Simplified from EvalDBConfig: single query (no dataset/results split).
    """

    enabled: bool = False
    auto_load: bool = False
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str = "prefer"
    query: str | None = None  # Single query (no split)
    query_timeout: int = 60
    row_limit: int = 50000
    columns: dict[str, str] = field(default_factory=dict)
    db_type: str = "postgres"
    partition_column: str | None = None
    refresh_interval_minutes: int = 0
    incremental_column: str | None = None
    visible_kpis: list[str] = field(default_factory=list)  # Empty = show all
    visible_kpis_per_source: dict[str, list[str]] = field(
        default_factory=dict
    )  # Per-agent overrides
    # Display config
    card_display_value: str = "latest"  # latest | avg_7d | avg_30d
    trend_lines: list[str] = field(default_factory=lambda: ["daily", "avg_7d", "avg_30d"])
    kpi_overrides: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Per-source display overrides (card_display_value, trend_lines, kpi_overrides)
    display_per_source: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Category metadata: slug -> {display_name, icon}
    # When empty, categories are auto-discovered from kpi_category column in data.
    categories: dict[str, dict[str, str]] = field(default_factory=dict)
    # Composition chart definitions: stacked bar charts built from existing KPI values
    composition_charts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        """Check if enough config is provided to connect."""
        if self.url:
            return True
        return bool(self.host and self.database)

    @property
    def has_query(self) -> bool:
        """Check if a SQL query is configured."""
        return bool(self.query and self.query.strip())

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled and configured."""
        return self.auto_load and self.is_configured


def _parse_visible_kpis_per_source(raw: Any) -> dict[str, list[str]]:
    """Parse visible_kpis_per_source from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, list[str]] = {}
    for source, kpis in raw.items():
        if isinstance(kpis, list):
            result[str(source)] = [str(k) for k in kpis if k]
    return result


VALID_CARD_DISPLAY_VALUES = {"latest", "avg_7d", "avg_30d"}
VALID_TREND_LINES = {"daily", "avg_7d", "avg_30d"}
VALID_UNITS = {"percent", "seconds", "count", "score"}


def _parse_kpi_overrides(raw: Any) -> dict[str, dict[str, Any]]:
    """Parse per-KPI display overrides from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for kpi_name, overrides in raw.items():
        if not isinstance(overrides, dict):
            continue
        parsed: dict[str, Any] = {}
        if "card_display_value" in overrides:
            val = str(overrides["card_display_value"])
            if val in VALID_CARD_DISPLAY_VALUES:
                parsed["card_display_value"] = val
        if "trend_lines" in overrides and isinstance(overrides["trend_lines"], list):
            parsed["trend_lines"] = [
                str(t) for t in overrides["trend_lines"] if str(t) in VALID_TREND_LINES
            ]
        if "unit" in overrides:
            val = str(overrides["unit"])
            if val in VALID_UNITS:
                parsed["unit"] = val
        if "display_name" in overrides:
            parsed["display_name"] = str(overrides["display_name"])
        if "polarity" in overrides and overrides["polarity"] in (
            "higher_better",
            "lower_better",
        ):
            parsed["polarity"] = str(overrides["polarity"])
        if parsed:
            result[str(kpi_name)] = parsed
    return result


def _parse_categories(raw: Any) -> dict[str, dict[str, str]]:
    """Parse KPI category definitions from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, str]] = {}
    for slug, meta in raw.items():
        if not isinstance(meta, dict):
            continue
        result[str(slug)] = {
            "display_name": str(meta.get("display_name", slug.replace("_", " ").title())),
            "icon": str(meta.get("icon", "BarChart3")),
        }
    return result


def _parse_composition_charts(raw: Any) -> list[dict[str, Any]]:
    """Parse composition_charts list from YAML config.

    Each chart must have a title and a kpis list.
    """
    if not isinstance(raw, list):
        return []
    charts: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        title = entry.get("title")
        kpis = entry.get("kpis")
        if not title or not isinstance(kpis, list) or len(kpis) == 0:
            continue
        parsed_kpis = []
        for kpi in kpis:
            if isinstance(kpi, dict) and kpi.get("kpi_name"):
                parsed_kpis.append(
                    {
                        "kpi_name": str(kpi["kpi_name"]),
                        "label": str(kpi.get("label", kpi["kpi_name"])),
                        "color": str(kpi.get("color", "#6B7280")),
                    }
                )
        if not parsed_kpis:
            continue
        charts.append(
            {
                "title": str(title),
                "kpis": parsed_kpis,
                "show_remainder": bool(entry.get("show_remainder", False)),
                "remainder_label": str(entry.get("remainder_label", "Other")),
                "remainder_color": str(entry.get("remainder_color", "#6B7280")),
            }
        )
    return charts


def _parse_display_per_source(raw: Any) -> dict[str, dict[str, Any]]:
    """Parse per-source display overrides from YAML config.

    Each source can have card_display_value, trend_lines, and kpi_overrides.
    """
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for source_name, source_cfg in raw.items():
        if not isinstance(source_cfg, dict):
            continue
        parsed: dict[str, Any] = {}
        if "card_display_value" in source_cfg:
            val = str(source_cfg["card_display_value"])
            if val in VALID_CARD_DISPLAY_VALUES:
                parsed["card_display_value"] = val
        if "trend_lines" in source_cfg and isinstance(source_cfg["trend_lines"], list):
            parsed["trend_lines"] = [
                str(t) for t in source_cfg["trend_lines"] if str(t) in VALID_TREND_LINES
            ]
        if "kpi_overrides" in source_cfg:
            parsed["kpi_overrides"] = _parse_kpi_overrides(source_cfg["kpi_overrides"])
        if parsed:
            result[str(source_name)] = parsed
    return result


def load_kpi_db_config() -> KpiDBConfig:
    """Load KPI database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = KpiDBConfig()

    if KPI_DB_CONFIG_PATH.exists():
        try:
            with KPI_DB_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("kpi_db"):
                db_config = yaml_config["kpi_db"]
                query_timeout = min(db_config.get("query_timeout", 60), 120)
                row_limit = min(db_config.get("row_limit", 50000), 50000)

                config = KpiDBConfig(
                    enabled=db_config.get("enabled", False),
                    auto_load=db_config.get("auto_load", False),
                    url=db_config.get("url"),
                    host=db_config.get("host"),
                    port=db_config.get("port", 5432),
                    database=db_config.get("database"),
                    username=db_config.get("username"),
                    password=db_config.get("password"),
                    ssl_mode=db_config.get("ssl_mode", "prefer"),
                    query=db_config.get("query"),
                    query_timeout=query_timeout,
                    row_limit=row_limit,
                    columns=db_config.get("columns", {}),
                    partition_column=db_config.get("partition_column"),
                    refresh_interval_minutes=db_config.get("refresh_interval_minutes", 0),
                    incremental_column=db_config.get("incremental_column"),
                    visible_kpis=db_config.get("visible_kpis", []) or [],
                    visible_kpis_per_source=_parse_visible_kpis_per_source(
                        db_config.get("visible_kpis_per_source")
                    ),
                    card_display_value=(
                        str(db_config["card_display_value"])
                        if db_config.get("card_display_value") in VALID_CARD_DISPLAY_VALUES
                        else "latest"
                    ),
                    trend_lines=[
                        str(t)
                        for t in (db_config.get("trend_lines") or [])
                        if str(t) in VALID_TREND_LINES
                    ]
                    or ["daily", "avg_7d", "avg_30d"],
                    kpi_overrides=_parse_kpi_overrides(db_config.get("kpi_overrides")),
                    display_per_source=_parse_display_per_source(
                        db_config.get("display_per_source")
                    ),
                    categories=_parse_categories(db_config.get("categories")),
                    composition_charts=_parse_composition_charts(
                        db_config.get("composition_charts")
                    ),
                )
                logger.info(f"Loaded KPI DB config from {KPI_DB_CONFIG_PATH}")
                return config
        except Exception as e:
            logger.warning(f"Failed to load KPI DB YAML config: {e}")

    # Fall back to env vars
    if settings.kpi_db_url or settings.kpi_db_host:
        config = KpiDBConfig(
            enabled=True,
            auto_load=settings.kpi_db_auto_load,
            url=settings.kpi_db_url,
            host=settings.kpi_db_host,
            port=settings.kpi_db_port,
            database=settings.kpi_db_name,
            username=settings.kpi_db_user,
            password=settings.kpi_db_password,
            ssl_mode=settings.kpi_db_ssl_mode,
        )
        logger.info("Loaded KPI DB config from environment variables")

    return config


# Global KPI DB config instance
kpi_db_config = load_kpi_db_config()


# YAML config file path for DuckDB
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
    max_sync_rows: int = 2_000_000  # Safety net — warns + stops if hit
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
                logger.info(f"Loaded DuckDB config from {DUCKDB_CONFIG_PATH}")
                return config
        except Exception as e:
            logger.warning(f"Failed to load DuckDB YAML config: {e}")

    return config


# Global DuckDB config instance
duckdb_config = load_duckdb_config()


# YAML config file path for theme
THEME_CONFIG_PATH = resolve_config_path("theme.yaml")


@dataclass
class ThemePalette:
    """Theme palette colors."""

    name: str = "Sage Green"
    primary: str = "#8B9F4F"
    primaryLight: str = "#A4B86C"
    primaryDark: str = "#6B7A3A"
    primarySoft: str = "#B8C78A"
    primaryPale: str = "#D4E0B8"
    accentGold: str = "#D4AF37"
    accentSilver: str = "#B8C5D3"
    # Hero/branding
    heroImage: str | None = None  # URL or path to hero background image
    logoUrl: str | None = None  # URL or path to logo
    faviconUrl: str | None = None  # URL or path to favicon
    appIconUrl: str | None = None  # URL or path to app icon (used in sidebar, etc.)
    # Hero image filters (CSS filter values)
    heroContrast: float | None = None  # 1.0 = normal, 0.8 = less contrast
    heroSaturation: float | None = None  # 1.0 = normal, 0.8 = less saturated
    heroBrightness: float | None = None  # 1.0 = normal, 0.8 = darker
    heroOpacity: float | None = None  # 1.0 = fully visible, 0.5 = semi-transparent
    heroMode: str | None = None  # 'dark' (default) or 'light'

    def to_dict(self) -> dict[str, Any]:
        """Convert palette to dict for JSON serialization."""
        return {
            "name": self.name,
            "primary": self.primary,
            "primaryLight": self.primaryLight,
            "primaryDark": self.primaryDark,
            "primarySoft": self.primarySoft,
            "primaryPale": self.primaryPale,
            "accentGold": self.accentGold,
            "accentSilver": self.accentSilver,
            "heroImage": self.heroImage,
            "logoUrl": self.logoUrl,
            "faviconUrl": self.faviconUrl,
            "appIconUrl": self.appIconUrl,
            "heroContrast": self.heroContrast,
            "heroSaturation": self.heroSaturation,
            "heroBrightness": self.heroBrightness,
            "heroOpacity": self.heroOpacity,
            "heroMode": self.heroMode,
        }


# Default palettes
DEFAULT_PALETTES: dict[str, ThemePalette] = {
    "sage_green": ThemePalette(
        name="Sage Green",
        primary="#8B9F4F",
        primaryLight="#A4B86C",
        primaryDark="#6B7A3A",
        primarySoft="#B8C78A",
        primaryPale="#D4E0B8",
        accentGold="#D4AF37",
        accentSilver="#B8C5D3",
    ),
    "professional_blue": ThemePalette(
        name="Professional Blue",
        primary="#3D5A80",
        primaryLight="#5C7AA3",
        primaryDark="#2B3C73",
        primarySoft="#8BA4C4",
        primaryPale="#C5D4E8",
        accentGold="#D4AF37",
        accentSilver="#B8C5D3",
    ),
}


@dataclass
class BrandingConfig:
    """Branding text used throughout the application."""

    app_name: str = "AXIS"
    tagline: str = "AI Evaluation Platform"
    subtitle: str = "The AI Evaluation Studio"
    description: str = "Agent X-ray Interface & Statistics"
    report_footer: str = "Report generated by AXIS AI Evaluation Platform"
    docs_url: str = "https://ax-foundry.github.io/axis/"
    footer_name: str = ""
    footer_icon: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dict for JSON serialization."""
        return {
            "app_name": self.app_name,
            "tagline": self.tagline,
            "subtitle": self.subtitle,
            "description": self.description,
            "report_footer": self.report_footer,
            "docs_url": self.docs_url,
            "footer_name": self.footer_name or self.app_name,
            "footer_icon": self.footer_icon or None,
        }


@dataclass
class ThemeConfig:
    """Theme configuration loaded from YAML or env vars."""

    active: str = "professional_blue"
    palettes: dict[str, ThemePalette] = field(default_factory=lambda: dict(DEFAULT_PALETTES))
    branding: BrandingConfig = field(default_factory=BrandingConfig)

    def get_active_palette(self) -> ThemePalette:
        """Get the currently active palette."""
        return self.palettes.get(self.active, self.palettes.get("sage_green", ThemePalette()))

    def to_dict(self) -> dict[str, Any]:
        """Convert config to dict for JSON serialization."""
        return {
            "active": self.active,
            "palettes": {name: palette.to_dict() for name, palette in self.palettes.items()},
            "branding": self.branding.to_dict(),
        }


def load_theme_config() -> ThemeConfig:
    """Load theme configuration from YAML file first, then env vars.

    Env vars can override individual colors.
    """
    config = ThemeConfig()

    # Try loading from YAML config file first
    if THEME_CONFIG_PATH.exists():
        try:
            with THEME_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("theme"):
                theme_data = yaml_config["theme"]

                # Load active palette name
                if theme_data.get("active"):
                    config.active = theme_data["active"]

                # Load custom palettes
                if theme_data.get("palettes"):
                    for palette_name, palette_data in theme_data["palettes"].items():
                        config.palettes[palette_name] = ThemePalette(
                            name=palette_data.get("name", palette_name),
                            primary=palette_data.get("primary", "#8B9F4F"),
                            primaryLight=palette_data.get("primaryLight", "#A4B86C"),
                            primaryDark=palette_data.get("primaryDark", "#6B7A3A"),
                            primarySoft=palette_data.get("primarySoft", "#B8C78A"),
                            primaryPale=palette_data.get("primaryPale", "#D4E0B8"),
                            accentGold=palette_data.get("accentGold", "#D4AF37"),
                            accentSilver=palette_data.get("accentSilver", "#B8C5D3"),
                            heroImage=palette_data.get("heroImage"),
                            logoUrl=palette_data.get("logoUrl"),
                            faviconUrl=palette_data.get("faviconUrl"),
                            appIconUrl=palette_data.get("appIconUrl"),
                            heroContrast=palette_data.get("heroContrast"),
                            heroSaturation=palette_data.get("heroSaturation"),
                            heroBrightness=palette_data.get("heroBrightness"),
                            heroOpacity=palette_data.get("heroOpacity"),
                            heroMode=palette_data.get("heroMode"),
                        )

                # Load branding config
                if theme_data.get("branding"):
                    branding_data = theme_data["branding"]
                    config.branding = BrandingConfig(
                        app_name=branding_data.get("app_name", "AXIS"),
                        tagline=branding_data.get("tagline", "AI Evaluation Platform"),
                        subtitle=branding_data.get("subtitle", "The AI Evaluation Studio"),
                        description=branding_data.get(
                            "description", "Agent X-ray Interface & Statistics"
                        ),
                        report_footer=branding_data.get(
                            "report_footer",
                            "Report generated by AXIS AI Evaluation Platform",
                        ),
                        docs_url=branding_data.get(
                            "docs_url",
                            "https://ax-foundry.github.io/axis/",
                        ),
                        footer_name=branding_data.get("footer_name", ""),
                        footer_icon=branding_data.get("footer_icon", ""),
                    )

                logger.info(f"Loaded theme config from {THEME_CONFIG_PATH}")
        except Exception as e:
            logger.warning(f"Failed to load theme YAML config: {e}")

    # Override with env vars if set
    if settings.axis_theme_active:
        config.active = settings.axis_theme_active
        logger.info(f"Theme active palette overridden by env: {config.active}")

    # If individual color env vars are set, create/modify the active palette
    # Check if any env override is set
    has_overrides = any(
        v is not None
        for v in [
            settings.axis_theme_primary,
            settings.axis_theme_primary_light,
            settings.axis_theme_primary_dark,
            settings.axis_theme_primary_soft,
            settings.axis_theme_primary_pale,
            settings.axis_theme_accent_gold,
            settings.axis_theme_accent_silver,
            settings.axis_theme_hero_image,
            settings.axis_theme_logo_url,
            settings.axis_theme_favicon_url,
            settings.axis_theme_app_icon_url,
            settings.axis_theme_hero_contrast,
            settings.axis_theme_hero_saturation,
            settings.axis_theme_hero_brightness,
            settings.axis_theme_hero_opacity,
            settings.axis_theme_hero_mode,
        ]
    )

    if has_overrides:
        # Get current active palette as base
        base_palette = config.get_active_palette()

        # Create new palette with overrides (access settings directly for type safety)
        config.palettes[config.active] = ThemePalette(
            name=base_palette.name,
            primary=settings.axis_theme_primary or base_palette.primary,
            primaryLight=settings.axis_theme_primary_light or base_palette.primaryLight,
            primaryDark=settings.axis_theme_primary_dark or base_palette.primaryDark,
            primarySoft=settings.axis_theme_primary_soft or base_palette.primarySoft,
            primaryPale=settings.axis_theme_primary_pale or base_palette.primaryPale,
            accentGold=settings.axis_theme_accent_gold or base_palette.accentGold,
            accentSilver=settings.axis_theme_accent_silver or base_palette.accentSilver,
            heroImage=settings.axis_theme_hero_image or base_palette.heroImage,
            logoUrl=settings.axis_theme_logo_url or base_palette.logoUrl,
            faviconUrl=settings.axis_theme_favicon_url or base_palette.faviconUrl,
            appIconUrl=settings.axis_theme_app_icon_url or base_palette.appIconUrl,
            heroContrast=settings.axis_theme_hero_contrast
            if settings.axis_theme_hero_contrast is not None
            else base_palette.heroContrast,
            heroSaturation=settings.axis_theme_hero_saturation
            if settings.axis_theme_hero_saturation is not None
            else base_palette.heroSaturation,
            heroBrightness=settings.axis_theme_hero_brightness
            if settings.axis_theme_hero_brightness is not None
            else base_palette.heroBrightness,
            heroOpacity=settings.axis_theme_hero_opacity
            if settings.axis_theme_hero_opacity is not None
            else base_palette.heroOpacity,
            heroMode=settings.axis_theme_hero_mode or base_palette.heroMode,
        )
        logger.info("Theme palette overridden by environment variables")

    return config


# Global theme config instance
theme_config = load_theme_config()


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


class Columns:
    """Column names for data processing. Mirrors Dash Config class."""

    # Identifiers
    DATASET_ID = "dataset_id"
    METRIC_ID = "metric_id"
    RUN_ID = "run_id"

    # Core evaluation fields
    EXPERIMENT_NAME = "evaluation_name"
    QUERY = "query"
    ACTUAL_OUTPUT = "actual_output"
    EXPECTED_OUTPUT = "expected_output"
    CONVERSATION = "conversation"
    RETRIEVED_CONTENT = "retrieved_content"
    ADDITIONAL_INPUT = "additional_input"
    ACCEPTANCE_CRITERIA = "acceptance_criteria"

    # Reference fields
    DOCUMENT_TEXT = "document_text"
    ACTUAL_REFERENCE = "actual_reference"
    EXPECTED_REFERENCE = "expected_reference"

    # Metric fields
    METRIC_NAME = "metric_name"
    METRIC_SCORE = "metric_score"
    METRIC_TYPE = "metric_type"
    METRIC_CATEGORY = "metric_category"
    WEIGHT = "weight"
    PARENT = "parent"

    # Result fields
    JUDGMENT = "judgment"
    PASSED = "passed"
    THRESHOLD = "threshold"
    EXPLANATION = "explanation"
    SIGNALS = "signals"
    CRITIQUE = "critique"
    ADDITIONAL_OUTPUT = "additional_output"

    # Observability fields
    TRACE = "trace"
    TRACE_ID = "trace_id"
    OBSERVATION_ID = "observation_id"
    LATENCY = "Latency"
    COST_ESTIMATE = "cost_estimate"

    # Metadata fields
    SOURCE = "source"
    METADATA = "data_metadata"
    EXPERIMENT_METADATA = "evaluation_metadata"
    DATASET_METADATA = "dataset_metadata"
    METRIC_METADATA = "metric_metadata"
    USER_TAGS = "user_tags"

    # Configuration fields
    MODEL_NAME = "model_name"
    LLM_PROVIDER = "llm_provider"

    # Status fields
    HAS_ERRORS = "has_errors"
    VERSION = "version"
    TIMESTAMP = "timestamp"

    # UI Configuration
    ITEMS_PER_PAGE = 3
    CONTENT_TRUNC_LENGTH = 200
    SPANS_PER_PAGE = 10

    # Analytics
    DROP_LATENCY = True
    ADD_DEFAULT_PRODUCT = True

    # Index columns for aggregation (ClassVar for mutable class attributes)
    INDEX_COLUMNS: ClassVar[list[str]] = [
        DATASET_ID,
        QUERY,
        ACTUAL_OUTPUT,
        EXPERIMENT_NAME,
        EXPERIMENT_METADATA,
    ]
    AGG_METRICS: ClassVar[list[str]] = ["mean", "std", "count"]


@dataclass(frozen=True)
class Thresholds:
    """Evaluation thresholds."""

    PASSING_RATE: float = 0.5
    GREEN_THRESHOLD: float = 0.7
    RED_THRESHOLD: float = 0.3


@dataclass(frozen=True)
class Colors:
    """Color palette for charts and UI."""

    PALETTE: ClassVar[dict[str, str]] = {
        "primary": "#8B9F4F",
        "primary_light": "#A4B86C",
        "primary_dark": "#6B7A3A",
        "primary_soft": "#B8C78A",
        "primary_pale": "#D4E0B8",
        "accent_gold": "#D4AF37",
        "accent_silver": "#B8C5D3",
        "text_primary": "#2C3E50",
        "text_secondary": "#34495E",
        "text_muted": "#7F8C8D",
        "success": "#27AE60",
        "warning": "#F39C12",
        "error": "#E74C3C",
    }

    CHART_COLORS: ClassVar[list[str]] = [
        "#8B9F4F",
        "#A4B86C",
        "#6B7A3A",
        "#B8C78A",
        "#D4AF37",
        "#B8C5D3",
        "#D4E0B8",
        "#1f77b4",
        "#ff7f0e",
        "#2ca02c",
    ]

    @classmethod
    def get(cls, name: str) -> str:
        """Get color by name."""
        if name not in cls.PALETTE:
            raise ValueError(f"Color '{name}' not found in palette.")
        return cls.PALETTE[name]
