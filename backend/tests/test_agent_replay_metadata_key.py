"""The metadata key a non-trace-id search matches on, per agent with a global fallback."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

from app.plugins.agent_replay import config as replay_config
from app.plugins.agent_replay.config import AgentReplayOverrides, ReplayConfig
from app.plugins.agent_replay.services import replay_service

if TYPE_CHECKING:
    from pathlib import Path

YAML = """
agent_replay:
  search_metadata_key: case_ref
  agents:
    athena:
      search_metadata_key: quote_locator
    abby:
      search_metadata_key: ""
    dwayne:
      session_turn_name: dwayne-web-chat
"""


def _load(tmp_path: Path, text: str) -> ReplayConfig:
    path = tmp_path / "agent_replay.yaml"
    path.write_text(text)
    with (
        patch.object(replay_config, "REPLAY_CONFIG_PATH", path),
        patch.object(replay_config, "discover_langfuse_agents", return_value={}),
        patch.object(replay_config, "load_replay_db_config"),
    ):
        return replay_config.load_replay_config()


class TestConfig:
    def test_agent_key_overrides_the_global_key(self, tmp_path):
        assert _load(tmp_path, YAML).get_search_metadata_key("athena") == "quote_locator"

    def test_agent_without_a_key_falls_back_to_the_global_key(self, tmp_path):
        cfg = _load(tmp_path, YAML)
        assert cfg.get_search_metadata_key("dwayne") == "case_ref"
        assert cfg.get_search_metadata_key("unlisted") == "case_ref"
        assert cfg.get_search_metadata_key(None) == "case_ref"

    def test_empty_agent_key_turns_search_off_for_that_agent(self, tmp_path):
        assert _load(tmp_path, YAML).get_search_metadata_key("abby") == ""

    def test_global_default_when_unset(self, tmp_path):
        cfg = _load(tmp_path, "agent_replay:\n  default_limit: 20\n")
        assert cfg.get_search_metadata_key("athena") == "caseReference"


def _config(**agents: str) -> ReplayConfig:
    return ReplayConfig(
        search_metadata_key="case_ref",
        agents_config={
            name: AgentReplayOverrides(search_metadata_key=key) for name, key in agents.items()
        },
    )


class TestSearch:
    async def _search(self, cfg: ReplayConfig, agent: str):
        search = MagicMock(return_value=["t1"])
        with (
            patch.object(replay_service, "get_replay_config", return_value=cfg),
            patch.object(replay_service, "_get_loader", return_value=MagicMock()),
            patch.object(replay_service, "search_trace_ids_by_metadata", search),
            patch.object(replay_service, "_summaries_for_ids", return_value=[]),
        ):
            await replay_service.search_traces("not-a-trace-id", agent_name=agent)
        return search

    async def test_searches_on_the_agent_key(self):
        search = await self._search(_config(athena="quote_locator"), "athena")
        assert search.call_args.args[1:3] == ("quote_locator", "not-a-trace-id")

    async def test_searches_on_the_global_key_without_an_override(self):
        search = await self._search(_config(athena="quote_locator"), "dwayne")
        assert search.call_args.args[1] == "case_ref"

    async def test_empty_key_returns_nothing_without_reading_langfuse(self):
        search = await self._search(_config(abby=""), "abby")
        search.assert_not_called()
