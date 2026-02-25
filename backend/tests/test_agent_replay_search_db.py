from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create a test client."""
    from app.main import app

    return TestClient(app)


class TestCanonicalizeAgentName:
    """Test _canonicalize_agent_name helper."""

    def test_lowercase(self):
        """Uppercase letters are lowercased."""
        from app.plugins.agent_replay.services.search_db import _canonicalize_agent_name

        assert _canonicalize_agent_name("MyAgent") == "myagent"

    def test_hyphens_to_underscores(self):
        """Hyphens are replaced with underscores."""
        from app.plugins.agent_replay.services.search_db import _canonicalize_agent_name

        assert _canonicalize_agent_name("beta-bot") == "beta_bot"

    def test_strip_whitespace(self):
        """Leading/trailing whitespace is stripped."""
        from app.plugins.agent_replay.services.search_db import _canonicalize_agent_name

        assert _canonicalize_agent_name("  my-agent  ") == "my_agent"

    def test_combined(self):
        """All transformations are applied together."""
        from app.plugins.agent_replay.services.search_db import _canonicalize_agent_name

        assert _canonicalize_agent_name("My-Super-Agent") == "my_super_agent"

    def test_already_canonical(self):
        """Already canonical names pass through unchanged."""
        from app.plugins.agent_replay.services.search_db import _canonicalize_agent_name

        assert _canonicalize_agent_name("simple_agent") == "simple_agent"



class TestReplayDBConfig:
    """Test ReplayDBConfig dataclass and loader."""

    def test_is_configured_with_url(self):
        """Config with a URL is considered configured."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        cfg = ReplayDBConfig(url="postgresql://localhost/db")
        assert cfg.is_configured is True

    def test_is_configured_with_host_and_database(self):
        """Config with host + database is considered configured."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        cfg = ReplayDBConfig(host="localhost", database="mydb")
        assert cfg.is_configured is True

    def test_not_configured_empty(self):
        """Default config is not considered configured."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        cfg = ReplayDBConfig()
        assert cfg.is_configured is False

    def test_not_configured_host_only(self):
        """Host without database is not considered configured."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        cfg = ReplayDBConfig(host="localhost")
        assert cfg.is_configured is False

    def test_bounds_clamping_yaml(self, tmp_path):
        """YAML loader clamps query_timeout, connect_timeout, pool sizes."""
        import yaml

        from app.plugins.agent_replay.config import REPLAY_DB_CONFIG_PATH, load_replay_db_config

        config_data = {
            "agent_replay_db": {
                "enabled": True,
                "url": "postgresql://localhost/db",
                "query_timeout": 999,
                "connect_timeout": 50,
                "pool_max_size": 100,
                "pool_min_size": 200,
            }
        }

        config_file = tmp_path / "agent_replay_db.yaml"
        config_file.write_text(yaml.dump(config_data))

        with (
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "exists",
                return_value=True,
            ),
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "open",
                return_value=config_file.open(),
            ),
        ):
            cfg = load_replay_db_config()

        assert cfg.query_timeout == 30  # clamped from 999
        assert cfg.connect_timeout == 30  # clamped from 50
        assert cfg.pool_max_size == 20  # clamped from 100
        assert cfg.pool_min_size == 20  # clamped: min(200, pool_max_size=20)

    def test_env_var_fallback(self):
        """Env vars are picked up when no YAML is present."""
        from app.plugins.agent_replay.config import REPLAY_DB_CONFIG_PATH, load_replay_db_config

        with (
            patch.object(type(REPLAY_DB_CONFIG_PATH), "exists", return_value=False),
            patch("app.plugins.agent_replay.config.settings") as mock_settings,
        ):
            mock_settings.agent_replay_db_enabled = True
            mock_settings.agent_replay_db_url = "postgresql://envhost/envdb"
            mock_settings.agent_replay_db_host = None
            mock_settings.agent_replay_db_port = 5432
            mock_settings.agent_replay_db_name = None
            mock_settings.agent_replay_db_user = None
            mock_settings.agent_replay_db_password = None
            mock_settings.agent_replay_db_ssl_mode = "require"
            mock_settings.agent_replay_db_schema = "custom"
            mock_settings.agent_replay_db_table = "my_traces"
            mock_settings.agent_replay_db_search_column = "locator"
            mock_settings.agent_replay_db_search_column_label = "Locator"
            mock_settings.agent_replay_db_trace_id_column = "tid"
            mock_settings.agent_replay_db_agent_name_column = None
            mock_settings.agent_replay_db_query_timeout = 10
            mock_settings.agent_replay_db_connect_timeout = 10
            mock_settings.agent_replay_db_pool_min_size = 0
            mock_settings.agent_replay_db_pool_max_size = 5

            cfg = load_replay_db_config()

        assert cfg.enabled is True
        assert cfg.url == "postgresql://envhost/envdb"
        assert cfg.ssl_mode == "require"
        assert cfg.schema == "custom"
        assert cfg.table == "my_traces"
        assert cfg.search_columns == {"locator": "Locator"}

    def test_env_var_empty_search_column(self):
        """Empty AGENT_REPLAY_DB_SEARCH_COLUMN means no search columns."""
        from app.plugins.agent_replay.config import REPLAY_DB_CONFIG_PATH, load_replay_db_config

        with (
            patch.object(type(REPLAY_DB_CONFIG_PATH), "exists", return_value=False),
            patch("app.plugins.agent_replay.config.settings") as mock_settings,
        ):
            mock_settings.agent_replay_db_enabled = True
            mock_settings.agent_replay_db_url = "postgresql://envhost/envdb"
            mock_settings.agent_replay_db_host = None
            mock_settings.agent_replay_db_port = 5432
            mock_settings.agent_replay_db_name = None
            mock_settings.agent_replay_db_user = None
            mock_settings.agent_replay_db_password = None
            mock_settings.agent_replay_db_ssl_mode = "prefer"
            mock_settings.agent_replay_db_schema = "public"
            mock_settings.agent_replay_db_table = "trace_lookup"
            mock_settings.agent_replay_db_search_column = ""
            mock_settings.agent_replay_db_search_column_label = ""
            mock_settings.agent_replay_db_trace_id_column = "langfuse_trace_id"
            mock_settings.agent_replay_db_agent_name_column = None
            mock_settings.agent_replay_db_query_timeout = 10
            mock_settings.agent_replay_db_connect_timeout = 10
            mock_settings.agent_replay_db_pool_min_size = 0
            mock_settings.agent_replay_db_pool_max_size = 5

            cfg = load_replay_db_config()

        assert cfg.search_columns == {}

class TestStatusSearchFields:
    """Test search_fields in the /status response."""

    def test_status_includes_search_fields(self, client):
        """Status always returns search_fields with at least trace_id."""
        response = client.get("/api/agent-replay/status")
        assert response.status_code == 200
        data = response.json()
        assert "search_fields" in data
        assert len(data["search_fields"]) >= 1
        assert data["search_fields"][0]["value"] == "trace_id"
        assert data["search_fields"][0]["label"] == "Trace ID"

    def test_status_includes_field_option_when_db_configured(self, client):
        """When search_db is enabled+configured with search_columns, all appear."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={"case_reference": "Case Reference"},
        )
        with patch("app.plugins.agent_replay.services.replay_service.replay_config") as mock_config:
            mock_config.search_db = mock_db
            mock_config.langfuse_agents = {}
            mock_config.default_limit = 20
            mock_config.default_days_back = 7
            response = client.get("/api/agent-replay/status")

        data = response.json()
        assert len(data["search_fields"]) == 2
        assert data["search_fields"][1]["value"] == "case_reference"
        assert data["search_fields"][1]["label"] == "Case Reference"

    def test_status_multiple_search_columns(self, client):
        """Multiple search_columns all appear in status response."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={
                "case_reference": "Case Reference",
                "business_name": "Business Name",
            },
        )
        with patch("app.plugins.agent_replay.services.replay_service.replay_config") as mock_config:
            mock_config.search_db = mock_db
            mock_config.langfuse_agents = {}
            mock_config.default_limit = 20
            mock_config.default_days_back = 7
            response = client.get("/api/agent-replay/status")

        data = response.json()
        assert len(data["search_fields"]) == 3
        assert data["search_fields"][0]["value"] == "trace_id"
        assert data["search_fields"][1]["value"] == "case_reference"
        assert data["search_fields"][2]["value"] == "business_name"

    def test_status_no_search_columns_trace_id_only(self, client):
        """Empty search_columns means only trace_id in search_fields."""
        from app.plugins.agent_replay.config import ReplayDBConfig

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={},
        )
        with patch("app.plugins.agent_replay.services.replay_service.replay_config") as mock_config:
            mock_config.search_db = mock_db
            mock_config.langfuse_agents = {}
            mock_config.default_limit = 20
            mock_config.default_days_back = 7
            response = client.get("/api/agent-replay/status")

        data = response.json()
        assert len(data["search_fields"]) == 1
        assert data["search_fields"][0]["value"] == "trace_id"



class TestSearchByValidation:
    """Test search_by query parameter validation."""

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_search_by_defaults_to_trace_id(self, client):
        """Default search_by is trace_id (returns 503 without Langfuse creds)."""
        response = client.get("/api/agent-replay/search?query=test")
        # Without Langfuse configured, trace_id mode returns 503
        assert response.status_code == 503

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_unknown_column_search_by_returns_503(self, client):
        """Unknown search_by column returns 503 when no search columns configured."""
        from app.plugins.agent_replay.services.search_db import SearchDBNotConfiguredError

        with patch(
            "app.plugins.agent_replay.services.search_db.lookup_trace_ids",
            new_callable=AsyncMock,
            side_effect=SearchDBNotConfiguredError("not configured"),
        ):
            response = client.get("/api/agent-replay/search?query=test&search_by=nonexistent")
        assert response.status_code == 503



class TestSearchByField:
    """Test search_by=field mode (DB lookup)."""

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_field_mode_db_not_configured_returns_503(self, client):
        """search_by=field with unconfigured DB returns 503."""
        from app.plugins.agent_replay.services.search_db import SearchDBNotConfiguredError

        with patch(
            "app.plugins.agent_replay.services.search_db.lookup_trace_ids",
            new_callable=AsyncMock,
            side_effect=SearchDBNotConfiguredError("not enabled"),
        ):
            response = client.get("/api/agent-replay/search?query=locator123&search_by=field")
        assert response.status_code == 503

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_field_mode_returns_empty_when_db_returns_no_rows(self, client):
        """search_by=field with 0 DB rows returns empty response."""
        with patch(
            "app.plugins.agent_replay.services.search_db.lookup_trace_ids",
            new_callable=AsyncMock,
            return_value=[],
        ):
            response = client.get("/api/agent-replay/search?query=locator123&search_by=field")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["traces"] == []

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_field_mode_with_mock_matches(self, client):
        """search_by=field with mocked matches fetches traces from Langfuse."""
        from app.plugins.agent_replay.models.replay_schemas import TraceSummary
        from app.plugins.agent_replay.services.search_db import TraceMatch

        matches = [
            TraceMatch(trace_id="trace-1", agent_name=None),
            TraceMatch(trace_id="trace-2", agent_name=None),
        ]

        mock_summaries = [
            TraceSummary(
                id="trace-1",
                name="test",
                tags=[],
                timestamp="2025-01-01",
                step_count=1,
                step_names=["s1"],
            )
        ]

        with (
            patch(
                "app.plugins.agent_replay.services.search_db.lookup_trace_ids",
                new_callable=AsyncMock,
                return_value=matches,
            ),
            patch(
                "app.plugins.agent_replay.services.replay_service._fetch_summaries_from_matches",
                new_callable=AsyncMock,
                return_value=mock_summaries,
            ),
        ):
            response = client.get("/api/agent-replay/search?query=locator123&search_by=field")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1

    @patch("app.config.settings.agent_replay_enabled", True)
    def test_named_column_search(self, client):
        """search_by=case_reference queries the named column directly."""
        from app.plugins.agent_replay.services.search_db import TraceMatch

        with patch(
            "app.plugins.agent_replay.services.search_db.lookup_trace_ids",
            new_callable=AsyncMock,
            return_value=[TraceMatch(trace_id="t1", agent_name=None)],
        ) as mock_lookup, patch(
            "app.plugins.agent_replay.services.replay_service._fetch_summaries_from_matches",
            new_callable=AsyncMock,
            return_value=[],
        ):
            response = client.get(
                "/api/agent-replay/search?query=test&search_by=case_reference"
            )

        assert response.status_code == 200
        # Verify search_column was passed as "case_reference"
        mock_lookup.assert_called_once()
        call_kwargs = mock_lookup.call_args
        assert call_kwargs.kwargs.get("search_column") == "case_reference"



class TestLookupTraceIds:
    """Test the lookup_trace_ids function."""

    @pytest.mark.asyncio
    async def test_raises_when_not_enabled(self):
        """Raises SearchDBNotConfiguredError when DB is disabled."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import (
            SearchDBNotConfiguredError,
            lookup_trace_ids,
        )

        mock_db = ReplayDBConfig(enabled=False)
        with patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config:
            mock_config.search_db = mock_db
            with pytest.raises(SearchDBNotConfiguredError, match="not enabled"):
                await lookup_trace_ids("test")

    @pytest.mark.asyncio
    async def test_raises_when_not_configured(self):
        """Raises SearchDBNotConfiguredError when DB has no connection info."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import (
            SearchDBNotConfiguredError,
            lookup_trace_ids,
        )

        mock_db = ReplayDBConfig(enabled=True)  # no url or host
        with patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config:
            mock_config.search_db = mock_db
            with pytest.raises(SearchDBNotConfiguredError, match="not configured"):
                await lookup_trace_ids("test")

    @pytest.mark.asyncio
    async def test_raises_when_no_search_columns(self):
        """Raises SearchDBNotConfiguredError when search_columns is empty."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import (
            SearchDBNotConfiguredError,
            lookup_trace_ids,
        )

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={},
        )
        with patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config:
            mock_config.search_db = mock_db
            with pytest.raises(SearchDBNotConfiguredError, match="No search columns"):
                await lookup_trace_ids("test")

    @pytest.mark.asyncio
    async def test_raises_when_invalid_search_column(self):
        """Raises SearchDBNotConfiguredError when search_column is not in configured list."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import (
            SearchDBNotConfiguredError,
            lookup_trace_ids,
        )

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={"case_reference": "Case Reference"},
        )
        with patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config:
            mock_config.search_db = mock_db
            with pytest.raises(SearchDBNotConfiguredError, match="not configured"):
                await lookup_trace_ids("test", search_column="nonexistent")

    @pytest.mark.asyncio
    async def test_returns_matches(self):
        """Returns TraceMatch objects from DB rows."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import lookup_trace_ids

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            trace_id_column="tid",
            search_columns={"locator": "Locator"},
        )

        mock_conn = AsyncMock()
        mock_conn.fetch_all = AsyncMock(
            return_value=[
                {"tid": "abc-123"},
                {"tid": "def-456"},
            ]
        )

        mock_backend = MagicMock()
        mock_backend.build_url.return_value = "postgresql://localhost/test"
        mock_backend.pooled_connection = MagicMock(return_value=AsyncMock())

        # Setup async context manager
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        mock_backend.pooled_connection.return_value = mock_cm

        with (
            patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config,
            patch(
                "app.plugins.agent_replay.services.search_db.get_backend",
                return_value=mock_backend,
            ),
        ):
            mock_config.search_db = mock_db
            results = await lookup_trace_ids("test-locator", limit=10)

        assert len(results) == 2
        assert results[0].trace_id == "abc-123"
        assert results[1].trace_id == "def-456"

    @pytest.mark.asyncio
    async def test_canonicalizes_agent_names(self):
        """Agent names from DB rows are canonicalized."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import lookup_trace_ids

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            trace_id_column="tid",
            search_columns={"locator": "Locator"},
            agent_name_column="agent",
        )

        mock_conn = AsyncMock()
        mock_conn.fetch_all = AsyncMock(
            return_value=[
                {"tid": "abc-123", "agent": "Beta-Bot"},
            ]
        )

        mock_backend = MagicMock()
        mock_backend.build_url.return_value = "postgresql://localhost/test"
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        mock_backend.pooled_connection.return_value = mock_cm

        with (
            patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config,
            patch(
                "app.plugins.agent_replay.services.search_db.get_backend",
                return_value=mock_backend,
            ),
        ):
            mock_config.search_db = mock_db
            results = await lookup_trace_ids("loc-123")

        assert len(results) == 1
        assert results[0].agent_name == "beta_bot"

    @pytest.mark.asyncio
    async def test_db_error_raises_query_error(self):
        """Connection errors are wrapped in SearchDBQueryError."""
        from app.plugins.agent_replay.config import ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import (
            SearchDBQueryError,
            lookup_trace_ids,
        )

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={"case_reference": "Case Reference"},
        )

        mock_backend = MagicMock()
        mock_backend.build_url.return_value = "postgresql://localhost/test"
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=ConnectionError("unreachable"))
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        mock_backend.pooled_connection.return_value = mock_cm

        with (
            patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config,
            patch(
                "app.plugins.agent_replay.services.search_db.get_backend",
                return_value=mock_backend,
            ),
        ):
            mock_config.search_db = mock_db
            with pytest.raises(SearchDBQueryError, match="Database query failed"):
                await lookup_trace_ids("test")



class TestFetchSummariesFromMatches:
    """Test the batched fetch helper."""

    @pytest.mark.asyncio
    async def test_partial_failure_returns_successful(self):
        """When one agent group fails, the other group's traces are still returned."""
        from app.plugins.agent_replay.services.replay_service import (
            _fetch_summaries_from_matches,
        )
        from app.plugins.agent_replay.services.search_db import TraceMatch

        matches = [
            TraceMatch(trace_id="t1", agent_name="good_agent"),
            TraceMatch(trace_id="t2", agent_name="bad_agent"),
        ]

        good_summary = MagicMock()
        good_summary.id = "t1"
        good_summary.name = "good"
        good_summary.tags = []
        good_summary.timestamp = "2025-01-01"
        good_summary.step_count = 1
        good_summary.step_names = ["s1"]

        call_count = 0

        def mock_get_loader(agent_name):
            nonlocal call_count
            call_count += 1
            if agent_name == "bad_agent":
                from app.plugins.agent_replay.services.replay_service import (
                    LangfuseNotConfiguredError,
                )

                raise LangfuseNotConfiguredError("bad agent")
            loader = MagicMock()
            loader.fetch_traces.return_value = [MagicMock()]
            return loader

        from app.plugins.agent_replay.models.replay_schemas import TraceSummary

        with (
            patch(
                "app.plugins.agent_replay.services.replay_service._get_loader",
                side_effect=mock_get_loader,
            ),
            patch(
                "app.plugins.agent_replay.services.replay_service._traces_to_summaries",
                return_value=[
                    TraceSummary(
                        id="t1",
                        name="good",
                        tags=[],
                        timestamp="2025-01-01",
                        step_count=1,
                        step_names=["s1"],
                    )
                ],
            ),
        ):
            summaries = await _fetch_summaries_from_matches(matches, None)

        # Only the good agent's traces are returned
        assert len(summaries) == 1
        assert summaries[0].id == "t1"



class TestGetAgentConfig:
    """Test ReplayDBConfig.get_agent_config() resolution."""

    def test_known_agent_returns_overrides(self):
        """Agent with entry in agents dict uses agent-specific table/columns."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig

        cfg = ReplayDBConfig(
            table="default_table",
            search_columns={"default_col": "Default Label"},
            trace_id_column="default_tid",
            agents={
                "alpha_bot": AgentSearchConfig(
                    table="alpha_bot_cases",
                    search_columns={"case_reference": "Case Reference"},
                    trace_id_column="langfuse_trace_id",
                ),
            },
        )

        resolved = cfg.get_agent_config("alpha_bot")
        assert resolved.table == "alpha_bot_cases"
        assert resolved.search_columns == {"case_reference": "Case Reference"}
        assert resolved.trace_id_column == "langfuse_trace_id"
        assert resolved.schema == "public"  # inherited default

    def test_unknown_agent_returns_defaults(self):
        """Agent not in agents dict falls back to top-level defaults."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig

        cfg = ReplayDBConfig(
            table="default_table",
            search_columns={"default_col": "Default Label"},
            trace_id_column="default_tid",
            agents={
                "alpha_bot": AgentSearchConfig(table="alpha_bot_cases"),
            },
        )

        resolved = cfg.get_agent_config("unknown_agent")
        assert resolved.table == "default_table"
        assert resolved.search_columns == {"default_col": "Default Label"}
        assert resolved.trace_id_column == "default_tid"

    def test_none_agent_returns_defaults(self):
        """None agent_name returns top-level defaults."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig

        cfg = ReplayDBConfig(
            table="default_table",
            search_columns={"default_col": "Default Label"},
            agents={
                "alpha_bot": AgentSearchConfig(table="alpha_bot_cases"),
            },
        )

        resolved = cfg.get_agent_config(None)
        assert resolved.table == "default_table"
        assert resolved.search_columns == {"default_col": "Default Label"}

    def test_partial_override_inherits_defaults(self):
        """Agent with only table override inherits other defaults."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig

        cfg = ReplayDBConfig(
            table="default_table",
            search_columns={"default_col": "Default Label"},
            trace_id_column="default_tid",
            agent_name_column="agent",
            agents={
                "beta_bot": AgentSearchConfig(
                    table="beta_bot_cases",
                    search_columns={"ticket_number": "Ticket Number"},
                ),
            },
        )

        resolved = cfg.get_agent_config("beta_bot")
        assert resolved.table == "beta_bot_cases"
        assert resolved.search_columns == {"ticket_number": "Ticket Number"}
        # Inherited from defaults
        assert resolved.trace_id_column == "default_tid"
        assert resolved.agent_name_column == "agent"

    def test_yaml_agents_parsing(self, tmp_path):
        """YAML loader parses the agents: block correctly."""
        import yaml

        from app.plugins.agent_replay.config import REPLAY_DB_CONFIG_PATH, load_replay_db_config

        config_data = {
            "agent_replay_db": {
                "enabled": True,
                "url": "postgresql://localhost/db",
                "table": "default_table",
                "search_columns": {"default_col": "Default"},
                "agents": {
                    "alpha_bot": {
                        "table": "alpha_bot_cases",
                        "search_columns": {"case_reference": "Case Reference"},
                    },
                    "beta_bot": {
                        "table": "beta_bot_cases",
                        "search_columns": {
                            "ticket_number": "Ticket Number",
                            "business_name": "Business Name",
                        },
                        "trace_id_column": "tid",
                    },
                },
            }
        }

        config_file = tmp_path / "agent_replay_db.yaml"
        config_file.write_text(yaml.dump(config_data))

        with (
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "exists",
                return_value=True,
            ),
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "open",
                return_value=config_file.open(),
            ),
        ):
            cfg = load_replay_db_config()

        assert len(cfg.agents) == 2
        assert cfg.agents["alpha_bot"].table == "alpha_bot_cases"
        assert cfg.agents["alpha_bot"].search_columns == {"case_reference": "Case Reference"}
        assert cfg.agents["beta_bot"].table == "beta_bot_cases"
        assert cfg.agents["beta_bot"].search_columns == {
            "ticket_number": "Ticket Number",
            "business_name": "Business Name",
        }
        assert cfg.agents["beta_bot"].trace_id_column == "tid"
        # Verify resolution works end-to-end
        resolved = cfg.get_agent_config("alpha_bot")
        assert resolved.table == "alpha_bot_cases"
        assert resolved.trace_id_column == "langfuse_trace_id"  # default

    def test_yaml_backward_compat_old_format(self, tmp_path):
        """Old search_column/search_column_label format is auto-converted."""
        import yaml

        from app.plugins.agent_replay.config import REPLAY_DB_CONFIG_PATH, load_replay_db_config

        config_data = {
            "agent_replay_db": {
                "enabled": True,
                "url": "postgresql://localhost/db",
                "search_column": "case_reference",
                "search_column_label": "Case Reference",
                "agents": {
                    "beta_bot": {
                        "table": "beta_cases",
                        "search_column": "ticket_number",
                        "search_column_label": "Ticket Number",
                    },
                },
            }
        }

        config_file = tmp_path / "agent_replay_db.yaml"
        config_file.write_text(yaml.dump(config_data))

        with (
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "exists",
                return_value=True,
            ),
            patch.object(
                type(REPLAY_DB_CONFIG_PATH),
                "open",
                return_value=config_file.open(),
            ),
        ):
            cfg = load_replay_db_config()

        assert cfg.search_columns == {"case_reference": "Case Reference"}
        assert cfg.agents["beta_bot"].search_columns == {"ticket_number": "Ticket Number"}



class TestAgentSearchFields:
    """Test agent_search_fields in the /status response."""

    def test_status_includes_agent_search_fields(self, client):
        """Status response includes agent_search_fields dict."""
        response = client.get("/api/agent-replay/status")
        assert response.status_code == 200
        data = response.json()
        assert "agent_search_fields" in data
        assert isinstance(data["agent_search_fields"], dict)

    def test_agent_search_fields_per_agent_labels(self, client):
        """Each agent gets its own search field labels based on config."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            search_columns={"default_col": "Default Label"},
            agents={
                "alpha_bot": AgentSearchConfig(
                    search_columns={"case_reference": "Case Reference"},
                ),
                "beta_bot": AgentSearchConfig(
                    search_columns={"ticket_number": "Ticket Number"},
                ),
            },
        )
        with patch("app.plugins.agent_replay.services.replay_service.replay_config") as mock_config:
            mock_config.search_db = mock_db
            mock_config.langfuse_agents = {"alpha_bot": MagicMock(), "beta_bot": MagicMock()}
            mock_config.default_limit = 20
            mock_config.default_days_back = 7
            response = client.get("/api/agent-replay/status")

        data = response.json()
        assert "alpha_bot" in data["agent_search_fields"]
        assert "beta_bot" in data["agent_search_fields"]

        alpha_fields = data["agent_search_fields"]["alpha_bot"]
        assert len(alpha_fields) == 2
        assert alpha_fields[0]["value"] == "trace_id"
        assert alpha_fields[1]["value"] == "case_reference"
        assert alpha_fields[1]["label"] == "Case Reference"

        beta_fields = data["agent_search_fields"]["beta_bot"]
        assert beta_fields[1]["value"] == "ticket_number"
        assert beta_fields[1]["label"] == "Ticket Number"


class TestLookupWithAgentName:
    """Test lookup_trace_ids with agent_name parameter."""

    @pytest.mark.asyncio
    async def test_lookup_uses_agent_resolved_config(self):
        """lookup_trace_ids with agent_name uses the resolved table/columns."""
        from app.plugins.agent_replay.config import AgentSearchConfig, ReplayDBConfig
        from app.plugins.agent_replay.services.search_db import lookup_trace_ids

        mock_db = ReplayDBConfig(
            enabled=True,
            url="postgresql://localhost/test",
            table="default_table",
            search_columns={"default_col": "Default"},
            trace_id_column="default_tid",
            agents={
                "beta_bot": AgentSearchConfig(
                    table="beta_bot_cases",
                    search_columns={"ticket_number": "Ticket Number"},
                    trace_id_column="tid",
                ),
            },
        )

        mock_conn = AsyncMock()
        mock_conn.fetch_all = AsyncMock(
            return_value=[
                {"tid": "trace-bb-1"},
            ]
        )

        mock_backend = MagicMock()
        mock_backend.build_url.return_value = "postgresql://localhost/test"
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        mock_backend.pooled_connection.return_value = mock_cm

        with (
            patch("app.plugins.agent_replay.services.search_db.replay_config") as mock_config,
            patch(
                "app.plugins.agent_replay.services.search_db.get_backend",
                return_value=mock_backend,
            ),
        ):
            mock_config.search_db = mock_db
            results = await lookup_trace_ids("TKT-123", agent_name="beta_bot", limit=10)

        assert len(results) == 1
        assert results[0].trace_id == "trace-bb-1"

        # Verify the query was built with the resolved column name
        query_str = mock_conn.fetch_all.call_args[0][0]
        assert "beta_bot_cases" in query_str
        assert "ticket_number" in query_str
