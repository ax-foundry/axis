"""Tests for SkillRegistry — discovery, selection, injection, agent integration."""
from contextlib import suppress
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _write_skill(
    base: Path,
    name: str,
    body: str = "body",
    triggers: list[str] | None = None,
    priority: int = 0,
) -> None:
    d = base / name
    d.mkdir(parents=True, exist_ok=True)
    trig_yaml = "\n".join(f"  - {t}" for t in (triggers or []))
    (d / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: test\nversion: '1.0'\npriority: {priority}\ntriggers:\n{trig_yaml}\n---\n\n{body}",
        encoding="utf-8",
    )


# --- discovery ---


def test_discover_loads_three_builtin_skills() -> None:
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    reg.discover()
    names = {s.name for s in reg.list_skill_headers()}
    assert {"plot", "sql", "analysis"}.issubset(names)


def test_custom_skill_overrides_builtin(tmp_path: Path) -> None:
    custom_skills = tmp_path / "skills"
    _write_skill(custom_skills, "plot", body="custom plot body", triggers=["plot"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with patch("app.copilot.skills.registry.get_custom_dir", return_value=tmp_path):
        reg.discover()
    assert reg._skills["plot"].body == "custom plot body"


def test_skill_missing_frontmatter_is_skipped(tmp_path: Path) -> None:
    bad = tmp_path / "bad"
    bad.mkdir()
    (bad / "SKILL.md").write_text("no frontmatter", encoding="utf-8")
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    assert len(reg._skills) == 0


# --- selection ---


def test_select_skills_word_boundary_match(tmp_path: Path) -> None:
    _write_skill(tmp_path, "plot", body="plot body", triggers=["chart"])
    _write_skill(tmp_path, "sql", body="sql body", triggers=["query"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("show me a bar chart")
    assert any(s.name == "plot" for s in selected)
    assert not any(s.name == "sql" for s in selected)


def test_select_skills_no_false_positive_substring(tmp_path: Path) -> None:
    """'chart' trigger must not match 'uncharted' via plain substring."""
    _write_skill(tmp_path, "plot", body="plot body", triggers=["chart"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("my data is uncharted territory")
    # word-boundary regex should NOT match "chart" inside "uncharted"
    assert not any(s.name == "plot" for s in selected)


def test_select_skills_empty_triggers_always_included(tmp_path: Path) -> None:
    _write_skill(tmp_path, "always", body="always body", triggers=[])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("anything at all")
    assert any(s.name == "always" for s in selected)


def test_select_skills_analysis_matches_average(tmp_path: Path) -> None:
    """'analysis' skill with 'average' trigger must match 'what is the average score'."""
    _write_skill(tmp_path, "analysis", body="analysis body", triggers=["average", "statistics"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("what is the average score?")
    assert any(s.name == "analysis" for s in selected)


# --- injection ---


def test_injection_renders_only_matched_skills(tmp_path: Path) -> None:
    _write_skill(tmp_path, "plot", body="plot body", triggers=["plot"])
    _write_skill(tmp_path, "sql", body="sql body", triggers=["sql"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("make a plot")
    injection = reg.get_system_prompt_injection(selected)
    assert "<skills>" in injection
    assert "plot body" in injection
    assert "sql body" not in injection


def test_injection_empty_on_no_match(tmp_path: Path) -> None:
    _write_skill(tmp_path, "plot", body="plot body", triggers=["chart"])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    selected = reg.select_skills("unrelated request about nothing")
    assert reg.get_system_prompt_injection(selected) == ""


def test_list_skill_headers_returns_no_body(tmp_path: Path) -> None:
    _write_skill(tmp_path, "test_skill", body="should not appear", triggers=[])
    from app.copilot.skills.registry import SkillRegistry

    reg = SkillRegistry()
    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
    ):
        reg.discover()
    headers = reg.list_skill_headers()
    assert len(headers) == 1
    assert not hasattr(headers[0], "body") or headers[0].__class__.__name__ == "SkillHeader"


# --- agent.py integration ---


@pytest.mark.asyncio
async def test_pydantic_agent_injects_skills_in_system_prompt(tmp_path: Path) -> None:
    """CopilotAgent.process() must set skills_injection on deps, which flows to system prompt."""
    _write_skill(tmp_path, "plot", body="PLOT SKILL BODY", triggers=["plot"])

    from app.copilot.thoughts import ThoughtStream

    thought_stream = ThoughtStream()

    captured_deps: list = []

    async def fake_run(message: str, deps, **kw):  # type: ignore[no-untyped-def]
        captured_deps.append(deps)
        result = MagicMock()
        result.output = "done"
        return result

    import app.copilot.agent as agent_mod

    copilot_agent = agent_mod.CopilotAgent(thought_stream=thought_stream)
    inner = copilot_agent._get_agent()

    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
        patch("app.copilot.skills.registry._registry_instance", None),
        patch.object(inner, "run", side_effect=fake_run),
    ):
        with suppress(Exception):
            await copilot_agent.process("make a plot", dataset_label="evaluation")

    assert captured_deps, "agent.run() was never called"
    deps = captured_deps[0]
    assert "PLOT SKILL BODY" in deps.skills_injection


# --- oai_agent.py integration ---


@pytest.mark.asyncio
async def test_oai_agent_injects_skills_in_instructions(tmp_path: Path) -> None:
    """OAICopilotAgent._get_agent() must include matched skills in Agent instructions."""
    _write_skill(tmp_path, "plot", body="OAI PLOT SKILL BODY", triggers=["plot"])

    from app.copilot.oai_agent import OAICopilotAgent
    from app.copilot.thoughts import ThoughtStream

    captured_instructions: list[str] = []

    def patched_get_agent(self, skills_injection: str = "") -> MagicMock:  # type: ignore[misc]
        captured_instructions.append(skills_injection)
        m = MagicMock()
        return m

    async def _empty_events():  # async generator that immediately stops
        return
        yield  # make it a generator

    mock_result = MagicMock()
    # stream_events() must return an async iterable (not a coroutine wrapping one)
    mock_result.stream_events = MagicMock(side_effect=_empty_events)
    mock_result.final_output = "done"

    with (
        patch("app.copilot.skills.registry._BUILTIN_SKILLS_DIR", tmp_path),
        patch("app.copilot.skills.registry.get_custom_dir", return_value=Path("/nonexistent")),
        patch("app.copilot.skills.registry._registry_instance", None),
        patch("app.copilot.oai_agent.Runner.run_streamed", return_value=mock_result),
        patch("app.copilot.oai_agent._build_schema_context", new=AsyncMock(return_value="")),
        patch.object(OAICopilotAgent, "_get_agent", patched_get_agent),
    ):
        agent = OAICopilotAgent(thought_stream=ThoughtStream())
        with suppress(Exception):
            await agent.process("make a plot", dataset_label="evaluation")

    assert captured_instructions, "_get_agent was never called"
    assert "OAI PLOT SKILL BODY" in captured_instructions[0]
