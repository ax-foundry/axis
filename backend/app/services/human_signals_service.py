import ast
import json
import logging
import re
from typing import Any

import numpy as np
import pandas as pd

from app.config.db.human_signals import human_signals_db_config

logger = logging.getLogger(__name__)


def safe_literal_eval(s: str | None) -> dict[str, Any] | list[Any] | None:
    """Safely evaluate a Python literal string."""
    if not s or (isinstance(s, float) and np.isnan(s)):
        return None
    try:
        result = ast.literal_eval(str(s))
        if isinstance(result, dict | list):
            return result
        return None
    except Exception:
        return None


def safe_json_or_literal(s: str | None) -> dict[str, Any] | list[Any] | None:
    """Try JSON first, fall back to Python literal eval."""
    if not s or (isinstance(s, float) and np.isnan(s)):
        return None
    raw = str(s).strip()
    # Try JSON
    try:
        result = json.loads(raw)
        if isinstance(result, dict | list):
            return result
        return None
    except (json.JSONDecodeError, ValueError):
        pass
    # Fall back to ast.literal_eval
    return safe_literal_eval(raw)


def extract_case_label(content: str | None) -> str:
    """Extract a short label from the first conversation message.

    Looks for a ``New ... case: <label>`` pattern first, then falls back
    to the first non-empty line of text (truncated to 80 chars).
    """
    if not content:
        return "Unknown"
    match = re.search(r"New\s+\w+\s+case:\s*(.+?)(?:\n|$)", content)
    if match:
        return match.group(1).strip()
    # Fallback: first non-empty line
    for line in content.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped[:80]
    return "Unknown"


# ============================================
# Format Detection
# ============================================


def detect_signals_format(df: pd.DataFrame) -> bool:
    """Detect if DataFrame has the required signals format (metric_name, dataset_id, signals)."""
    normalized = {col.lower().strip().replace(" ", "_") for col in df.columns}
    return {"metric_name", "dataset_id", "signals"}.issubset(normalized)


def detect_source_fields(df: pd.DataFrame) -> bool:
    """Detect if data has source fields (source_name, source_component, environment)."""
    cols = {col.lower().strip() for col in df.columns}
    return "source_name" in cols


# ============================================
# Generic Pipeline
# ============================================


def _is_category_dict(d: dict[str, Any]) -> bool:
    """Check if dict matches the category pattern: ``{str: [dict_with_name, ...], ...}``."""
    if not d:
        return False
    for v in d.values():
        if not isinstance(v, list):
            return False
        for item in v:
            if not isinstance(item, dict) or "name" not in item:
                return False
    return True


def _expand_category_signals(signals: dict[str, Any]) -> dict[str, Any]:
    """Expand nested category-signal dicts into flat signal entries.

    When a signal value is a dict of ``{category: [{name, value, ...}, ...]}``,
    each item is extracted as a separate signal keyed by its ``name`` field.
    Other signals pass through unchanged.
    """
    expanded: dict[str, Any] = {}
    for key, val in signals.items():
        # Parse string values that might be JSON/Python dicts
        if isinstance(val, str):
            parsed = safe_json_or_literal(val)
            if parsed is not None:
                val = parsed

        # Detect category pattern and flatten
        if isinstance(val, dict) and _is_category_dict(val):
            for _category, items in val.items():
                for item in items:
                    item_name = item.get("name", "")
                    item_value = item.get("value", item.get("score"))
                    if item_name:
                        expanded[item_name] = item_value
        else:
            expanded[key] = val

    return expanded


def _infer_signal_type(values: list[Any]) -> str:
    """Infer the type of a signal from its observed values."""
    non_null = [v for v in values if v is not None and not (isinstance(v, float) and np.isnan(v))]
    if not non_null:
        return "unknown"
    sample = non_null[0]
    if isinstance(sample, bool):
        return "boolean"
    if isinstance(sample, int | float):
        return "number"
    if isinstance(sample, list):
        return "array"
    if isinstance(sample, dict):
        return "object"
    return "string"


def _detect_common_metadata_keys(df: pd.DataFrame, threshold: float = 0.5) -> set[str]:
    """Detect signal keys that appear across many metrics (likely metadata, not real signals).

    Groups by metric_name, collects signal keys per metric, and returns keys
    that appear in more than ``threshold`` fraction of all metrics.

    Args:
        df: DataFrame with metric_name and signals columns.
        threshold: Fraction of metrics a key must appear in to be classified as metadata.

    Returns:
        Set of common metadata key names to exclude from per-metric schemas.
    """
    keys_per_metric: dict[str, set[str]] = {}
    for metric_name, group in df.groupby("metric_name"):
        metric_name = str(metric_name).strip()
        if not metric_name:
            continue
        metric_keys: set[str] = set()
        for _, row in group.iterrows():
            signals = safe_json_or_literal(row.get("signals"))
            if not isinstance(signals, dict):
                continue
            expanded = _expand_category_signals(signals)
            metric_keys.update(expanded.keys())
        keys_per_metric[metric_name] = metric_keys

    total_metrics = len(keys_per_metric)
    if total_metrics < 2:
        return set()

    # Count how many metrics each key appears in
    key_counts: dict[str, int] = {}
    for keys in keys_per_metric.values():
        for key in keys:
            key_counts[key] = key_counts.get(key, 0) + 1

    common = {key for key, count in key_counts.items() if count / total_metrics > threshold}
    if common:
        logger.info(
            "Detected common metadata keys (appear in >%d%% of %d metrics): %s",
            int(threshold * 100),
            total_metrics,
            sorted(common),
        )
    return common


def build_metric_schema(df: pd.DataFrame) -> dict[str, Any]:
    """Auto-discover metric schema from data.

    For each unique metric_name, inspects signals JSON across all rows to discover:
    - Signal keys and their types (boolean, string, number, array)
    - Unique values for string signals (for filter options and chart labels)
    - metric_category (classification vs score)
    """
    metrics: dict[str, Any] = {}

    # Determine available source fields
    source_fields = []
    for field in ["source_name", "source_component", "source_type", "environment"]:
        if field in df.columns:
            source_fields.append(field)

    has_timestamp = "timestamp" in df.columns

    common_metadata = _detect_common_metadata_keys(df)

    for metric_name, group in df.groupby("metric_name"):
        metric_name = str(metric_name).strip()
        if not metric_name:
            continue

        # Get category from first row
        category = str(group.iloc[0].get("metric_category", "classification")).strip().lower()

        # Collect all signal keys and their values
        signal_values: dict[str, list[Any]] = {}
        for _, row in group.iterrows():
            signals = safe_json_or_literal(row.get("signals"))
            if not isinstance(signals, dict):
                continue
            expanded = _expand_category_signals(signals)
            for key, val in expanded.items():
                if key not in signal_values:
                    signal_values[key] = []
                signal_values[key].append(val)

        # Strip common metadata keys (they pollute charts/filters)
        for key in common_metadata:
            signal_values.pop(key, None)

        # Build signal types and unique values
        signal_types: dict[str, str] = {}
        unique_values: dict[str, list[str]] = {}

        for key, vals in signal_values.items():
            sig_type = _infer_signal_type(vals)
            signal_types[key] = sig_type

            if sig_type == "string":
                # Collect unique non-empty string values
                uniques = sorted({str(v) for v in vals if v is not None and str(v).strip() != ""})
                if uniques:
                    unique_values[key] = uniques

        metrics[metric_name] = {
            "category": category,
            "signals": list(signal_values.keys()),
            "signal_types": signal_types,
            "values": unique_values,
        }

    # Filter to visible metrics if configured
    visible = human_signals_db_config.visible_metrics
    if visible:
        metrics = {k: v for k, v in metrics.items() if k in visible}

    return {
        "metrics": metrics,
        "source_fields": source_fields,
        "has_timestamp": has_timestamp,
    }


def aggregate_cases(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Generic per-case aggregation.

    Groups by dataset_id, extracts shared columns (source_name, source_component,
    environment, timestamp, conversation, message_count), then for each metric row
    flattens all signals as {metric_name}__{signal_key}.
    """
    cases: list[dict[str, Any]] = []
    common_metadata = _detect_common_metadata_keys(df)

    for dataset_id, group in df.groupby("dataset_id"):
        first_row = group.iloc[0]
        case: dict[str, Any] = {"Case_ID": str(dataset_id)}

        # Extract source fields
        for field in ["source_name", "source_component", "source_type", "environment"]:
            if field in df.columns:
                val = first_row.get(field)
                case[field] = str(val) if pd.notna(val) else None

        # Parse shared columns
        additional_input = safe_json_or_literal(first_row.get("additional_input"))
        if isinstance(additional_input, dict):
            case["Slack_URL"] = additional_input.get("message_url")
            case["Agent_Name"] = additional_input.get("sender")
        else:
            case["Slack_URL"] = None
            case["Agent_Name"] = case.get("source_name")  # Fallback to source_name

        # Parse conversation
        conv_dict = safe_json_or_literal(first_row.get("conversation"))
        messages: list[dict[str, Any]] = []
        if isinstance(conv_dict, dict):
            messages = conv_dict.get("messages", [])

        # Extract a label from the first message
        if messages:
            case["Business"] = extract_case_label(messages[0].get("content", ""))
        else:
            case["Business"] = "Unknown"

        case["Full_Conversation"] = messages

        # Parse conversation stats
        conv_stats = safe_json_or_literal(first_row.get("conversation_stats"))
        if isinstance(conv_stats, dict):
            case["Message_Count"] = conv_stats.get(
                "turn_count",
                conv_stats.get("user_message_count", 0) + conv_stats.get("ai_message_count", 0),
            )
        else:
            case["Message_Count"] = 0

        # Timestamp
        case["Timestamp"] = str(first_row.get("timestamp", ""))

        # Extract additional structured metadata columns
        for col in ["evaluation_metadata", "actual_reference", "additional_output"]:
            if col in df.columns:
                raw = first_row.get(col)
                if pd.notna(raw):
                    parsed = safe_json_or_literal(str(raw))
                    if parsed is not None:
                        case[col] = json.dumps(parsed)
                    else:
                        case[col] = str(raw)

        # Store full additional_input as JSON (beyond Slack_URL/Agent_Name already extracted)
        if additional_input is not None:
            case["additional_input"] = json.dumps(additional_input)

        # Flatten all metric signals as {metric_name}__{signal_key}
        visible = human_signals_db_config.visible_metrics
        for _, row in group.iterrows():
            metric_name = str(row.get("metric_name", "")).strip()
            if not metric_name:
                continue
            if visible and metric_name not in visible:
                continue

            signals = safe_json_or_literal(row.get("signals"))
            if not isinstance(signals, dict):
                continue

            expanded = _expand_category_signals(signals)
            for signal_key, signal_val in expanded.items():
                # Promote common metadata to case-level (first occurrence wins)
                if signal_key in common_metadata:
                    if signal_key not in case and signal_val is not None:
                        case[signal_key] = signal_val
                    continue

                flat_key = f"{metric_name}__{signal_key}"
                # Serialize complex values as JSON strings for clean DuckDB storage
                if isinstance(signal_val, str):
                    parsed = safe_json_or_literal(signal_val)
                    if parsed is not None:
                        signal_val = json.dumps(parsed)
                elif isinstance(signal_val, dict | list):
                    signal_val = json.dumps(signal_val)
                case[flat_key] = signal_val

        cases.append(case)

    logger.info(f"Aggregated {len(cases)} cases from {len(df)} metric rows")
    return cases
