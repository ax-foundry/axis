"""Tests for SkillLoader edge cases."""
from pathlib import Path


def test_loader_handles_crlf_frontmatter(tmp_path: Path) -> None:
    p = tmp_path / "SKILL.md"
    p.write_bytes(
        b"---\r\nname: test\r\ndescription: d\r\nversion: '1.0'\r\ntriggers: []\r\npriority: 0\r\n---\r\n\nbody here"
    )
    from app.copilot.skills.loader import SkillLoader

    skill = SkillLoader.load(p)
    assert skill is not None and skill.name == "test" and skill.body == "body here"


def test_loader_strips_utf8_bom(tmp_path: Path) -> None:
    p = tmp_path / "SKILL.md"
    p.write_bytes(
        b"\xef\xbb\xbf---\nname: bom_test\ndescription: d\nversion: '1.0'\ntriggers: []\npriority: 0\n---\n\nbody"
    )
    from app.copilot.skills.loader import SkillLoader

    skill = SkillLoader.load(p)
    assert skill is not None and skill.name == "bom_test"


def test_loader_non_list_triggers_defaults_to_empty(tmp_path: Path) -> None:
    p = tmp_path / "SKILL.md"
    p.write_text(
        "---\nname: t\ndescription: d\nversion: '1.0'\ntriggers: 'not a list'\npriority: 0\n---\n\nbody",
        encoding="utf-8",
    )
    from app.copilot.skills.loader import SkillLoader

    skill = SkillLoader.load(p)
    assert skill is not None and skill.triggers == []


def test_loader_returns_none_for_missing_name(tmp_path: Path) -> None:
    p = tmp_path / "SKILL.md"
    p.write_text(
        "---\ndescription: d\ntriggers: []\npriority: 0\n---\n\nbody", encoding="utf-8"
    )
    from app.copilot.skills.loader import SkillLoader

    assert SkillLoader.load(p) is None


def test_loader_empty_body_is_valid(tmp_path: Path) -> None:
    p = tmp_path / "SKILL.md"
    p.write_text(
        "---\nname: empty\ndescription: d\nversion: '1.0'\ntriggers: []\npriority: 0\n---\n",
        encoding="utf-8",
    )
    from app.copilot.skills.loader import SkillLoader

    skill = SkillLoader.load(p)
    assert skill is not None and skill.body == ""
