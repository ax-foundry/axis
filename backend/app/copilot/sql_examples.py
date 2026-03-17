"""Verified Q→SQL example store — site-specific examples injected into schema context.

Examples live in ``custom/config/sql_examples.yaml`` (gitignored).
A committed template lives in ``backend/config/sql_examples.yaml.example``.

Lifecycle: lazy singleton, changes take effect on next process restart.
Trust boundary: content is injected verbatim into the system prompt — treat as
trusted administrator input only (not user-supplied content).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import yaml

from app.config.paths import get_custom_dir

logger = logging.getLogger("axis.copilot.sql_examples")

_store_instance: SqlExampleStore | None = None
_MAX_EXAMPLES = 3
_WB_RE_CACHE: dict[str, re.Pattern[str]] = {}


@dataclass
class SqlExample:
    """A single verified Q→SQL pair with keyword triggers."""

    triggers: list[str]
    description: str
    sql: str


def _wb_pattern(trigger: str) -> re.Pattern[str]:
    """Return a cached word-boundary regex for a trigger phrase."""
    if trigger not in _WB_RE_CACHE:
        _WB_RE_CACHE[trigger] = re.compile(
            r"(?<!\w)" + re.escape(trigger) + r"(?!\w)", re.IGNORECASE
        )
    return _WB_RE_CACHE[trigger]


class SqlExampleStore:
    """Loads and queries verified Q→SQL examples from custom/config/sql_examples.yaml."""

    def __init__(self) -> None:
        """Initialize with an empty example list."""
        self._examples: list[SqlExample] = []

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton — for testing only."""
        global _store_instance
        _store_instance = None

    def discover(self) -> None:
        """Load examples from custom/config/sql_examples.yaml if it exists."""
        yaml_path = get_custom_dir() / "config" / "sql_examples.yaml"
        if not yaml_path.exists():
            logger.debug("No sql_examples.yaml found at %s — skipping", yaml_path)
            return
        try:
            raw = yaml_path.read_bytes().decode("utf-8-sig")
            data = yaml.safe_load(raw) or {}
        except Exception as exc:
            logger.warning("Failed to load sql_examples.yaml: %s", exc)
            return

        for item in data.get("examples", []):
            if not isinstance(item, dict):
                continue
            sql = str(item.get("sql", "")).strip()
            description = str(item.get("description", "")).strip()
            raw_triggers = item.get("triggers", [])
            if not isinstance(raw_triggers, list):
                raw_triggers = [raw_triggers]
            triggers = [str(t).lower().strip() for t in raw_triggers if t]
            if sql and triggers:
                self._examples.append(
                    SqlExample(triggers=triggers, description=description, sql=sql)
                )

        logger.info("SQL example store ready: %d examples loaded", len(self._examples))

    def select(self, message: str, max_examples: int = _MAX_EXAMPLES) -> list[SqlExample]:
        """Return examples whose triggers word-boundary-match the message.

        Preserves insertion order, caps at max_examples.
        """
        msg_lower = message.lower()
        matched: list[SqlExample] = []
        seen: set[int] = set()

        for i, ex in enumerate(self._examples):
            if any(_wb_pattern(t).search(msg_lower) for t in ex.triggers) and i not in seen:
                matched.append(ex)
                seen.add(i)
                if len(matched) >= max_examples:
                    break

        return matched

    def get_injection(self, selected: list[SqlExample]) -> str:
        """Render selected examples as a SQL comment block for schema context injection."""
        if not selected:
            return ""
        parts = ["-- Verified examples for this deployment:"]
        for ex in selected:
            if ex.description:
                parts.append(f"-- Q: {ex.description}")
            parts.append(ex.sql.strip())
            parts.append("")
        return "\n".join(parts).rstrip()


def get_sql_example_store() -> SqlExampleStore:
    """Lazy singleton accessor."""
    global _store_instance
    if _store_instance is None:
        _store_instance = SqlExampleStore()
        _store_instance.discover()
    return _store_instance
