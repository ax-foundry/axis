#!/usr/bin/env python3
"""Generate a metric_definitions.yaml scaffold with the metric_catalog section.

Reads metric names from live DuckDB data via the backend's /api/ai/copilot/schema-dump
endpoint, then optionally introspects echo-workbench metric classes for signal structure.

Usage:
    cd backend
    python scripts/generate_metric_catalog.py [--api http://localhost:8500] [--output ...] [--overwrite]
"""

from __future__ import annotations

import argparse
from contextlib import suppress
import json
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml

from app.config.paths import get_custom_dir


def _fetch_schema_dump(api_base: str) -> dict:  # type: ignore[type-arg]
    url = f"{api_base.rstrip('/')}/api/ai/copilot/schema-dump"
    try:
        with urlopen(url, timeout=10) as resp:
            return json.loads(resp.read())  # type: ignore[no-any-return]
    except URLError as e:
        print(f"✗ Could not reach backend at {url}: {e}")
        print("  Make sure the backend is running (uvicorn app.main:app --port 8500)")
        sys.exit(1)


def _build_monitoring_domain(tables: dict) -> dict:  # type: ignore[type-arg]
    """Build monitoring domain entries from filter_values of monitoring_data."""
    monitoring_data = tables.get("monitoring_data", {})
    metric_names: list[str] = list(
        monitoring_data.get("filter_values", {}).get("metric_name", [])
    )
    if not metric_names:
        return {}

    domain: dict = {}
    for name in sorted(metric_names):
        domain[name] = {
            "description": f"TODO: describe {name}",
            "category": "SCORE",
            "score_range": "0.0-1.0",
            # Uncomment and fill in if this metric has structured signals JSON:
            # "signals": {
            #     "payload_kind": "grouped_signal_dict",
            #     "note": "Dict keyed by group name; each group is a list of signal entries",
            #     "group_fields": ["name", "value", "score", "description", "headline_display"],
            # },
        }
    return domain


def _build_eval_domain(tables: dict) -> dict:  # type: ignore[type-arg]
    """Build eval domain entries from _score columns of eval_data."""
    eval_data = tables.get("eval_data", {})
    columns = eval_data.get("columns", [])
    score_cols = [
        c["column_name"].replace("_score", "")
        for c in columns
        if c.get("column_name", "").endswith("_score")
    ]
    if not score_cols:
        return {}

    domain: dict = {}
    for name in sorted(score_cols):
        domain[name] = {
            "description": f"TODO: describe {name}",
            "threshold": 0.7,
        }
    return domain


def _build_kpi_domain(tables: dict) -> dict:  # type: ignore[type-arg]
    """Build kpi domain entries from filter_values of kpi_data."""
    kpi_data = tables.get("kpi_data", {})
    kpi_names: list[str] = list(
        kpi_data.get("filter_values", {}).get("kpi_name", [])
    )
    if not kpi_names:
        return {}

    domain: dict = {}
    for name in sorted(kpi_names):
        domain[name] = {
            "description": f"TODO: describe {name}",
        }
    return domain


def _try_echo_workbench_signals(metric_name: str) -> dict | None:  # type: ignore[type-arg]
    """Attempt to introspect echo-workbench for signal structure of a metric.

    Returns a signals dict if discoverable, else None.
    Echo-workbench is an optional dependency — this is best-effort only.
    """
    try:
        # Try importing echo-workbench metric registry
        from echo.metrics import get_metric_class  # type: ignore[import-not-found]

        cls = get_metric_class(metric_name)
        if cls is None:
            return None
        instance = cls()
        if not hasattr(instance, "get_signals"):
            return None
        # Introspect signal descriptors
        descriptors = instance.get_signals()
        if not descriptors:
            return None

        # Check if grouped (signal groups) or flat
        groups = {d.group for d in descriptors if hasattr(d, "group") and d.group}
        if groups:
            group_fields = list({
                f
                for d in descriptors
                for f in (d.fields if hasattr(d, "fields") else ["name", "value", "score"])
            })
            return {
                "payload_kind": "grouped_signal_dict",
                "note": f"Groups: {', '.join(sorted(groups)[:6])}",
                "group_fields": group_fields[:8],
            }
        else:
            return {
                "payload_kind": "flat_signal_list",
                "group_fields": ["name", "value", "score", "description"],
            }
    except Exception:
        return None


def main() -> None:
    """Generate and write the metric catalog scaffold."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api",
        default="http://localhost:8500",
        help="Backend base URL (default: http://localhost:8500)",
    )
    parser.add_argument(
        "--output",
        default=str(get_custom_dir() / "config" / "metric_definitions.yaml"),
        help="Output path (default: custom/config/metric_definitions.yaml)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing file (default: abort if file exists)",
    )
    parser.add_argument(
        "--echo-workbench",
        action="store_true",
        help="Attempt to introspect echo-workbench metric classes for signal structure",
    )
    args = parser.parse_args()

    out_path = Path(args.output)
    if out_path.exists() and not args.overwrite:
        print(f"✗ {out_path} already exists. Use --overwrite to replace it.")
        sys.exit(1)

    print(f"Fetching schema from {args.api} ...")
    dump = _fetch_schema_dump(args.api)
    tables: dict = dump.get("tables", {})

    monitoring_domain = _build_monitoring_domain(tables)
    eval_domain = _build_eval_domain(tables)
    kpi_domain = _build_kpi_domain(tables)

    # Optionally enrich with echo-workbench signal structure
    if args.echo_workbench and monitoring_domain:
        print("  Introspecting echo-workbench for signal structure...")
        for metric_name, entry in monitoring_domain.items():
            signals = _try_echo_workbench_signals(metric_name)
            if signals:
                entry["signals"] = signals
                print(f"    ✓ {metric_name}: found signal structure")

    metric_catalog: dict = {}
    if monitoring_domain:
        metric_catalog["monitoring"] = monitoring_domain
        print(f"  ✓ monitoring: {len(monitoring_domain)} metrics")
    if eval_domain:
        metric_catalog["eval"] = eval_domain
        print(f"  ✓ eval: {len(eval_domain)} metrics")
    if kpi_domain:
        metric_catalog["kpi"] = kpi_domain
        print(f"  ✓ kpi: {len(kpi_domain)} KPIs")

    if not metric_catalog:
        print("✗ No metrics found. Is there any monitoring/eval/kpi data loaded?")
        sys.exit(1)

    # Check if file already exists — preserve metric_definitions section if so
    existing_metric_definitions: dict = {}
    if out_path.exists() and args.overwrite:
        with suppress(Exception):
            with out_path.open(encoding="utf-8") as f:
                existing = yaml.safe_load(f) or {}
            existing_metric_definitions = existing.get("metric_definitions", {})
            print("  Preserving existing metric_definitions section")

    doc: dict = {
        "_note": (
            "Generated by scripts/generate_metric_catalog.py — fill in TODO descriptions. "
            "The metric_catalog section is injected into the copilot prompt as metric hints. "
            "Restart the backend after editing."
        ),
        "metric_catalog": metric_catalog,
    }
    if existing_metric_definitions:
        doc["metric_definitions"] = existing_metric_definitions

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        yaml.dump(doc, f, allow_unicode=True, sort_keys=False, default_flow_style=False)

    print(f"\n✓ Written to {out_path}")
    print("  Next: replace every 'TODO: describe ...' with a real description.")
    print("  For ANALYSIS metrics with structured signals JSON, uncomment and fill in the")
    print("  'signals' section (payload_kind, note, group_fields).")
    print("  Then restart the backend for catalog to take effect.")


if __name__ == "__main__":
    main()
