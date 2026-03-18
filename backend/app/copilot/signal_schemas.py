"""Signal schema store — per-metric JSON field documentation for monitoring_data.signals.

The copilot calls describe_metric_signals(metric_name) when a user question
requires drilling into sub-fields of the signals JSON blob.  This module loads
the YAML config and formats the schema as a prompt-ready string.
"""

from __future__ import annotations

import logging
from typing import Any

import yaml

from app.config.paths import resolve_config_path

logger = logging.getLogger(__name__)

_store: SignalSchemaStore | None = None


def get_signal_schema_store() -> SignalSchemaStore:
    """Return the singleton SignalSchemaStore, loading on first call."""
    global _store
    if _store is None:
        _store = SignalSchemaStore()
        _store.discover()
    return _store


class SignalSchemaStore:
    """Loads and serves per-metric signal JSON schemas from YAML config."""

    def __init__(self) -> None:
        """Initialize with an empty schema registry."""
        self._schemas: dict[str, dict[str, Any]] = {}

    def discover(self) -> None:
        """Load signal_schemas.yaml from the custom config directory."""
        path = resolve_config_path("signal_schemas.yaml")
        if path is None:
            logger.info(
                "signal_schemas.yaml not found — describe_metric_signals tool will report no schemas loaded"
            )
            return

        try:
            with path.open(encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except Exception:
            logger.exception("Failed to load signal_schemas.yaml")
            return

        metrics = data.get("metrics") or {}
        if not isinstance(metrics, dict):
            logger.warning("signal_schemas.yaml: 'metrics' key is not a dict")
            return

        self._schemas = metrics
        logger.info("Loaded signal schemas for %d metrics", len(self._schemas))

    def list_metrics(self) -> list[str]:
        """Return the list of metric names with schemas available."""
        return list(self._schemas.keys())

    def format_for_prompt(self, metric_name: str) -> str:
        """Return a prompt-ready description of the signals JSON schema for a metric.

        Args:
            metric_name: Exact metric_name value from monitoring_data
                         (e.g. 'Trigger Analysis').

        Returns:
            Formatted string with field paths, types, values, and SQL examples.
            Returns a helpful error message if the metric is not found.
        """
        schema = self._schemas.get(metric_name)
        if schema is None:
            available = ", ".join(sorted(self._schemas.keys())) or "none"
            return (
                f"No signal schema found for metric '{metric_name}'. "
                f"Available metrics: {available}"
            )

        lines: list[str] = []
        lines.append(f"=== Signal schema: {metric_name} ===")

        # Always prepend the coercion note — signals is stored as Python repr(), not JSON.
        lines.append(
            "IMPORTANT: The signals column is stored as a Python dict string "
            "(single quotes, None, True, False) — NOT valid JSON. "
            "You MUST coerce it before using json_extract*(). "
            "Use this CTE at the top of every query that reads signals sub-fields:\n"
            "\n"
            "  WITH base AS (\n"
            "    SELECT *,\n"
            "      TRY_CAST(\n"
            "        regexp_replace(\n"
            "          regexp_replace(\n"
            "            regexp_replace(\n"
            "              replace(signals, '''', '\"'),\n"
            "            'None', 'null', 'g'),\n"
            "          '\\bTrue\\b', 'true', 'g'),\n"
            "        '\\bFalse\\b', 'false', 'g')\n"
            "      AS JSON) AS sig\n"
            "    FROM monitoring_data\n"
            f"    WHERE metric_name = '{metric_name}'\n"
            "  )\n"
            "  SELECT json_extract_string(sig, '$.field') ...\n"
            "  FROM base WHERE sig IS NOT NULL\n"
            "\n"
            "Replace signals with sig in all json_extract*() calls. "
            "Rows where coercion fails (sig IS NULL) are excluded automatically."
        )
        lines.append("")

        description = schema.get("description", "")
        if description:
            lines.append(description.strip())

        lines.append("")

        # --- Scalar fields ---
        scalars = schema.get("scalars") or []
        if scalars:
            lines.append("Scalar fields (extract with json_extract / json_extract_string):")
            for field in scalars:
                path = field.get("path", "")
                ftype = field.get("type", "")
                desc = field.get("description", "")
                values = field.get("values") or []

                # Build extraction hint
                if ftype in ("integer",):
                    extract = f"CAST(json_extract(signals, '{path}') AS INTEGER)"
                elif ftype in ("float",):
                    extract = f"CAST(json_extract(signals, '{path}') AS DOUBLE)"
                elif ftype in ("boolean",):
                    extract = f"json_extract_string(signals, '{path}')  -- returns 'true'/'false'"
                else:
                    extract = f"json_extract_string(signals, '{path}')"

                lines.append(f"  {path}")
                lines.append(f"    type: {ftype}")
                if desc:
                    lines.append(f"    desc: {desc}")
                lines.append(f"    sql:  {extract}")
                if values:
                    vals_str = ", ".join(str(v) for v in values[:20])
                    suffix = f" (+ {len(values) - 20} more)" if len(values) > 20 else ""
                    lines.append(f"    values: [{vals_str}{suffix}]")

        # --- Array fields ---
        arrays = schema.get("arrays") or []
        if arrays:
            lines.append("")
            lines.append("Array fields (use UNNEST or per-row json_extract with array index):")
            for arr in arrays:
                path = arr.get("path", "")
                desc = arr.get("description", "")
                item_fields = arr.get("item_fields") or []
                lines.append(f"  {path}")
                if desc:
                    lines.append(f"    {desc}")
                for ifield in item_fields:
                    iname = ifield.get("name", "")
                    itype = ifield.get("type", "")
                    idesc = ifield.get("description", "")
                    ivalues = ifield.get("values") or []
                    item_line = f"    .{iname}  ({itype})"
                    if idesc:
                        item_line += f"  — {idesc}"
                    if ivalues:
                        item_line += f"  Values: {', '.join(str(v) for v in ivalues)}"
                    lines.append(item_line)

        # --- Examples ---
        examples = schema.get("examples") or []
        if examples:
            lines.append("")
            lines.append("Example queries:")
            for ex in examples:
                edesc = ex.get("description", "")
                esql = ex.get("sql", "").rstrip()
                if edesc:
                    lines.append(f"  -- {edesc}")
                for sql_line in esql.splitlines():
                    lines.append(f"  {sql_line}")
                lines.append("")

        return "\n".join(lines)
