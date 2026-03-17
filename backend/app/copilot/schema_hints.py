"""Schema hints — human-readable column/field descriptions for all copilot data tables.

Loaded from ``custom/config/schema_hints.yaml`` (gitignored).
A committed template lives in ``backend/config/schema_hints.yaml.example``.

Lifecycle: lazy singleton, changes take effect on next process restart.
Trust boundary: content is injected verbatim into the agent system prompt — treat as
trusted administrator input only (not user-supplied content).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import yaml

from app.config.paths import get_custom_dir

logger = logging.getLogger("axis.copilot.schema_hints")

_store_instance: SchemaHintsStore | None = None


@dataclass
class ColumnDef:
    """Description of one column (or signal field within a metric)."""

    name: str
    description: str
    values: dict[str, str] | list[str] | None = None
    query_hint: str | None = None


@dataclass
class MetricDef:
    """A {metric}__{signal} column family — shorthand for human_signals_cases."""

    name: str
    description: str
    signals: list[ColumnDef] = field(default_factory=list)


@dataclass
class TableDef:
    """Hint definitions for one DuckDB table."""

    name: str
    description: str
    columns: list[ColumnDef] = field(default_factory=list)
    # Only used for human_signals_cases — {metric}__{signal} shorthand
    metrics: list[MetricDef] = field(default_factory=list)


def _parse_column(raw: dict) -> ColumnDef | None:  # type: ignore[type-arg]
    """Parse one column/signal entry from YAML."""
    name = str(raw.get("name", "")).strip()
    if not name:
        return None
    raw_values = raw.get("values")
    values: dict[str, str] | list[str] | None = None
    if isinstance(raw_values, dict):
        values = {str(k): str(v) for k, v in raw_values.items()}
    elif isinstance(raw_values, list):
        values = [str(v) for v in raw_values]
    return ColumnDef(
        name=name,
        description=str(raw.get("description", "")).strip(),
        values=values,
        query_hint=str(raw.get("query_hint", "")).strip() or None,
    )


class SchemaHintsStore:
    """Loads and renders schema hints from custom/config/schema_hints.yaml."""

    def __init__(self) -> None:
        """Initialize with an empty table map."""
        self._tables: dict[str, TableDef] = {}

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton — for testing only."""
        global _store_instance
        _store_instance = None

    def discover(self) -> None:
        """Load hints from custom/config/schema_hints.yaml if it exists."""
        yaml_path = get_custom_dir() / "config" / "schema_hints.yaml"
        if not yaml_path.exists():
            logger.debug("No schema_hints.yaml found at %s — skipping", yaml_path)
            return
        try:
            raw = yaml_path.read_bytes().decode("utf-8-sig")
            data = yaml.safe_load(raw) or {}
        except Exception as exc:
            logger.warning("Failed to load schema_hints.yaml: %s", exc)
            return

        for item in data.get("tables", []):
            if not isinstance(item, dict):
                continue
            table_name = str(item.get("name", "")).strip()
            if not table_name:
                continue

            columns = [
                c
                for raw_col in item.get("columns", [])
                if isinstance(raw_col, dict) and (c := _parse_column(raw_col)) is not None
            ]

            metrics: list[MetricDef] = []
            for raw_m in item.get("metrics", []):
                if not isinstance(raw_m, dict):
                    continue
                m_name = str(raw_m.get("name", "")).strip()
                if not m_name:
                    continue
                signals = [
                    s
                    for raw_s in raw_m.get("signals", [])
                    if isinstance(raw_s, dict) and (s := _parse_column(raw_s)) is not None
                ]
                metrics.append(
                    MetricDef(
                        name=m_name,
                        description=str(raw_m.get("description", "")).strip(),
                        signals=signals,
                    )
                )

            self._tables[table_name] = TableDef(
                name=table_name,
                description=str(item.get("description", "")).strip(),
                columns=columns,
                metrics=metrics,
            )

        logger.info("Schema hints ready: %d tables (%s)", len(self._tables), sorted(self._tables))

    def get_injection(self, table: str) -> str:
        """Return a DDL comment block describing columns/signals for the given table.

        Returns empty string if no hints are defined for this table.
        """
        tdef = self._tables.get(table)
        if tdef is None:
            return ""

        parts: list[str] = [f"-- Schema hints for {table}:"]
        if tdef.description:
            desc = tdef.description.replace("\n", " ").strip()[:200]
            parts.append(f"-- {desc}")

        # Flat column descriptions
        for col in tdef.columns:
            line = f"-- column {col.name}: {col.description}"
            if isinstance(col.values, dict):
                val_str = "; ".join(f"{k}={v[:60]}" for k, v in list(col.values.items())[:6])
                line += f" [{val_str}]"
            elif isinstance(col.values, list):
                line += f" [{', '.join(col.values[:8])}]"
            parts.append(line)
            if col.query_hint:
                parts.append(f"--   hint: {col.query_hint}")

        # {metric}__{signal} shorthand for human_signals_cases
        for metric in tdef.metrics:
            parts.append(f"-- metric family: {metric.name}")
            if metric.description:
                desc = metric.description.replace("\n", " ").strip()[:160]
                parts.append(f"--   {desc}")
            for sig in metric.signals:
                col_name = f"{metric.name}__{sig.name}"
                line = f"--   {col_name}: {sig.description}"
                if isinstance(sig.values, dict):
                    val_str = "; ".join(f"{k}={v[:60]}" for k, v in list(sig.values.items())[:6])
                    line += f" [{val_str}]"
                elif isinstance(sig.values, list):
                    line += f" [{', '.join(sig.values[:8])}]"
                parts.append(line)
                if sig.query_hint:
                    parts.append(f"--     hint: {sig.query_hint}")

        return "\n".join(parts)


def get_schema_hints_store() -> SchemaHintsStore:
    """Lazy singleton accessor."""
    global _store_instance
    if _store_instance is None:
        _store_instance = SchemaHintsStore()
        _store_instance.discover()
    return _store_instance
