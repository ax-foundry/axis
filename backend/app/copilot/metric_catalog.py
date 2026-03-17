"""Metric catalog — per-metric semantic descriptions and signal payload hints for copilot injection.

Loaded from ``custom/config/metric_definitions.yaml`` (gitignored).
The ``metric_catalog`` section extends the basic ``metric_definitions`` with
signal payload structure, score ranges, category, and threshold — injected into
the copilot's schema context alongside DDL schema hints.

Lifecycle: lazy singleton, changes take effect on next process restart.
Trust boundary: content is injected verbatim into the agent system prompt — treat as
trusted administrator input only (not user-supplied content).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import yaml

from app.config.paths import get_custom_dir

logger = logging.getLogger("axis.copilot.metric_catalog")

_catalog_instance: MetricCatalogStore | None = None

# Hard cap: prevent unbounded prompt growth
_MAX_CATALOG_CHARS = 3_000

# Maps DuckDB table names to metric_catalog domain keys
_TABLE_DOMAIN: dict[str, str] = {
    "monitoring_data": "monitoring",
    "eval_data": "eval",
    "kpi_data": "kpi",
    "human_signals_cases": "human_signals",
}


@dataclass
class SignalPayloadDef:
    """Describes the structure of a metric's signals JSON payload."""

    payload_kind: str = "unknown"
    # For grouped_signal_dict: fields present in each group entry
    group_fields: list[str] = field(default_factory=list)
    note: str = ""


@dataclass
class MetricEntry:
    """One metric in the catalog — semantic description + optional signal payload hints."""

    name: str
    description: str = ""
    category: str = ""
    score_range: str = ""
    threshold: float | None = None
    signals: SignalPayloadDef | None = None


def _parse_signals(raw: dict | None) -> SignalPayloadDef | None:  # type: ignore[type-arg]
    if not isinstance(raw, dict):
        return None
    payload_kind = str(raw.get("payload_kind", "")).strip()
    if not payload_kind:
        return None
    raw_fields = raw.get("group_fields") or []
    group_fields = [str(f) for f in raw_fields] if isinstance(raw_fields, list) else []
    return SignalPayloadDef(
        payload_kind=payload_kind,
        group_fields=group_fields,
        note=str(raw.get("note", "")).strip(),
    )


def _parse_metric_entry(name: str, raw: dict | None) -> MetricEntry:  # type: ignore[type-arg]
    if not isinstance(raw, dict):
        return MetricEntry(name=name)
    threshold: float | None = None
    try:
        raw_thresh = raw.get("threshold")
        if raw_thresh is not None:
            threshold = float(raw_thresh)
    except (TypeError, ValueError):
        pass
    return MetricEntry(
        name=name,
        description=str(raw.get("description", "")).strip(),
        category=str(raw.get("category", "")).strip(),
        score_range=str(raw.get("score_range", "")).strip(),
        threshold=threshold,
        signals=_parse_signals(raw.get("signals")),
    )


class MetricCatalogStore:
    """Loads and renders metric catalog hints from custom/config/metric_definitions.yaml.

    The ``metric_catalog`` section provides per-metric semantic hints injected into the
    copilot's schema context alongside DDL schema hints.  Rendering is separate from
    table-structure hints (SchemaHintsStore) so each layer can be maintained independently.
    """

    def __init__(self) -> None:
        """Initialize with empty catalog."""
        # domain → {metric_name → MetricEntry}
        self._catalog: dict[str, dict[str, MetricEntry]] = {}

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton — for testing only."""
        global _catalog_instance
        _catalog_instance = None

    def discover(self) -> None:
        """Load catalog from custom/config/metric_definitions.yaml if it exists."""
        yaml_path = get_custom_dir() / "config" / "metric_definitions.yaml"
        if not yaml_path.exists():
            logger.debug("No metric_definitions.yaml at %s — metric catalog empty", yaml_path)
            return
        try:
            raw_text = yaml_path.read_bytes().decode("utf-8-sig")
            data = yaml.safe_load(raw_text) or {}
        except Exception as exc:
            logger.warning("Failed to load metric_definitions.yaml for catalog: %s", exc)
            return

        catalog_raw = data.get("metric_catalog")
        if not isinstance(catalog_raw, dict):
            logger.debug("No 'metric_catalog' section in metric_definitions.yaml — catalog empty")
            return

        total = 0
        for domain, metrics_raw in catalog_raw.items():
            if not isinstance(metrics_raw, dict):
                continue
            domain_entries: dict[str, MetricEntry] = {}
            for metric_name, metric_raw in metrics_raw.items():
                entry = _parse_metric_entry(str(metric_name), metric_raw)
                domain_entries[entry.name] = entry
                total += 1
            self._catalog[str(domain)] = domain_entries

        logger.info(
            "Metric catalog ready: %d entries across %d domains (%s)",
            total,
            len(self._catalog),
            sorted(self._catalog),
        )

    def get_injection(
        self,
        table: str,
        metric_names: list[str] | None = None,
    ) -> str:
        """Return a compact catalog comment block for the given table.

        If *metric_names* is provided (e.g. from filter_values), only those
        metrics are rendered — useful when the data has many metrics.
        Returns empty string when no catalog entries exist for this table.
        """
        domain = _TABLE_DOMAIN.get(table)
        if domain is None:
            return ""
        domain_entries = self._catalog.get(domain)
        if not domain_entries:
            return ""

        if metric_names:
            names_lower = {n.lower() for n in metric_names}
            entries = [e for e in domain_entries.values() if e.name.lower() in names_lower]
        else:
            entries = list(domain_entries.values())

        if not entries:
            return ""

        parts: list[str] = [f"-- Metric catalog for {table} ({len(entries)} metrics):"]
        total_chars = len(parts[0])

        for entry in entries:
            header = f"-- [{entry.name}]"
            if entry.category:
                header += f" {entry.category}"
            if entry.score_range:
                header += f" score={entry.score_range}"
            if entry.threshold is not None:
                header += f" threshold≥{entry.threshold}"
            if entry.description:
                desc = entry.description[:120].replace("\n", " ")
                header += f" — {desc}"
            parts.append(header)
            total_chars += len(header)

            if entry.signals:
                sig = entry.signals
                sig_line = f"--   signals.payload_kind={sig.payload_kind}"
                if sig.note:
                    sig_line += f". {sig.note[:100]}"
                if sig.group_fields:
                    fields_str = ", ".join(sig.group_fields[:8])
                    sig_line += f". group_fields: [{fields_str}]"
                parts.append(sig_line)
                total_chars += len(sig_line)

            if total_chars > _MAX_CATALOG_CHARS:
                parts.append("-- ... (truncated — see metric_definitions.yaml for full catalog)")
                break

        return "\n".join(parts)

    def list_entries(self, domain: str) -> list[MetricEntry]:
        """Return all entries for a domain — for use by schema-dump and generator."""
        return list(self._catalog.get(domain, {}).values())

    def all_domains(self) -> list[str]:
        """Return all loaded domain names."""
        return sorted(self._catalog)


def get_metric_catalog_store() -> MetricCatalogStore:
    """Lazy singleton accessor."""
    global _catalog_instance
    if _catalog_instance is None:
        _catalog_instance = MetricCatalogStore()
        _catalog_instance.discover()
    return _catalog_instance
