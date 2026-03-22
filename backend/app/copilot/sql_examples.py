from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

from app.config.paths import get_custom_dir

logger = logging.getLogger("axis.copilot.sql_examples")

_store_instance: SqlExampleStore | None = None
_MAX_EXAMPLES = 3
_WB_RE_CACHE: dict[str, re.Pattern[str]] = {}

# Built-in examples shipped with AXIS (committed to repo)
_BUILTIN_EXAMPLES_PATH = Path(__file__).parent / "builtin_sql_examples.yaml"


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
        self._agent_examples: dict[str, list[SqlExample]] = {}

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton — for testing only."""
        global _store_instance
        _store_instance = None

    def discover(self) -> None:
        """Load built-in examples, then custom examples on top.

        Built-in examples ship with AXIS (``builtin_sql_examples.yaml``).
        Custom examples in ``custom/config/sql_examples.yaml`` extend them.
        Both are scored together — the top ``_MAX_EXAMPLES`` by match quality win.
        """
        # 1. Built-in examples (shipped with repo)
        self._load_yaml(_BUILTIN_EXAMPLES_PATH, label="builtin")

        # 2. Custom deployment examples (extend, not replace)
        custom_path = get_custom_dir() / "config" / "sql_examples.yaml"
        self._load_yaml(custom_path, label="custom")

        logger.info(
            "SQL example store ready: %d global + %d agent-specific examples",
            len(self._examples),
            sum(len(v) for v in self._agent_examples.values()),
        )

    def _load_yaml(self, yaml_path: Path, label: str) -> None:
        """Parse a single YAML file and append its examples to the store."""
        if not yaml_path.exists():
            logger.debug("No %s sql_examples at %s — skipping", label, yaml_path)
            return
        try:
            raw = yaml_path.read_bytes().decode("utf-8-sig")
            data = yaml.safe_load(raw) or {}
        except Exception as exc:
            logger.warning("Failed to load %s sql_examples (%s): %s", label, yaml_path, exc)
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

        # Load optional per-agent examples
        raw_agent_ex = data.get("agent_examples", {})
        if isinstance(raw_agent_ex, dict):
            for agent_name, items in raw_agent_ex.items():
                if not isinstance(items, list):
                    continue
                agent_list = self._agent_examples.setdefault(str(agent_name), [])
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    sql = str(item.get("sql", "")).strip()
                    description = str(item.get("description", "")).strip()
                    raw_triggers = item.get("triggers", [])
                    if not isinstance(raw_triggers, list):
                        raw_triggers = [raw_triggers]
                    triggers = [str(t).lower().strip() for t in raw_triggers if t]
                    if sql and triggers:
                        agent_list.append(
                            SqlExample(triggers=triggers, description=description, sql=sql)
                        )

    def _select_from(
        self, examples: list[SqlExample], message: str, max_examples: int = _MAX_EXAMPLES
    ) -> list[SqlExample]:
        """Return examples whose triggers word-boundary-match the message.

        Preserves insertion order, caps at max_examples. Deduplicates by object id.
        """
        msg_lower = message.lower()
        matched: list[SqlExample] = []
        seen: set[int] = set()

        for ex in examples:
            eid = id(ex)
            if eid not in seen and any(_wb_pattern(t).search(msg_lower) for t in ex.triggers):
                matched.append(ex)
                seen.add(eid)
                if len(matched) >= max_examples:
                    break

        return matched

    def select(self, message: str, max_examples: int = _MAX_EXAMPLES) -> list[SqlExample]:
        """Return global examples whose triggers word-boundary-match the message."""
        return self._select_from(self._examples, message, max_examples)

    def select_for_agent(
        self, message: str, agent_name: str | None, max_examples: int = _MAX_EXAMPLES
    ) -> list[SqlExample]:
        """Return examples for the given agent prepended before globals, capped at max_examples.

        Per-agent examples are scored first so they win when the cap is hit.
        """
        candidates: list[SqlExample] = []
        if agent_name and agent_name in self._agent_examples:
            candidates = list(self._agent_examples[agent_name])
        candidates += list(self._examples)
        return self._select_from(candidates, message, max_examples)

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
