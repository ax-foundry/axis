from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any

import yaml

from app.config.env import settings
from app.config.paths import resolve_config_path

logger = logging.getLogger(__name__)

REPLAY_CONFIG_PATH = resolve_config_path("agent_replay.yaml")
REPLAY_DB_CONFIG_PATH = resolve_config_path("agent_replay_db.yaml")


@dataclass
class LangfuseAgentCreds:
    public_key: str
    secret_key: str
    host: str = "https://cloud.langfuse.com"


def discover_langfuse_agents() -> dict[str, LangfuseAgentCreds]:
    agents: dict[str, LangfuseAgentCreds] = {}
    for key in os.environ:
        if (
            key.startswith("LANGFUSE_")
            and key.endswith("_PUBLIC_KEY")
            and key != "LANGFUSE_PUBLIC_KEY"
        ):
            agent_name = key[len("LANGFUSE_") : -len("_PUBLIC_KEY")].lower()
            secret_key_var = f"LANGFUSE_{agent_name.upper()}_SECRET_KEY"
            host_var = f"LANGFUSE_{agent_name.upper()}_HOST"
            secret = os.environ.get(secret_key_var)
            if secret:
                agents[agent_name] = LangfuseAgentCreds(
                    public_key=os.environ[key],
                    secret_key=secret,
                    host=os.environ.get(
                        host_var,
                        os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
                    ),
                )
                logger.info("Discovered Langfuse agent: %s", agent_name)
            else:
                logger.warning(
                    "Found %s but missing %s — skipping agent %r",
                    key,
                    secret_key_var,
                    agent_name,
                )
    return agents


@dataclass
class AgentSearchConfig:
    """Per-agent table and column overrides for the search DB."""

    table: str | None = None
    search_columns: dict[str, str] | None = None
    trace_id_column: str | None = None
    agent_name_column: str | None = None


@dataclass
class ResolvedSearchConfig:
    """Fully resolved table/column config for a specific agent."""

    schema: str
    table: str
    search_columns: dict[str, str]
    trace_id_column: str
    agent_name_column: str | None


@dataclass
class ReplayDBConfig:
    """Configuration for the optional trace lookup database (Postgres or BigQuery)."""

    enabled: bool = False
    db_type: str = "postgres"
    connection_params: dict[str, Any] = field(default_factory=dict)
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str = "prefer"
    schema: str = "public"
    table: str = "trace_lookup"
    search_columns: dict[str, str] = field(default_factory=dict)
    trace_id_column: str = "langfuse_trace_id"
    agent_name_column: str | None = None
    query_timeout: int = 10
    connect_timeout: int = 10
    pool_min_size: int = 0
    pool_max_size: int = 5
    agents: dict[str, AgentSearchConfig] = field(default_factory=dict)

    @property
    def is_configured(self) -> bool:
        """Check if enough config is provided to connect."""
        if self.db_type == "bigquery":
            return bool(self.connection_params)
        if self.url:
            return True
        return bool(self.host and self.database)

    def get_agent_config(self, agent_name: str | None) -> ResolvedSearchConfig:
        """Merge agent-specific overrides with top-level defaults."""
        resolved = ResolvedSearchConfig(
            schema=self.schema,
            table=self.table,
            search_columns=dict(self.search_columns),
            trace_id_column=self.trace_id_column,
            agent_name_column=self.agent_name_column,
        )
        if agent_name and agent_name in self.agents:
            override = self.agents[agent_name]
            if override.table is not None:
                resolved.table = override.table
            if override.search_columns is not None:
                resolved.search_columns = dict(override.search_columns)
            if override.trace_id_column is not None:
                resolved.trace_id_column = override.trace_id_column
            if override.agent_name_column is not None:
                resolved.agent_name_column = override.agent_name_column
        return resolved


def _parse_search_columns(block: dict[str, Any]) -> dict[str, str] | None:
    """Parse search_columns from a YAML block with backward compatibility.

    Supports:
      - New format: ``search_columns: {col: label, ...}``
      - Old format: ``search_column`` + ``search_column_label`` (converted to single-entry dict)

    Returns ``None`` if neither key is present (distinct from empty ``{}``).
    """
    # New format takes precedence
    raw = block.get("search_columns")
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}

    # Backward compat: old single-column format
    old_col = block.get("search_column")
    if old_col:
        old_label = block.get("search_column_label", str(old_col))
        return {str(old_col): str(old_label)}

    return None


def load_replay_db_config() -> ReplayDBConfig:
    """Load agent replay DB config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = ReplayDBConfig()

    if REPLAY_DB_CONFIG_PATH.exists():
        try:
            with REPLAY_DB_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("agent_replay_db"):
                db = yaml_config["agent_replay_db"]
                query_timeout = min(int(db.get("query_timeout", 10)), 30)
                connect_timeout = min(int(db.get("connect_timeout", 10)), 30)
                pool_max_size = min(int(db.get("pool_max_size", 5)), 20)
                pool_min_size = max(0, min(int(db.get("pool_min_size", 0)), pool_max_size))

                # Parse per-agent overrides
                agents_raw = db.get("agents", {}) or {}
                agents: dict[str, AgentSearchConfig] = {}
                for name, overrides in agents_raw.items():
                    if isinstance(overrides, dict):
                        agent_sc = _parse_search_columns(overrides)
                        agents[name] = AgentSearchConfig(
                            table=overrides.get("table"),
                            search_columns=agent_sc,
                            trace_id_column=overrides.get("trace_id_column"),
                            agent_name_column=overrides.get("agent_name_column"),
                        )

                # Parse top-level search_columns (with backward compat)
                top_sc = _parse_search_columns(db) or {}

                config = ReplayDBConfig(
                    enabled=db.get("enabled", False),
                    db_type=db.get("db_type", "postgres"),
                    connection_params=db.get("connection_params", {}) or {},
                    url=db.get("url") or settings.agent_replay_db_url,
                    host=db.get("host"),
                    port=int(db.get("port", 5432)),
                    database=db.get("database"),
                    username=db.get("username"),
                    password=db.get("password") or settings.agent_replay_db_password,
                    ssl_mode=db.get("ssl_mode", "prefer"),
                    schema=db.get("schema", "public"),
                    table=db.get("table", "trace_lookup"),
                    search_columns=top_sc,
                    trace_id_column=db.get("trace_id_column", "langfuse_trace_id"),
                    agent_name_column=db.get("agent_name_column"),
                    query_timeout=query_timeout,
                    connect_timeout=connect_timeout,
                    pool_min_size=pool_min_size,
                    pool_max_size=pool_max_size,
                    agents=agents,
                )
                logger.info("Loaded agent replay DB config from %s", REPLAY_DB_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load agent replay DB YAML config: %s", e)

    # Fall back to env vars
    if settings.agent_replay_db_url or settings.agent_replay_db_host:
        query_timeout = min(settings.agent_replay_db_query_timeout, 30)
        connect_timeout = min(settings.agent_replay_db_connect_timeout, 30)
        pool_max_size = min(settings.agent_replay_db_pool_max_size, 20)
        pool_min_size = max(0, min(settings.agent_replay_db_pool_min_size, pool_max_size))

        # Build search_columns from env vars (non-empty search_column = single entry)
        env_search_columns: dict[str, str] = {}
        if settings.agent_replay_db_search_column:
            env_search_columns[settings.agent_replay_db_search_column] = (
                settings.agent_replay_db_search_column_label
                or settings.agent_replay_db_search_column
            )

        config = ReplayDBConfig(
            enabled=settings.agent_replay_db_enabled,
            url=settings.agent_replay_db_url,
            host=settings.agent_replay_db_host,
            port=settings.agent_replay_db_port,
            database=settings.agent_replay_db_name,
            username=settings.agent_replay_db_user,
            password=settings.agent_replay_db_password,
            ssl_mode=settings.agent_replay_db_ssl_mode,
            schema=settings.agent_replay_db_schema,
            table=settings.agent_replay_db_table,
            search_columns=env_search_columns,
            trace_id_column=settings.agent_replay_db_trace_id_column,
            agent_name_column=settings.agent_replay_db_agent_name_column,
            query_timeout=query_timeout,
            connect_timeout=connect_timeout,
            pool_min_size=pool_min_size,
            pool_max_size=pool_max_size,
        )
        logger.info("Loaded agent replay DB config from environment variables")

    return config


@dataclass
class AgentReplayOverrides:
    """Per-agent overrides for replay config fields."""

    review_step_types: list[str] | None = None
    search_fields: dict[str, str] | None = None
    recent_trace_names: list[str] | None = None
    session_turn_name: str | None = None


@dataclass
class ReplayConfig:
    default_limit: int = 20
    default_days_back: int = 7
    max_chars: int = 50000
    search_metadata_key: str = "caseReference"
    whatif_enabled: bool = True
    whatif_disabled_agents: list[str] = field(default_factory=list)
    search_fields: dict[str, str] = field(default_factory=dict)
    review_step_types: list[str] = field(default_factory=list)
    recent_trace_names: list[str] = field(default_factory=list)
    session_turn_name: str | None = None
    agents_config: dict[str, AgentReplayOverrides] = field(default_factory=dict)
    langfuse_agents: dict[str, LangfuseAgentCreds] = field(default_factory=dict)
    search_db: ReplayDBConfig = field(default_factory=ReplayDBConfig)
    prompt_patterns: Any = None  # PromptPatternsBase instance (or None)

    def is_whatif_allowed(self, agent_name: str | None) -> bool:
        """Check if what-if is enabled globally and for the given agent."""
        if not self.whatif_enabled:
            return False
        return not (agent_name and agent_name.lower() in self.whatif_disabled_agents)

    def get_review_step_types(self, agent_name: str | None) -> list[str]:
        """Get review_step_types for a specific agent, falling back to global."""
        if agent_name and agent_name in self.agents_config:
            override = self.agents_config[agent_name].review_step_types
            if override is not None:
                return override
        return self.review_step_types

    def get_search_fields(self, agent_name: str | None) -> dict[str, str]:
        """Get search_fields for a specific agent, falling back to global."""
        if agent_name and agent_name in self.agents_config:
            override = self.agents_config[agent_name].search_fields
            if override is not None:
                return override
        return self.search_fields

    def get_recent_trace_names(self, agent_name: str | None) -> list[str]:
        """Get recent_trace_names for a specific agent, falling back to global."""
        if agent_name and agent_name in self.agents_config:
            override = self.agents_config[agent_name].recent_trace_names
            if override is not None:
                return override
        return self.recent_trace_names

    def get_session_turn_name(self, agent_name: str | None) -> str | None:
        """Get session_turn_name for a specific agent, falling back to global."""
        if agent_name and agent_name in self.agents_config:
            override = self.agents_config[agent_name].session_turn_name
            if override is not None:
                return override
        return self.session_turn_name


def _build_prompt_patterns(raw: dict[str, Any] | None) -> Any:
    """Build a PromptPatternsBase subclass from inline YAML config.

    YAML format::

        prompt_patterns:
          analysis:
            inputData: "between:INPUT DATA:EVALUATION CRITERIA"
            criteria: "between:EVALUATION CRITERIA:INSTRUCTIONS"
            instructions: "between:INSTRUCTIONS:$"

    Supported pattern formats:

    - ``between:Start:End`` — captures between ``Start:`` and ``End``
    - ``between:Start:End|$`` — captures between ``Start:`` and ``End`` or
      end-of-string (for the last section in a prompt)
    - Raw regex string — used as-is (must contain one capture group)
    """
    if not raw:
        return None

    try:
        from axion._core.tracing.collection.prompt_patterns import (
            PromptPatternsBase,
            create_extraction_pattern,
        )
    except ImportError:
        logger.warning("axion prompt_patterns not available — variable extraction disabled")
        return None

    import re as _re

    # Build methods dict for the dynamic subclass
    methods: dict[str, Any] = {}
    for step_name, variables in raw.items():
        if not isinstance(variables, dict):
            continue
        patterns: dict[str, str] = {}
        for var_name, pattern_str in variables.items():
            if isinstance(pattern_str, str) and pattern_str.startswith("between:"):
                parts = pattern_str.split(":", 2)
                if len(parts) == 3:
                    start_text = parts[1].strip()
                    end_text = parts[2].strip()
                    # Support "End Text|$" for last-section-or-end-of-string
                    if end_text.endswith("|$"):
                        literal = end_text[:-2].strip()
                        end_regex = f"{_re.escape(literal)}|$" if literal else "$"
                    elif end_text == "$":
                        end_regex = "$"
                    else:
                        end_regex = _re.escape(end_text)
                    patterns[var_name] = create_extraction_pattern(start_text, end_regex)
                else:
                    patterns[var_name] = pattern_str
            else:
                patterns[var_name] = str(pattern_str)

        # Create a classmethod for this step
        safe_name = _re.sub(r"[^a-z0-9_]", "_", step_name.lower()).strip("_")
        # Use default arg to capture patterns in closure
        methods[f"_patterns_{safe_name}"] = classmethod(lambda cls, _p=patterns: _p)

    if not methods:
        return None

    klass = type("YAMLPromptPatterns", (PromptPatternsBase,), methods)
    logger.info("Built prompt patterns for steps: %s", list(raw.keys()))
    return klass


def load_replay_config() -> ReplayConfig:
    config = ReplayConfig()

    if REPLAY_CONFIG_PATH.exists():
        try:
            with REPLAY_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("agent_replay"):
                data = yaml_config["agent_replay"]
                # Parse whatif_disabled_agents — normalize to lowercase
                raw_disabled = data.get("whatif_disabled_agents") or []
                disabled_agents = [str(a).strip().lower() for a in raw_disabled if str(a).strip()]

                # Parse extra search fields: {value: label} pairs
                raw_sf = data.get("search_fields") or {}
                extra_search_fields = (
                    {str(k): str(v) for k, v in raw_sf.items()} if isinstance(raw_sf, dict) else {}
                )

                # Parse recent_trace_names
                raw_rtn = data.get("recent_trace_names") or []
                recent_trace_names = (
                    [str(n).strip() for n in raw_rtn if str(n).strip()]
                    if isinstance(raw_rtn, list)
                    else []
                )

                # Parse review_step_types — uppercase-normalized list
                raw_rst = data.get("review_step_types") or []
                review_step_types = (
                    [str(t).strip().upper() for t in raw_rst if str(t).strip()]
                    if isinstance(raw_rst, list)
                    else []
                )

                # Parse per-agent overrides
                agents_config: dict[str, AgentReplayOverrides] = {}
                raw_agents = data.get("agents") or {}
                if isinstance(raw_agents, dict):
                    for name, overrides in raw_agents.items():
                        if not isinstance(overrides, dict):
                            continue
                        agent_rst = overrides.get("review_step_types")
                        agent_sf = overrides.get("search_fields")
                        agent_rtn = overrides.get("recent_trace_names")
                        agent_stn = overrides.get("session_turn_name")
                        agents_config[str(name).lower()] = AgentReplayOverrides(
                            review_step_types=(
                                [str(t).strip().upper() for t in agent_rst if str(t).strip()]
                                if isinstance(agent_rst, list)
                                else None
                            ),
                            search_fields=(
                                {str(k): str(v) for k, v in agent_sf.items()}
                                if isinstance(agent_sf, dict)
                                else None
                            ),
                            recent_trace_names=(
                                [str(n).strip() for n in agent_rtn if str(n).strip()]
                                if isinstance(agent_rtn, list)
                                else None
                            ),
                            session_turn_name=str(agent_stn).strip() if agent_stn else None,
                        )

                raw_stn = data.get("session_turn_name")
                config = ReplayConfig(
                    default_limit=data.get("default_limit", 20),
                    default_days_back=data.get("default_days_back", 7),
                    max_chars=data.get("max_chars", 50000),
                    search_metadata_key=data.get("search_metadata_key", "caseReference"),
                    whatif_enabled=data.get("whatif_enabled", True),
                    whatif_disabled_agents=disabled_agents,
                    search_fields=extra_search_fields,
                    review_step_types=review_step_types,
                    recent_trace_names=recent_trace_names,
                    session_turn_name=str(raw_stn).strip() if raw_stn else None,
                    agents_config=agents_config,
                    prompt_patterns=_build_prompt_patterns(data.get("prompt_patterns")),
                )
                logger.info("Loaded agent replay config from %s", REPLAY_CONFIG_PATH)
        except Exception as e:
            logger.warning("Failed to load agent replay YAML config: %s", e)

    # Env var override for whatif_enabled
    if settings.agent_replay_whatif_enabled is not None:
        config.whatif_enabled = settings.agent_replay_whatif_enabled

    config.langfuse_agents = discover_langfuse_agents()
    config.search_db = load_replay_db_config()
    return config


_replay_config: ReplayConfig | None = None


def get_replay_config() -> ReplayConfig:
    """Return the replay config singleton, loading on first call.

    Deferred so that ``os.environ`` is fully populated (via ``bootstrap_env``)
    before we scan for ``LANGFUSE_*`` agent keys.
    """
    global _replay_config
    if _replay_config is None:
        _replay_config = load_replay_config()
    return _replay_config
