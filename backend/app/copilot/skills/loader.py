"""Skill file loader — reads SKILL.md with YAML frontmatter."""

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger("axis.copilot.skills")

# Matches ---\n block at start of file; tolerates \r\n
_FRONT_MATTER_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)


@dataclass
class SkillHeader:
    """L1-only metadata — no body. Suitable for listings and matching."""

    name: str
    description: str
    version: str
    priority: int
    triggers: list[str]


@dataclass
class SkillMeta(SkillHeader):
    """Full skill data: L1 metadata + L2 body."""

    body: str = field(default="")  # L2 markdown body


class SkillLoader:
    """Reads a SKILL.md file and parses its YAML frontmatter."""

    @classmethod
    def load(cls, path: Path) -> "SkillMeta | None":
        """Return SkillMeta or None (logs reason for skip)."""
        try:
            raw = path.read_bytes()
        except OSError as exc:
            logger.warning("Skill: cannot read %s: %s", path, exc)
            return None

        # Strip UTF-8 BOM; normalize CRLF
        text = raw.decode("utf-8-sig").replace("\r\n", "\n")

        m = _FRONT_MATTER_RE.match(text)
        if not m:
            logger.debug("Skill: no frontmatter in %s — skipped", path)
            return None

        try:
            meta: dict = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError as exc:
            logger.warning("Skill: invalid YAML in %s: %s — skipped", path, exc)
            return None

        name = meta.get("name", "")
        if not isinstance(name, str) or not name.strip():
            logger.warning("Skill: missing/invalid 'name' in %s — skipped", path)
            return None

        raw_triggers = meta.get("triggers", [])
        if not isinstance(raw_triggers, list):
            logger.warning("Skill %s: 'triggers' must be a list — defaulting to []", name)
            raw_triggers = []
        triggers = [str(t).lower().strip() for t in raw_triggers if t]

        priority = meta.get("priority", 0)
        if not isinstance(priority, int):
            priority = 0

        return SkillMeta(
            name=name.strip(),
            description=str(meta.get("description", "")),
            version=str(meta.get("version", "1.0")),
            priority=priority,
            triggers=triggers,
            body=text[m.end() :].strip(),
        )
