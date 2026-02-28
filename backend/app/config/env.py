import logging

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .paths import _BACKEND_ENV_FILE

logger = logging.getLogger(__name__)

_env_loaded = False


def bootstrap_env() -> None:
    """Populate ``os.environ`` from ``backend/.env``.

    Uses an absolute path derived from the repo layout so the result is
    identical regardless of the process's current working directory.

    Idempotent — safe to call from ``main.py``, tests, CLI scripts, etc.
    Only the first call mutates ``os.environ``; subsequent calls are no-ops.
    """
    global _env_loaded
    if _env_loaded:
        return
    if _BACKEND_ENV_FILE.exists():
        load_dotenv(dotenv_path=_BACKEND_ENV_FILE, override=False)
        logger.debug("Loaded env from %s", _BACKEND_ENV_FILE)
    _env_loaded = True


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
        env_file=str(_BACKEND_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Ensure os.environ is populated from .env before constructing Settings.
# This runs once at first import; the call is idempotent.
bootstrap_env()

settings = Settings()
