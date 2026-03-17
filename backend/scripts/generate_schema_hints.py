#!/usr/bin/env python3
"""Generate a schema_hints.yaml scaffold from live DuckDB data.

Calls the running backend's /api/ai/copilot/schema-dump endpoint to read table
metadata without touching the DuckDB file directly (which is locked while the
backend runs).

Usage:
    cd backend
    python scripts/generate_schema_hints.py [--api http://localhost:8500] [--output ...]
"""

from __future__ import annotations

import argparse
import json
import sys
from contextlib import suppress
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml

from app.config.paths import get_custom_dir


def _looks_like_json(v: str) -> bool:
    s = str(v).strip()
    return s.startswith("{") or s.startswith("[")


def _build_column_entry(
    col_name: str,
    filter_values: dict,
) -> dict:
    entry: dict = {"name": col_name, "description": f"TODO: describe {col_name}"}
    if col_name in filter_values:
        vals = [v for v in filter_values[col_name] if not _looks_like_json(str(v))]
        if vals:
            entry["values"] = {str(v): f"TODO: describe {v}" for v in vals[:12]}
    return entry


def _build_table_entry(table: str, table_data: dict) -> dict | None:
    columns = table_data.get("columns", [])
    filter_values = table_data.get("filter_values", {})

    _skip_patterns = {"_id", "query", "output", "conversation", "text",
                      "content", "explanation", "trace", "reasoning", "evidence",
                      "additional_input"}

    col_entries = []
    for col in columns:
        name = col["column_name"]
        if any(p in name.lower() for p in _skip_patterns):
            continue
        col_entries.append(_build_column_entry(name, filter_values))

    return {
        "name": table,
        "description": f"TODO: describe {table}",
        "columns": col_entries,
    }


def _build_human_signals_entry(table_data: dict, metric_schema_raw: str | None) -> dict | None:
    meta = table_data
    filter_values = meta.get("filter_values", {})

    metric_schema: dict = {}
    if metric_schema_raw:
        with suppress(Exception):
            metric_schema = json.loads(metric_schema_raw) if isinstance(metric_schema_raw, str) else metric_schema_raw

    metrics_section = []
    for metric_name, mdata in (metric_schema.get("metrics") or {}).items():
        signal_types: dict = mdata.get("signal_types", {})
        unique_values: dict = mdata.get("values", {})

        signals = []
        for sig_key, sig_type in signal_types.items():
            col = f"{metric_name}__{sig_key}"
            sig_entry: dict = {
                "name": sig_key,
                "description": f"TODO: describe {sig_key} ({sig_type})",
            }
            if sig_type == "string" and sig_key in unique_values:
                uniques = [v for v in unique_values[sig_key] if not _looks_like_json(str(v))]
                if uniques and len(uniques) <= 20:
                    sig_entry["values"] = {str(v): f"TODO: describe {v}" for v in uniques}
            elif col in filter_values and sig_type != "number":
                vals = [v for v in filter_values[col] if not _looks_like_json(str(v))]
                if vals and len(vals) <= 20:
                    sig_entry["values"] = {str(v): f"TODO: describe {v}" for v in vals}
            signals.append(sig_entry)

        metrics_section.append({
            "name": metric_name,
            "description": f"TODO: describe {metric_name}",
            "signals": signals,
        })

    base_columns: list[dict] = []
    skip_signal_prefixes = {m["name"] for m in metrics_section}
    _skip_cols = {"query", "output", "conversation", "additional_input",
                  "evaluation_metadata", "metric_metadata", "sync_watermark"}
    for col in (meta.get("columns") or []):
        col_name = col["column_name"]
        if any(col_name.startswith(f"{m}__") for m in skip_signal_prefixes):
            continue
        if any(p in col_name.lower() for p in _skip_cols):
            continue
        entry: dict = {"name": col_name, "description": f"TODO: describe {col_name}"}
        if col_name in filter_values:
            vals = [v for v in filter_values[col_name] if not _looks_like_json(str(v))]
            if vals and len(vals) <= 20:
                entry["values"] = {str(v): f"TODO: describe {v}" for v in vals}
        base_columns.append(entry)

    result: dict = {
        "name": "human_signals_cases",
        "description": (
            "One row per case with all metric signals flattened as {metric_name}__{signal_key}. "
            "The prefix before '__' is the metric; the suffix is the signal field."
        ),
        "columns": base_columns,
    }
    if metrics_section:
        result["metrics"] = metrics_section
    return result


def _fetch_schema_dump(api_base: str) -> dict:
    url = f"{api_base.rstrip('/')}/api/ai/copilot/schema-dump"
    try:
        with urlopen(url, timeout=10) as resp:
            return json.loads(resp.read())
    except URLError as e:
        print(f"✗ Could not reach backend at {url}: {e}")
        print("  Make sure the backend is running (uvicorn app.main:app --port 8500)")
        sys.exit(1)


def main() -> None:
    """Generate and write the schema hints scaffold."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api",
        default="http://localhost:8500",
        help="Backend base URL (default: http://localhost:8500)",
    )
    parser.add_argument(
        "--output",
        default=str(get_custom_dir() / "config" / "schema_hints.yaml"),
        help="Output path (default: custom/config/schema_hints.yaml)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing file (default: abort if file exists)",
    )
    args = parser.parse_args()

    out_path = Path(args.output)
    if out_path.exists() and not args.overwrite:
        print(f"✗ {out_path} already exists. Use --overwrite to replace it.")
        sys.exit(1)

    print(f"Fetching schema from {args.api} ...")
    dump = _fetch_schema_dump(args.api)

    tables_data: dict = dump.get("tables", {})
    hs_schema_raw = dump.get("human_signals_metric_schema")

    _skip_tables = {"human_signals_cases", "human_signals_data"}

    tables_section = []

    for table, table_data in tables_data.items():
        if table in _skip_tables:
            continue
        entry = _build_table_entry(table, table_data)
        if entry:
            tables_section.append(entry)
            print(f"  ✓ {table}: {len(entry['columns'])} columns")

    if "human_signals_cases" in tables_data:
        hs_entry = _build_human_signals_entry(
            tables_data["human_signals_cases"], hs_schema_raw
        )
        if hs_entry:
            tables_section.append(hs_entry)
            n_metrics = len(hs_entry.get("metrics") or [])
            n_signals = sum(len(m.get("signals", [])) for m in (hs_entry.get("metrics") or []))
            print(f"  ✓ human_signals_cases: {n_metrics} metrics, {n_signals} signals")

    if not tables_section:
        print("✗ No tables found. Is there any data loaded in the backend?")
        sys.exit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "_note": (
            "Generated by scripts/generate_schema_hints.py — replace TODO descriptions "
            "with real explanations. Restart the backend after editing."
        ),
        "tables": tables_section,
    }
    with out_path.open("w", encoding="utf-8") as f:
        yaml.dump(doc, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    print(f"\n✓ Written to {out_path}")
    print("  Next: replace every 'TODO: describe ...' with a real description.")
    print("  Then restart the backend for hints to take effect.")


if __name__ == "__main__":
    main()
