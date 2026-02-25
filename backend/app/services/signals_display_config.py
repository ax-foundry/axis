import logging
from typing import Any

import yaml

from app.config import resolve_config_path

logger = logging.getLogger(__name__)


def _load_yaml_overrides() -> dict[str, Any] | None:
    """Load optional YAML display config overrides."""
    yaml_path = resolve_config_path("signals_metrics.yaml")
    if not yaml_path.exists():
        return None
    try:
        with yaml_path.open() as f:
            data = yaml.safe_load(f)
        return data.get("signals_metrics") if isinstance(data, dict) else None
    except Exception:
        logger.warning("Failed to load signals_metrics.yaml, using auto-generated config")
        return None


def generate_display_config(schema: dict[str, Any]) -> dict[str, Any]:
    """Generate display configuration from metric schema.

    Tries YAML overrides first; falls back to auto-generated defaults.
    Reads ``visible_kpis`` from the human signals DB config to filter KPIs.
    """
    from app.config import human_signals_db_config

    visible_kpis = human_signals_db_config.visible_kpis or None

    overrides = _load_yaml_overrides()
    if overrides:
        return _merge_with_defaults(overrides, schema, visible_kpis=visible_kpis)
    return _generate_defaults(schema, visible_kpis=visible_kpis)


def _generate_defaults(
    schema: dict[str, Any],
    visible_kpis: list[str] | None = None,
) -> dict[str, Any]:
    """Auto-generate display config from schema discovery."""
    metrics = schema.get("metrics", {})
    source_fields = schema.get("source_fields", [])

    kpi_strip = _auto_kpi_strip(metrics, visible_kpis=visible_kpis)
    chart_sections = _auto_chart_sections(metrics)
    filters = _auto_filters(metrics, source_fields)
    table_columns = _auto_table_columns(metrics, source_fields)
    color_maps = _auto_color_maps(metrics)

    return {
        "kpi_strip": kpi_strip,
        "chart_sections": chart_sections,
        "filters": filters,
        "table_columns": table_columns,
        "color_maps": color_maps,
    }


def _auto_kpi_strip(
    metrics: dict[str, Any],
    visible_kpis: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Scan for boolean signals named is_* or has_* → auto-create rate KPIs.

    When ``visible_kpis`` is provided and non-empty, only signal names in that
    list (plus aggregate KPIs like ``avg_message_count`` / ``total_cases``) are
    included. An empty list or None means show all discovered KPIs.
    """
    allowed = set(visible_kpis) if visible_kpis else None
    kpis: list[dict[str, Any]] = []

    for metric_name, meta in metrics.items():
        signal_types = meta.get("signal_types", {})
        for signal, sig_type in signal_types.items():
            if sig_type == "boolean" and (signal.startswith("is_") or signal.startswith("has_")):
                # Filter by visible_kpis when configured
                if allowed and signal not in allowed:
                    continue

                label = signal.replace("_", " ").title()
                # Pick icon based on common patterns
                icon = "target"
                if "complian" in signal:
                    icon = "shield-check"
                elif "intervention" in signal:
                    icon = "target"
                elif "escalat" in signal:
                    icon = "alert-triangle"
                elif "actionable" in signal:
                    icon = "check-circle"
                elif "override" in signal:
                    icon = "rotate-ccw"

                kpis.append(
                    {
                        "metric": metric_name,
                        "signal": signal,
                        "label": label,
                        "format": "percent",
                        "icon": icon,
                        "highlight": "complian" in signal,
                    }
                )

    # Auto-discover numeric signals → aggregation KPIs
    _time_patterns = {"time", "duration", "latency", "elapsed", "wait", "ttq", "tat"}
    for metric_name, meta in metrics.items():
        signal_types = meta.get("signal_types", {})
        for signal, sig_type in signal_types.items():
            if sig_type != "number":
                continue
            # Skip metric scores — they belong to metric evaluation, not operational KPIs
            if signal.endswith("_score"):
                continue
            if allowed and signal not in allowed:
                continue

            label = signal.replace("_", " ").title()
            # Heuristic format: duration for time-related signal names
            signal_lower = signal.lower()
            is_time = any(p in signal_lower for p in _time_patterns)
            fmt = "duration" if is_time else "number"

            # Heuristic icon
            icon = "hash"
            if is_time:
                icon = "clock"
            elif "cost" in signal_lower or "price" in signal_lower or "revenue" in signal_lower:
                icon = "dollar-sign"
            elif "count" in signal_lower or "total" in signal_lower:
                icon = "bar-chart-3"
            elif "rate" in signal_lower or "ratio" in signal_lower:
                icon = "percent"
            elif "efficiency" in signal_lower or "performance" in signal_lower:
                icon = "activity"

            kpis.append(
                {
                    "metric": metric_name,
                    "signal": signal,
                    "label": label,
                    "aggregation": "median",
                    "format": fmt,
                    "icon": icon,
                }
            )

    # Add aggregates (always shown unless explicitly excluded)
    if not allowed or "avg_message_count" in allowed:
        kpis.append(
            {"aggregate": "avg_message_count", "label": "Avg Messages", "icon": "message-square"}
        )
    if not allowed or "total_cases" in allowed:
        kpis.append({"aggregate": "total_cases", "label": "Total Cases", "icon": "database"})

    return kpis


def _auto_chart_sections(metrics: dict[str, Any]) -> list[dict[str, Any]]:
    """Auto-generate chart sections from discovered metrics."""
    sections: list[dict[str, Any]] = []

    # Signals that should appear in the Insights section rather than as classification charts.
    # "text_list" = long-form unique items shown as a numbered list (no frequency counting).
    # "ranked_list" = short categorical items counted by frequency.
    insight_text_array_signals = {"requests", "learnings"}
    insight_category_signals = {"categories"}
    insight_text_string_signals = {"suggested_action"}

    # Find the main classification string signals for bar/donut charts
    classification_charts: list[dict[str, Any]] = []
    insight_charts: list[dict[str, Any]] = []

    for metric_name, meta in metrics.items():
        signal_types = meta.get("signal_types", {})
        values = meta.get("values", {})

        for signal, sig_type in signal_types.items():
            if sig_type == "string" and signal in values:
                if signal in insight_text_string_signals:
                    title = signal.replace("_", " ").title()
                    insight_charts.append(
                        {
                            "metric": metric_name,
                            "signal": signal,
                            "type": "text_list",
                            "title": f"Top {title}s",
                        }
                    )
                elif 2 <= len(values[signal]) <= 20:
                    title = signal.replace("_", " ").title()
                    classification_charts.append(
                        {
                            "metric": metric_name,
                            "signal": signal,
                            "type": "bar",
                            "title": title,
                        }
                    )
            elif sig_type == "array" and signal in insight_text_array_signals:
                title = signal.replace("_", " ").title()
                insight_charts.append(
                    {
                        "metric": metric_name,
                        "signal": signal,
                        "type": "text_list",
                        "title": f"Top {title}",
                    }
                )
            elif sig_type == "array" and signal in insight_category_signals:
                title = signal.replace("_", " ").title()
                insight_charts.append(
                    {
                        "metric": metric_name,
                        "signal": signal,
                        "type": "ranked_list",
                        "title": f"{title} Breakdown",
                    }
                )

    # Group classification charts into sections
    if classification_charts:
        # First major chart gets full width as stacked bar
        if len(classification_charts) >= 1:
            outcome_chart = {**classification_charts[0], "type": "stacked_bar"}
            sections.append(
                {
                    "title": "Outcome Distribution",
                    "layout": "full",
                    "charts": [outcome_chart],
                }
            )

        # Remaining in pairs
        remaining = classification_charts[1:]
        if len(remaining) >= 2:
            sections.append(
                {
                    "title": "Root Cause Analysis",
                    "layout": "grid_2",
                    "charts": remaining[:2],
                }
            )
        elif len(remaining) == 1:
            sections.append(
                {
                    "title": "Breakdown",
                    "layout": "full",
                    "charts": remaining,
                }
            )

        if len(remaining) > 2:
            sections.append(
                {
                    "title": "Additional Metrics",
                    "layout": "grid_2",
                    "charts": remaining[2:4],
                }
            )

    # Insight charts (learnings, requests, actions, categories) — max 2 columns
    if insight_charts:
        n = len(insight_charts)
        sections.append(
            {
                "title": "Insights",
                "layout": "full" if n == 1 else "grid_2",
                "charts": insight_charts,
            }
        )

    return sections


def _auto_filters(
    metrics: dict[str, Any],
    source_fields: list[str],
) -> list[dict[str, Any]]:
    """Auto-generate filter definitions."""
    filters: list[dict[str, Any]] = []

    # Source field filters
    field_labels = {
        "source_name": "Source",
        "source_component": "Component",
        "source_type": "Source Type",
        "environment": "Environment",
    }
    for field in source_fields:
        filters.append(
            {
                "type": "source",
                "field": field,
                "label": field_labels.get(field, field.replace("_", " ").title()),
            }
        )

    # Metric signal filters (string signals with reasonable unique counts)
    for metric_name, meta in metrics.items():
        signal_types = meta.get("signal_types", {})
        values = meta.get("values", {})

        for signal, sig_type in signal_types.items():
            if sig_type == "string" and signal in values:
                unique_vals = values[signal]
                if 2 <= len(unique_vals) <= 20:
                    filters.append(
                        {
                            "type": "metric",
                            "metric": metric_name,
                            "signal": signal,
                            "label": signal.replace("_", " ").title(),
                            "options": unique_vals,
                        }
                    )

    return filters


def _auto_table_columns(
    metrics: dict[str, Any],
    source_fields: list[str],
) -> list[dict[str, Any]]:
    """Auto-generate table column config."""
    columns: list[dict[str, Any]] = [
        {"key": "Case_ID", "label": "Case ID", "sortable": True},
    ]

    # Add source_name if available
    if "source_name" in source_fields:
        columns.append({"key": "source_name", "label": "Source", "sortable": True})

    columns.append({"key": "Business", "label": "Business", "sortable": True})

    # Add top classification string signals
    for metric_name, meta in metrics.items():
        signal_types = meta.get("signal_types", {})
        for signal, sig_type in signal_types.items():
            if sig_type == "string" and signal in meta.get("values", {}):
                columns.append(
                    {
                        "key": f"{metric_name}__{signal}",
                        "label": signal.replace("_", " ").title(),
                        "sortable": True,
                    }
                )
                break  # Only first string signal per metric

    columns.extend(
        [
            {"key": "Message_Count", "label": "Messages", "sortable": True},
            {"key": "Timestamp", "label": "Timestamp", "sortable": True},
        ]
    )

    return columns


def _auto_color_maps(metrics: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Auto-generate color maps for classification signals."""
    # Default color palette for unknown values
    palette = [
        "#8B9F4F",
        "#D4AF37",
        "#B8C5D3",
        "#A4B86C",
        "#6B7A3A",
        "#F39C12",
        "#E74C3C",
        "#7F8C8D",
        "#34495E",
        "#B8C78A",
    ]

    color_maps: dict[str, dict[str, str]] = {}

    for metric_name, meta in metrics.items():
        values = meta.get("values", {})
        for signal, unique_vals in values.items():
            if unique_vals:
                mapping: dict[str, str] = {}
                for i, val in enumerate(unique_vals):
                    mapping[val] = palette[i % len(palette)]
                color_maps[f"{metric_name}__{signal}"] = mapping

    return color_maps


def _merge_with_defaults(
    overrides: dict[str, Any],
    schema: dict[str, Any],
    visible_kpis: list[str] | None = None,
) -> dict[str, Any]:
    """Merge YAML overrides with auto-generated defaults."""
    defaults = _generate_defaults(schema, visible_kpis=visible_kpis)

    # Override each top-level key if provided
    for key in ["kpi_strip", "chart_sections", "filters", "table_columns"]:
        if key in overrides:
            defaults[key] = overrides[key]

    # Deep-merge color_maps: auto-generated fill gaps, YAML takes precedence
    if "color_maps" in overrides:
        auto_maps = defaults.get("color_maps", {})
        yaml_maps = overrides["color_maps"]
        merged = {**auto_maps, **yaml_maps}
        defaults["color_maps"] = merged

    return defaults
