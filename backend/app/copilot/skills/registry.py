"""Skill registry — L1/L2 hierarchy with trigger-based selection.

Lifecycle: lazy singleton initialized on first access.
Cache invalidation: process restart required (by design for v1).
Trust boundary: custom/skills/ content is injected verbatim as system prompt — treat as
trusted administrator input only (not user-supplied content).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from app.config.paths import get_custom_dir
from app.copilot.skills.loader import SkillHeader, SkillLoader, SkillMeta

logger = logging.getLogger("axis.copilot.skills")

_registry_instance: SkillRegistry | None = None

# app/skills/ — built-in skill content (committed)
_BUILTIN_SKILLS_DIR = Path(__file__).parent.parent.parent / "skills"

_WORD_BOUNDARY_RE_CACHE: dict[str, re.Pattern[str]] = {}

# Hard caps to prevent unbounded prompt growth
_MAX_SKILLS = 3
_MAX_BODY_CHARS = 12_000


def _wb_pattern(trigger: str) -> re.Pattern[str]:
    """Return a word-boundary regex for a trigger phrase (cached)."""
    if trigger not in _WORD_BOUNDARY_RE_CACHE:
        escaped = re.escape(trigger)
        _WORD_BOUNDARY_RE_CACHE[trigger] = re.compile(
            r"(?<!\w)" + escaped + r"(?!\w)", re.IGNORECASE
        )
    return _WORD_BOUNDARY_RE_CACHE[trigger]


def _match_score(trigger: str, message_lower: str) -> int:
    """Return match quality: 2=word boundary match, 0=no match.

    Word-boundary regex is used exclusively — plain substring is intentionally
    omitted to prevent false positives (e.g. "chart" matching "uncharted").
    """
    if _wb_pattern(trigger).search(message_lower):
        return 2
    return 0


class SkillRegistry:
    """Manages expertise skills injected into agent system prompts."""

    def __init__(self) -> None:
        """Initialize an empty skill registry."""
        self._skills: dict[str, SkillMeta] = {}

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton — for testing only."""
        global _registry_instance
        _registry_instance = None

    def discover(self) -> None:
        """Load built-ins then custom overrides (custom wins on name collision)."""
        self._load_from_dir(_BUILTIN_SKILLS_DIR, label="builtin")
        custom_dir = get_custom_dir() / "skills"
        if custom_dir.exists():
            self._load_from_dir(custom_dir, label="custom")
        logger.info("Skill registry ready: %d skills (%s)", len(self._skills), sorted(self._skills))

    def _load_from_dir(self, base: Path, label: str) -> None:
        if not base.exists():
            return
        for skill_dir in sorted(base.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_file = skill_dir / "SKILL.md"
            if skill_file.exists():
                skill = SkillLoader.load(skill_file)
                if skill:
                    self._skills[skill.name] = skill
                    logger.debug("Loaded %s skill: %s", label, skill.name)

    def list_skill_headers(self) -> list[SkillHeader]:
        """Return L1 metadata only for all loaded skills.

        Sorted by priority desc, then name — stable across calls.
        """
        headers = [
            SkillHeader(
                name=s.name,
                description=s.description,
                version=s.version,
                priority=s.priority,
                triggers=s.triggers,
            )
            for s in self._skills.values()
        ]
        headers.sort(key=lambda h: (-h.priority, h.name))
        return headers

    def select_skills(
        self,
        message: str,
        conversation_context: list[str] | None = None,
    ) -> list[SkillMeta]:
        """Return skills to inject for this message, capped at _MAX_SKILLS.

        Matching:
        - Empty-trigger skills: always-include (appended after scored results).
        - Word-boundary match = score 2, plain substring match = score 1.
        - Recent conversation turns (conversation_context) score 1 each for follow-up awareness.

        Sorted: scored desc → priority desc → name. Capped to _MAX_SKILLS.
        Duplicate skill names are impossible (registry keys on name).
        """
        message_lower = message.lower()
        context_lower = " ".join(conversation_context or []).lower()

        scored: list[tuple[int, SkillMeta]] = []
        always: list[SkillMeta] = []

        for skill in self._skills.values():
            if not skill.triggers:
                always.append(skill)
                continue
            msg_best = max((_match_score(t, message_lower) for t in skill.triggers), default=0)
            ctx_best = (
                max((_match_score(t, context_lower) for t in skill.triggers), default=0)
                if context_lower
                else 0
            )
            best = max(msg_best, ctx_best)
            if best > 0:
                scored.append((best, skill))

        scored.sort(key=lambda x: (-x[0], -x[1].priority, x[1].name))
        selected = [s for _, s in scored]

        # Append always-on skills (sorted by priority desc, name)
        always.sort(key=lambda s: (-s.priority, s.name))
        selected.extend(always)

        return selected[:_MAX_SKILLS]

    def get_system_prompt_injection(self, selected: list[SkillMeta]) -> str:
        """Render L2 bodies for selected skills as a <skills> block.

        Enforces _MAX_BODY_CHARS total to prevent unbounded prompt growth.
        Returns empty string if selected is empty or all bodies are empty.
        """
        if not selected:
            return ""
        parts: list[str] = []
        total = 0
        for s in selected:
            if not s.body:
                continue
            block = f'<skill name="{s.name}">\n{s.body}\n</skill>'
            if total + len(block) > _MAX_BODY_CHARS:
                break
            parts.append(block)
            total += len(block)
        if not parts:
            return ""
        return "\n\n<skills>\n" + "\n\n".join(parts) + "\n</skills>\n"


def get_skill_registry() -> SkillRegistry:
    """Lazy singleton accessor."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = SkillRegistry()
        _registry_instance.discover()
    return _registry_instance
