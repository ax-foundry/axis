import ast
import csv
import json
import logging
from collections import Counter
from datetime import UTC
from typing import Any

from app.plugins.memory.config import memory_config

logger = logging.getLogger(__name__)

# Module-level cache — populated by upload or set_data()
_cache: list[dict[str, Any]] | None = None


def _parse_list_field(value: str) -> list[str]:
    """Parse a list field that may be Python literal, JSON, or empty."""
    if not value or value in ("[]", "None", ""):
        return []
    try:
        result = ast.literal_eval(value)
        if isinstance(result, list):
            return [str(item) for item in result]
        return [str(result)]
    except (ValueError, SyntaxError):
        pass
    try:
        result = json.loads(value)
        if isinstance(result, list):
            return [str(item) for item in result]
        return [str(result)]
    except (json.JSONDecodeError, TypeError):
        pass
    return [value] if value else []


def _load_data() -> list[dict[str, Any]]:
    """Return the in-memory cache. Empty until data is uploaded."""
    if _cache is None:
        return []
    return _cache


def set_data(rows: list[dict[str, Any]]) -> None:
    """Replace the in-memory cache (called after CSV upload)."""
    global _cache
    _cache = rows
    logger.info("Memory cache updated with %d records", len(rows))


def _to_rule_record(row: dict[str, Any]) -> dict[str, Any]:
    """Normalise a raw row into the role-keyed RuleRecord shape.

    Maps CSV column names -> role names using field_roles config.
    For data already role-keyed (post-import), passes through directly.
    """
    roles = memory_config.field_roles
    list_fields_set = set(memory_config.list_fields)
    record: dict[str, Any] = {}

    for role in roles.ALL_ROLES:
        col = roles.column_for(role)
        # Try role key first (post-import data), then column key (raw CSV)
        if role in row:
            val = row[role]
        elif col in row:
            val = row[col]
        else:
            val = [] if role in list_fields_set else ""

        # Parse list fields if they're still strings
        if role in list_fields_set and isinstance(val, str):
            val = _parse_list_field(val)

        record[role] = val

    # Validate required roles — just log, don't fail
    missing = memory_config.validate_required_roles(record)
    if missing:
        logger.debug("Record missing optional/required role keys: %s", missing)

    return record


def get_all_rules(filters: dict[str, str]) -> dict[str, Any]:
    """Return filtered rules with available filter values.

    Args:
        filters: dict of role_name -> value to filter on.
    """
    data = _load_data()

    # Build filter values from full dataset for configured filter_roles + batch
    filter_keys = [*list(memory_config.filter_roles), "batch"]
    filters_available: dict[str, list[str]] = {}
    for role in filter_keys:
        filters_available[role] = sorted({str(r.get(role, "")) for r in data if r.get(role)})

    # Apply filters
    filtered = data
    for role, value in filters.items():
        if value:
            filtered = [r for r in filtered if str(r.get(role, "")) == value]

    return {
        "data": [_to_rule_record(r) for r in filtered],
        "total": len(filtered),
        "filters_available": filters_available,
    }


def get_summary() -> dict[str, Any]:
    """Aggregate summary statistics."""
    data = _load_data()
    return _compute_summary(data)


def get_decision_quality() -> dict[str, Any]:
    """Split rules by quality role using configured quality_values."""
    data = _load_data()
    qv = memory_config.quality_values
    aligned = [_to_rule_record(r) for r in data if r.get("quality") == qv["aligned"]]
    divergent = [_to_rule_record(r) for r in data if r.get("quality") == qv["divergent"]]
    partial = [_to_rule_record(r) for r in data if r.get("quality") == qv["partial"]]
    return {"aligned": aligned, "divergent": divergent, "partial": partial}


def get_soft_thresholds() -> dict[str, Any]:
    """Return rules with soft thresholds."""
    data = _load_data()
    stv = memory_config.soft_threshold_value
    soft = [_to_rule_record(r) for r in data if r.get("threshold_type") == stv]
    return {"data": soft}


def get_hard_stops() -> dict[str, Any]:
    """Return hard stops based on config: action matches action_value AND mitigants empty."""
    data = _load_data()
    hs = memory_config.hard_stops
    action_value = hs.get("action_value", "decline")
    require_empty = hs.get("require_empty_mitigants", True)

    stops = []
    for r in data:
        if r.get("action") != action_value:
            continue
        if require_empty and r.get("mitigants"):
            continue
        stops.append(_to_rule_record(r))

    return {"data": stops}


def get_batches() -> dict[str, Any]:
    """Group rules by batch role."""
    data = _load_data()
    batches: dict[str, list[dict[str, Any]]] = {}
    for row in data:
        bid = row.get("batch", "unknown")
        batches.setdefault(bid, []).append(row)

    result = []
    for bid, rows in batches.items():
        status_counter = Counter(r.get("status", "unknown") for r in rows)
        cats = sorted({r.get("category", "") for r in rows if r.get("category")})
        created_dates = [r.get("created_at", "") for r in rows if r.get("created_at")]
        earliest = min(created_dates) if created_dates else ""
        result.append(
            {
                "batch_id": bid,
                "rules_count": len(rows),
                "created_at": earliest,
                "statuses": dict(status_counter),
                "risk_categories": cats,
            }
        )

    return {"data": result}


def get_trace(rule_id: str) -> dict[str, Any] | None:
    """Build a trace path from a single rule's fields."""
    data = _load_data()
    row = next((r for r in data if r.get("id") == rule_id), None)
    if row is None:
        return None
    return {
        "group_by": row.get("group_by", ""),
        "name": row.get("name", ""),
        "action": row.get("action", ""),
        "description": row.get("description", ""),
        "mitigants": row.get("mitigants", []),
        "threshold_value": row.get("threshold_value", ""),
        "threshold_type": row.get("threshold_type", ""),
    }


def get_conflicts() -> dict[str, Any]:
    """Find risk factors with contradictory actions."""
    data = _load_data()

    # Group by (group_by, product) roles
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in data:
        rf = row.get("group_by", "")
        pt = row.get("product", "")
        if rf:
            groups.setdefault((rf, pt), []).append(row)

    conflicts = []
    contradictory_sets = memory_config.contradictory_frozensets
    for (rf, _pt), rows in groups.items():
        actions_in_group = {r.get("action", "") for r in rows}
        if len(actions_in_group) < 2:
            continue

        # Check if any pair is truly contradictory
        is_contradictory = False
        for a1 in actions_in_group:
            for a2 in actions_in_group:
                if a1 != a2 and frozenset({a1, a2}) in contradictory_sets:
                    is_contradictory = True
                    break
            if is_contradictory:
                break

        if is_contradictory:
            conflicting_rules = [
                {"rule_name": r.get("name", ""), "action": r.get("action", "")} for r in rows
            ]
            desc = (
                f"Risk factor '{rf}' has contradictory actions: "
                f"{', '.join(sorted(actions_in_group))}"
            )
            conflicts.append(
                {
                    "risk_factor": rf,
                    "conflicting_rules": conflicting_rules,
                    "description": desc,
                }
            )

    return {"data": conflicts, "has_conflicts": len(conflicts) > 0}


def get_status_counts() -> dict[str, Any]:
    """Count rules by status role."""
    data = _load_data()
    counter = Counter(r.get("status", "unknown") for r in data)
    return {"data": dict(counter)}


def _compute_filters_available(data: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Compute unique filter values from a dataset using configured filter_roles."""
    result: dict[str, list[str]] = {}
    filter_keys = [*list(memory_config.filter_roles), "batch"]
    for role in filter_keys:
        result[role] = sorted({str(r.get(role, "")) for r in data if r.get(role)})
    return result


def _compute_summary(data: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute summary statistics from a dataset using role names."""
    all_mitigants: set[str] = set()
    for row in data:
        for m in row.get("mitigants", []):
            if m:
                all_mitigants.add(m)

    hs = memory_config.hard_stops
    action_value = hs.get("action_value", "decline")
    require_empty = hs.get("require_empty_mitigants", True)

    hard_stops = []
    for r in data:
        if r.get("action") != action_value:
            continue
        if require_empty and r.get("mitigants"):
            continue
        hard_stops.append(r)

    action_counter = Counter(r["action"] for r in data if r.get("action"))
    rules_by_action = [
        {
            "action": action,
            "count": count,
            "color": memory_config.get_action_color(action, i),
        }
        for i, (action, count) in enumerate(action_counter.most_common())
    ]

    product_counter = Counter(r["product"] for r in data if r.get("product"))
    rules_by_product = [
        {"product": product, "count": count} for product, count in product_counter.most_common()
    ]

    risk_factors = {r["group_by"] for r in data if r.get("group_by")}

    return {
        "rules_count": len(data),
        "risk_factors_count": len(risk_factors),
        "mitigants_count": len(all_mitigants),
        "hard_stops_count": len(hard_stops),
        "rules_by_action": rules_by_action,
        "rules_by_product": rules_by_product,
    }


def process_uploaded_csv(csv_content: str) -> dict[str, Any]:
    """Process uploaded CSV content into structured role-keyed rule records.

    Maps CSV column names -> role names using field_roles config at import time.
    """
    import io

    reader = csv.DictReader(io.StringIO(csv_content))
    raw_rows: list[dict[str, Any]] = []
    columns: list[str] = []
    for i, row in enumerate(reader):
        if i == 0:
            columns = list(row.keys())
        raw_rows.append(dict(row))

    if not raw_rows:
        return {
            "success": True,
            "format": "memory",
            "row_count": 0,
            "columns": columns,
            "data": [],
            "filters_available": {},
            "summary": {
                "rules_count": 0,
                "risk_factors_count": 0,
                "mitigants_count": 0,
                "hard_stops_count": 0,
                "rules_by_action": [],
                "rules_by_product": [],
            },
            "message": "CSV was empty",
        }

    # Check that required columns exist in CSV
    roles = memory_config.field_roles
    csv_columns_set = set(columns)
    missing_required: list[str] = []
    for role in memory_config.required_roles:
        col = roles.column_for(role)
        if col not in csv_columns_set:
            missing_required.append(f"'{col}' (for role '{role}')")
    if missing_required:
        return {
            "success": False,
            "format": "memory",
            "row_count": 0,
            "columns": columns,
            "data": [],
            "filters_available": {},
            "summary": {
                "rules_count": 0,
                "risk_factors_count": 0,
                "mitigants_count": 0,
                "hard_stops_count": 0,
                "rules_by_action": [],
                "rules_by_product": [],
            },
            "message": f"Missing required columns: {', '.join(missing_required)}",
        }

    # Map column names -> role names at import time
    role_keyed_rows: list[dict[str, Any]] = []
    roles_dict = roles.to_dict()
    list_fields_set = set(memory_config.list_fields)

    for raw_row in raw_rows:
        record: dict[str, Any] = {}
        for role, col in roles_dict.items():
            val = raw_row.get(col, "")
            if role in list_fields_set:
                val = _parse_list_field(str(val) if val else "")
            record[role] = val
        role_keyed_rows.append(record)

    records = [_to_rule_record(r) for r in role_keyed_rows]
    set_data(role_keyed_rows)
    logger.info("Processed %d rule extraction records from upload", len(records))

    return {
        "success": True,
        "format": "memory",
        "row_count": len(records),
        "columns": columns,
        "data": records,
        "filters_available": _compute_filters_available(role_keyed_rows),
        "summary": _compute_summary(role_keyed_rows),
    }


def create_rule(data: dict[str, Any]) -> dict[str, Any]:
    """Create a new rule in the in-memory cache (mock — swap for DB write later).

    Accepts role-keyed data directly. Validates required roles.
    """
    import uuid
    from datetime import datetime

    cache = _load_data()

    # Validate required roles
    missing = memory_config.validate_required_roles(data)
    # id, batch, and status are auto-generated for new rules
    auto_generated = {"id", "batch", "status"}
    real_missing = [r for r in missing if r not in auto_generated]
    if real_missing:
        msg = f"Missing required fields: {', '.join(real_missing)}"
        raise ValueError(msg)

    new_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()

    row: dict[str, Any] = {
        "id": new_id,
        "created_at": now,
        "batch": "manual",
        "status": "pending",
    }

    # Copy all provided role-keyed fields
    for key, value in data.items():
        if key not in row:
            row[key] = value

    # Ensure list fields default to empty list
    for lf in memory_config.list_fields:
        if lf not in row:
            row[lf] = []

    cache.insert(0, row)
    logger.info("Created rule %s: %s", new_id, data.get("name", ""))
    return _to_rule_record(row)


def delete_rule(rule_id: str) -> bool:
    """Delete a rule from the in-memory cache (mock — swap for DB delete later)."""
    cache = _load_data()
    for i, row in enumerate(cache):
        if row.get("id") == rule_id:
            cache.pop(i)
            logger.info("Deleted rule %s", rule_id)
            return True
    return False


def update_rule(rule_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    """Update a rule in the in-memory cache (mock — swap for DB write later).

    Accepts role-keyed updates directly.
    """
    data = _load_data()
    row = next((r for r in data if r.get("id") == rule_id), None)
    if row is None:
        return None

    for key, value in updates.items():
        if value is not None:
            row[key] = value

    logger.info("Updated rule %s: %s", rule_id, list(updates.keys()))
    return _to_rule_record(row)
