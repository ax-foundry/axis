import logging
import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.config.db.kpi import kpi_db_config
from app.models.kpi_schemas import (
    KpiCategoriesResponse,
    KpiCategoryItem,
    KpiCategoryPanel,
    KpiCompositionChartConfig,
    KpiCompositionKpiEntry,
    KpiDateRange,
    KpiFiltersResponse,
    KpiSankeyChartData,
    KpiSankeyLink,
    KpiSankeyNode,
    KpiSankeyResponse,
    KpiSankeySummaryKpi,
    KpiSparklinePoint,
    KpiTrendPoint,
    KpiTrendsResponse,
)
from app.services.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)

TABLE = "kpi_data"


# -- Prefix utilities ----------------------------------------------------------


def _matches_prefix(kpi_name: str, prefixes: list[str]) -> bool:
    """Check if kpi_name starts with any of the given prefixes."""
    return any(kpi_name.startswith(p) for p in prefixes)


def _find_longest_matching_prefix(kpi_name: str, prefix_dict: dict[str, Any]) -> str | None:
    """Find the longest prefix key in prefix_dict that matches kpi_name."""
    match = None
    for prefix in prefix_dict:
        if kpi_name.startswith(prefix) and (match is None or len(prefix) > len(match)):
            match = prefix
    return match


def _parse_kpi_segments(
    kpi_name: str,
    prefix: str,
    expected_keys: list[str],
) -> dict[str, str] | None:
    """Parse structured key-value segments from a KPI name.

    Strips prefix, splits on '__', matches segments to expected_keys.
    Returns raw values (no title-casing). Returns None on parse failure.
    """
    remainder = kpi_name[len(prefix) :]
    segments = [s for s in remainder.split("__") if s]
    values: dict[str, str] = {}
    for seg in segments:
        for key in expected_keys:
            if key in values:
                continue
            if seg.startswith(key + "_"):
                values[key] = seg[len(key) + 1 :]
                break
            elif seg == key:
                values[key] = key
                break
    if not values:
        return None
    return values


def _parse_dynamic_display_name(kpi_name: str) -> str | None:
    """Try to parse a human-readable display name using label_format.

    Resolution:
    1. Find matching prefix in kpi_override_prefixes with label_format
    2. Parse key-value segments using _parse_kpi_segments
    3. Title-case extracted values and format
    """
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix is None:
        return None
    override = kpi_db_config.kpi_override_prefixes[prefix]
    fmt = override.get("label_format")
    if not fmt:
        return None

    keys = re.findall(r"\{(\w+)\}", fmt)
    if not keys:
        return None

    raw = _parse_kpi_segments(kpi_name, prefix, keys)
    if raw is None:
        return None

    titled = {k: v.replace("_", " ").title() for k, v in raw.items()}
    try:
        return str(fmt.format(**titled))
    except KeyError:
        return None


# -- Display config helpers ----------------------------------------------------


def _get_card_display_value(kpi_name: str, source_name: str | None = None) -> str:
    """Get the card_display_value for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi]
    2. display_per_source[source] (source-level default)
    3. kpi_overrides[kpi] (global per-KPI)
    4. card_display_value (global default)
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "card_display_value" in src_kpi:
            return str(src_kpi["card_display_value"])
        if "card_display_value" in src_cfg:
            return str(src_cfg["card_display_value"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "card_display_value" in global_kpi:
        return str(global_kpi["card_display_value"])
    # Prefix fallback
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix:
        val = kpi_db_config.kpi_override_prefixes[prefix].get("card_display_value")
        if val is not None:
            return str(val)
    return kpi_db_config.card_display_value


def _get_trend_lines(kpi_name: str, source_name: str | None = None) -> list[str]:
    """Get the trend_lines for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi]
    2. display_per_source[source] (source-level default)
    3. kpi_overrides[kpi] (global per-KPI)
    4. trend_lines (global default)
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "trend_lines" in src_kpi:
            return list(src_kpi["trend_lines"])
        if "trend_lines" in src_cfg:
            return list(src_cfg["trend_lines"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "trend_lines" in global_kpi:
        return list(global_kpi["trend_lines"])
    # Prefix fallback
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix:
        val = kpi_db_config.kpi_override_prefixes[prefix].get("trend_lines")
        if val is not None:
            return list(val)
    return list(kpi_db_config.trend_lines)


def _get_unit(kpi_name: str, source_name: str | None = None) -> str:
    """Get the unit for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi].unit
    2. kpi_overrides[kpi].unit (global per-KPI)
    3. "score" default
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "unit" in src_kpi:
            return str(src_kpi["unit"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "unit" in global_kpi:
        return str(global_kpi["unit"])
    # Prefix fallback
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix:
        val = kpi_db_config.kpi_override_prefixes[prefix].get("unit")
        if val is not None:
            return str(val)
    return "score"


def _get_display_name(kpi_name: str, source_name: str | None = None) -> str:
    """Get the display name for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi].display_name
    2. kpi_overrides[kpi].display_name (global per-KPI)
    3. Dynamic parse from label_format (if prefix matches)
    4. Prefix static display_name fallback
    5. Title-case from kpi_name
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "display_name" in src_kpi:
            return str(src_kpi["display_name"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "display_name" in global_kpi:
        return str(global_kpi["display_name"])
    # Dynamic parse from label_format
    dynamic = _parse_dynamic_display_name(kpi_name)
    if dynamic is not None:
        return dynamic
    # Prefix static display_name fallback
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix:
        val = kpi_db_config.kpi_override_prefixes[prefix].get("display_name")
        if val is not None:
            return str(val)
    return kpi_name.replace("_", " ").title()


def _get_polarity(kpi_name: str, source_name: str | None = None) -> str:
    """Get the polarity for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi].polarity
    2. kpi_overrides[kpi].polarity (global per-KPI)
    3. "higher_better" default
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "polarity" in src_kpi:
            return str(src_kpi["polarity"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "polarity" in global_kpi:
        return str(global_kpi["polarity"])
    # Prefix fallback
    prefix = _find_longest_matching_prefix(kpi_name, kpi_db_config.kpi_override_prefixes)
    if prefix:
        val = kpi_db_config.kpi_override_prefixes[prefix].get("polarity")
        if val is not None:
            return str(val)
    return "higher_better"


# -- SQL helpers ---------------------------------------------------------------


@dataclass
class SumKpiSpec:
    """Specification for KPIs that should use SUM aggregation."""

    exact_names: set[str]
    prefixes: list[str]

    @property
    def is_empty(self) -> bool:
        """Return True if no exact names or prefixes are configured."""
        return not self.exact_names and not self.prefixes


def _sum_kpi_spec(source_name: str | None = None) -> SumKpiSpec:
    """Build a SumKpiSpec from exact names and prefix config.

    Exact names come from kpi_overrides / display_per_source where unit == 'count'.
    Prefixes come from sum_kpi_prefixes (explicit source of truth).
    """
    names: set[str] = set()
    for kpi_name, overrides in kpi_db_config.kpi_overrides.items():
        if overrides.get("unit") == "count":
            names.add(kpi_name)
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        for kpi_name, overrides in src_cfg.get("kpi_overrides", {}).items():
            if overrides.get("unit") == "count":
                names.add(kpi_name)
    return SumKpiSpec(
        exact_names=names,
        prefixes=list(kpi_db_config.sum_kpi_prefixes),
    )


def _daily_agg_expr(spec: SumKpiSpec, params: list[object]) -> str:
    """Build a SQL expression that uses SUM for count KPIs, AVG otherwise."""
    if spec.is_empty:
        return "AVG(numeric_value)"
    conditions: list[str] = []
    if spec.exact_names:
        placeholders = ", ".join("?" for _ in spec.exact_names)
        params.extend(sorted(spec.exact_names))
        conditions.append(f"kpi_name IN ({placeholders})")
    for prefix in dict.fromkeys(spec.prefixes):  # dedupe, preserve order
        conditions.append("kpi_name LIKE ?")
        params.append(prefix + "%")
    combined = " OR ".join(conditions)
    return f"CASE WHEN ({combined}) " f"THEN SUM(numeric_value) ELSE AVG(numeric_value) END"


def _build_where(
    *,
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
    kpi_names: list[str] | None = None,
) -> tuple[str, list[object]]:
    """Build a parameterized WHERE clause for kpi_data queries."""
    conditions = ["numeric_value IS NOT NULL"]
    params: list[object] = []

    if source_name:
        conditions.append("source_name = ?")
        params.append(source_name)
    if kpi_category:
        conditions.append("kpi_category = ?")
        params.append(kpi_category)
    if environment:
        conditions.append("environment = ?")
        params.append(environment)
    if source_type:
        conditions.append("source_type = ?")
        params.append(source_type)
    if source_component:
        conditions.append("source_component = ?")
        params.append(source_component)
    if segment:
        conditions.append("segment = ?")
        params.append(segment)
    if time_start:
        conditions.append("created_at >= ?")
        params.append(time_start)
    if time_end:
        conditions.append("created_at < ?")
        # time_end is YYYY-MM-DD; use next day for inclusive end-of-day
        try:
            end_exclusive = str(date.fromisoformat(time_end) + timedelta(days=1))
        except ValueError:
            end_exclusive = time_end
        params.append(end_exclusive)
    if kpi_names:
        placeholders = ", ".join("?" for _ in kpi_names)
        conditions.append(f"kpi_name IN ({placeholders})")
        params.extend(kpi_names)
    else:
        # Per-source override takes precedence, then global default
        effective_exact = (
            kpi_db_config.visible_kpis_per_source.get(source_name, []) if source_name else []
        ) or kpi_db_config.visible_kpis
        effective_prefixes = list(dict.fromkeys(kpi_db_config.visible_kpi_prefixes))
        if effective_exact or effective_prefixes:
            parts: list[str] = []
            if effective_exact:
                placeholders = ", ".join("?" for _ in effective_exact)
                parts.append(f"kpi_name IN ({placeholders})")
                params.extend(effective_exact)
            for prefix in effective_prefixes:
                parts.append("kpi_name LIKE ?")
                params.append(prefix + "%")
            conditions.append(f"({' OR '.join(parts)})")

    return " AND ".join(conditions), params


# -- Service functions ---------------------------------------------------------


def get_kpi_categories(
    store: DuckDBStore,
    *,
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiCategoriesResponse:
    """Primary data endpoint: category panels with KPI cards + sparklines.

    Returns all data needed for the Production page KPI section.
    """
    if not store.has_table(TABLE):
        return KpiCategoriesResponse(categories=[])

    sum_kpis = _sum_kpi_spec(source_name)

    where, params = _build_where(
        source_name=source_name,
        kpi_category=kpi_category,
        environment=environment,
        source_type=source_type,
        source_component=source_component,
        segment=segment,
        time_start=time_start,
        time_end=time_end,
    )

    # 1) Current value: latest day's value per kpi_name.
    #    For count KPIs we need the latest day's SUM, not a single row.
    current_agg_params: list[object] = []
    current_agg_expr = _daily_agg_expr(sum_kpis, current_agg_params)
    current_sql = f"""
        WITH daily_latest AS (
            SELECT kpi_name, kpi_category,
                   DATE_TRUNC('day', CAST(created_at AS TIMESTAMP)) AS kpi_date,
                   {current_agg_expr} AS day_val
            FROM {TABLE}
            WHERE {where}
            GROUP BY kpi_name, kpi_category, kpi_date
        ),
        ranked AS (
            SELECT kpi_name, kpi_category, day_val,
                   ROW_NUMBER() OVER (
                       PARTITION BY kpi_name
                       ORDER BY kpi_date DESC
                   ) AS rn
            FROM daily_latest
        )
        SELECT kpi_name, kpi_category, day_val AS numeric_value
        FROM ranked WHERE rn = 1
    """
    current_rows = store.query_list(current_sql, current_agg_params + params)

    # 2) Daily values for sparkline + trend direction (last 30 day buckets).
    #    Uses SUM for count KPIs, AVG for everything else.
    daily_agg_params: list[object] = []
    daily_agg_expr = _daily_agg_expr(sum_kpis, daily_agg_params)
    daily_sql = f"""
        WITH daily AS (
            SELECT kpi_name, kpi_category,
                   DATE_TRUNC('day', CAST(created_at AS TIMESTAMP)) AS kpi_date,
                   {daily_agg_expr} AS avg_val,
                   COUNT(*) AS cnt
            FROM {TABLE}
            WHERE {where}
            GROUP BY kpi_name, kpi_category, kpi_date
        )
        SELECT kpi_name, kpi_category, kpi_date, avg_val, cnt,
               AVG(avg_val) OVER (
                   PARTITION BY kpi_name ORDER BY kpi_date
                   ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
               ) AS avg_7d,
               AVG(avg_val) OVER (
                   PARTITION BY kpi_name ORDER BY kpi_date
                   ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
               ) AS avg_30d
        FROM daily
        ORDER BY kpi_name, kpi_date
    """
    daily_rows = store.query_list(daily_sql, daily_agg_params + params)

    # 3) Record counts per KPI
    count_sql = f"""
        SELECT kpi_name, COUNT(*) AS cnt
        FROM {TABLE}
        WHERE {where}
        GROUP BY kpi_name
    """
    count_rows = store.query_list(count_sql, params)
    count_map: dict[str, int] = {r["kpi_name"]: r["cnt"] for r in count_rows}

    # 4) Date range
    date_range_sql = f"""
        SELECT CAST(MIN(created_at) AS DATE) AS min_date,
               CAST(MAX(created_at) AS DATE) AS max_date
        FROM {TABLE}
        WHERE {where}
    """
    date_range_rows = store.query_list(date_range_sql, params)
    date_range: KpiDateRange | None = None
    if date_range_rows and date_range_rows[0]["min_date"] is not None:
        date_range = KpiDateRange(
            min_date=str(date_range_rows[0]["min_date"]),
            max_date=str(date_range_rows[0]["max_date"]),
        )

    # Build current value map
    current_map: dict[str, dict[str, object]] = {}
    for row in current_rows:
        current_map[row["kpi_name"]] = {
            "value": row["numeric_value"],
            "category": row["kpi_category"],
        }

    # Build sparkline + trend data per KPI
    sparkline_map: dict[str, list[KpiSparklinePoint]] = {}
    trend_map: dict[str, str] = {}  # kpi_name -> "up" | "down" | "flat"
    for row in daily_rows:
        kpi = row["kpi_name"]
        if kpi not in sparkline_map:
            sparkline_map[kpi] = []
        date_str = str(row["kpi_date"])[:10] if row["kpi_date"] else ""
        sparkline_map[kpi].append(KpiSparklinePoint(date=date_str, value=row["avg_val"]))

    # Compute trend direction + collect latest avg_7d/avg_30d per KPI
    avg_7d_map: dict[str, float | None] = {}
    avg_30d_map: dict[str, float | None] = {}
    seen_kpis: set[str] = set()
    for row in reversed(daily_rows):
        kpi = row["kpi_name"]
        if kpi in seen_kpis:
            continue
        seen_kpis.add(kpi)
        avg_7d = row.get("avg_7d")
        avg_30d = row.get("avg_30d")
        avg_7d_map[kpi] = avg_7d
        avg_30d_map[kpi] = avg_30d
        if avg_7d is not None and avg_30d is not None and avg_30d != 0:
            rel_change = (avg_7d - avg_30d) / abs(avg_30d)
            if rel_change > 0.05:
                trend_map[kpi] = "up"
            elif rel_change < -0.05:
                trend_map[kpi] = "down"
            else:
                trend_map[kpi] = "flat"
        else:
            trend_map[kpi] = "flat"

    # Keep only last 30 sparkline points per KPI
    for kpi in sparkline_map:
        sparkline_map[kpi] = sparkline_map[kpi][-30:]

    # Group into category panels
    category_kpis: dict[str, list[KpiCategoryItem]] = {}
    for kpi_name, info in current_map.items():
        cat = str(info.get("category", ""))
        if cat not in category_kpis:
            category_kpis[cat] = []

        # Pick card value based on config
        display_mode = _get_card_display_value(kpi_name, source_name)
        if display_mode == "avg_7d":
            card_value = avg_7d_map.get(kpi_name)
        elif display_mode == "avg_30d":
            card_value = avg_30d_map.get(kpi_name)
        else:
            raw = info.get("value")
            card_value = float(str(raw)) if raw is not None else None

        category_kpis[cat].append(
            KpiCategoryItem(
                kpi_name=kpi_name,
                display_name=_get_display_name(kpi_name, source_name),
                current_value=card_value,  # type: ignore[arg-type]
                card_display_value=display_mode,
                trend_direction=trend_map.get(kpi_name),
                polarity=_get_polarity(kpi_name, source_name),
                sparkline=sparkline_map.get(kpi_name, []),
                unit=_get_unit(kpi_name, source_name),
                record_count=count_map.get(kpi_name, 0),
            )
        )

    # Build panels: config-defined categories first (in order), then any extras from data
    configured_categories = kpi_db_config.categories
    panels: list[KpiCategoryPanel] = []
    seen_cats: set[str] = set()

    for cat_slug, meta in configured_categories.items():
        kpis = category_kpis.get(cat_slug, [])
        seen_cats.add(cat_slug)
        if not kpis:
            continue  # Skip categories with no data
        panels.append(
            KpiCategoryPanel(
                category=cat_slug,
                display_name=meta["display_name"],
                icon=meta["icon"],
                kpis=kpis,
            )
        )

    # Auto-discover categories from data that aren't in config
    for cat_slug, kpis in category_kpis.items():
        if cat_slug not in seen_cats and kpis:
            panels.append(
                KpiCategoryPanel(
                    category=cat_slug,
                    display_name=cat_slug.replace("_", " ").title(),
                    icon="BarChart3",
                    kpis=kpis,
                )
            )

    return KpiCategoriesResponse(categories=panels, date_range=date_range)


def get_kpi_trends(
    store: DuckDBStore,
    *,
    kpi_names: list[str] | None = None,
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiTrendsResponse:
    """Trend data for expanded category panels with rolling averages."""
    if not store.has_table(TABLE):
        return KpiTrendsResponse(data=[], kpi_names=[])

    sum_kpis = _sum_kpi_spec(source_name)

    where, params = _build_where(
        source_name=source_name,
        environment=environment,
        source_type=source_type,
        source_component=source_component,
        segment=segment,
        time_start=time_start,
        time_end=time_end,
        kpi_names=kpi_names,
    )

    agg_params: list[object] = []
    agg_expr = _daily_agg_expr(sum_kpis, agg_params)
    sql = f"""
        WITH daily AS (
            SELECT kpi_name,
                   DATE_TRUNC('day', CAST(created_at AS TIMESTAMP)) AS kpi_date,
                   {agg_expr} AS avg_val,
                   COUNT(*) AS cnt
            FROM {TABLE}
            WHERE {where}
            GROUP BY kpi_name, kpi_date
        )
        SELECT kpi_name,
               CAST(kpi_date AS VARCHAR) AS date,
               avg_val AS value,
               cnt AS count,
               AVG(avg_val) OVER (
                   PARTITION BY kpi_name ORDER BY kpi_date
                   ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
               ) AS avg_7d,
               AVG(avg_val) OVER (
                   PARTITION BY kpi_name ORDER BY kpi_date
                   ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
               ) AS avg_30d
        FROM daily
        ORDER BY kpi_name, kpi_date
    """
    rows = store.query_list(sql, agg_params + params)

    data = [
        KpiTrendPoint(
            date=str(r["date"])[:10],
            kpi_name=r["kpi_name"],
            value=r["value"],
            avg_7d=r["avg_7d"],
            avg_30d=r["avg_30d"],
            count=r["count"],
        )
        for r in rows
    ]

    unique_names = sorted({r["kpi_name"] for r in rows})

    # Collect the union of trend_lines across all KPIs in the response
    all_trend_lines: set[str] = set()
    for name in unique_names:
        all_trend_lines.update(_get_trend_lines(name, source_name))
    trend_lines_list = [t for t in ["daily", "avg_7d", "avg_30d"] if t in all_trend_lines]

    return KpiTrendsResponse(data=data, kpi_names=unique_names, trend_lines=trend_lines_list)


def get_kpi_filters(
    store: DuckDBStore,
    *,
    source_component: str | None = None,
) -> KpiFiltersResponse:
    """Distinct filter values for dropdowns."""
    if not store.has_table(TABLE):
        return KpiFiltersResponse(
            source_names=[],
            environments=[],
            kpi_categories=[],
            kpi_names=[],
            source_types=[],
            source_components=[],
            segments=[],
            kpi_order={},
        )

    def _distinct(col: str) -> list[str]:
        rows = store.query_list(
            f"SELECT DISTINCT {col} FROM {TABLE} WHERE {col} IS NOT NULL ORDER BY {col}"
        )
        return [r[col] for r in rows]

    all_kpi_names = _distinct("kpi_name")
    # Build the full set of KPIs that could be visible for any source
    visible_set: set[str] = set(kpi_db_config.visible_kpis)
    for per_source_list in kpi_db_config.visible_kpis_per_source.values():
        visible_set.update(per_source_list)
    if visible_set or kpi_db_config.visible_kpi_prefixes:
        all_kpi_names = [
            n
            for n in all_kpi_names
            if n in visible_set or _matches_prefix(n, kpi_db_config.visible_kpi_prefixes)
        ]

    try:
        if source_component:
            rows = store.query_list(
                f"SELECT DISTINCT segment FROM {TABLE}"
                " WHERE segment IS NOT NULL AND source_component = ?"
                " ORDER BY segment",
                [source_component],
            )
            segments = [r["segment"] for r in rows]
        else:
            segments = _distinct("segment")
    except Exception:
        segments = []

    # Build kpi_order: global list + per-source overrides
    kpi_order: dict[str, list[str]] = {}
    if kpi_db_config.visible_kpis:
        kpi_order["_default"] = list(kpi_db_config.visible_kpis)
    for src, kpi_list in kpi_db_config.visible_kpis_per_source.items():
        kpi_order[src] = list(kpi_list)

    # Build composition chart configs from YAML
    composition_charts = [
        KpiCompositionChartConfig(
            title=chart["title"],
            kpis=[KpiCompositionKpiEntry(**kpi) for kpi in chart["kpis"]],
            show_remainder=chart.get("show_remainder", False),
            remainder_label=chart.get("remainder_label", "Other"),
            remainder_color=chart.get("remainder_color", "#6B7280"),
        )
        for chart in kpi_db_config.composition_charts
    ]

    # Resolve card-hidden KPI names (exact + prefix match against known names)
    hidden_exact = set(kpi_db_config.card_hidden_kpis)
    hidden_prefixes = kpi_db_config.card_hidden_kpi_prefixes
    card_hidden_kpi_names = [
        n for n in all_kpi_names if n in hidden_exact or _matches_prefix(n, hidden_prefixes)
    ]

    try:
        source_components = _distinct("source_component")
    except Exception:
        source_components = []

    return KpiFiltersResponse(
        source_names=_distinct("source_name"),
        environments=_distinct("environment"),
        kpi_categories=_distinct("kpi_category"),
        kpi_names=all_kpi_names,
        source_types=_distinct("source_type"),
        source_components=source_components,
        segments=segments,
        kpi_order=kpi_order,
        composition_charts=composition_charts,
        has_sankey_charts=bool(kpi_db_config.sankey_charts),
        card_hidden_kpi_names=card_hidden_kpi_names,
    )


def _build_sankey_chart(
    chart_config: dict[str, Any],
    rows: list[dict[str, Any]],
) -> KpiSankeyChartData | None:
    """Assemble a single Sankey chart from query results and config."""
    columns = chart_config["columns"]
    ignore_keys: set[str] = set(chart_config.get("ignore_keys", []))
    node_colors: dict[str, str] = chart_config.get("node_colors", {})
    default_color = "#94A3B8"

    # For each prefix, determine which column keys it covers
    prefixes = chart_config["kpi_prefixes"]
    all_col_keys = [col["key"] for col in columns]

    # Parse all KPI names into segment dicts, grouped by prefix
    # Each parsed entry: {col_key: value, ...} + total
    flows: list[tuple[dict[str, str], float]] = []
    for row in rows:
        kpi_name = row["kpi_name"]
        total = float(row["total"])
        for prefix in prefixes:
            if not kpi_name.startswith(prefix):
                continue
            # Determine expected keys for this prefix from columns
            expected = [k for k in all_col_keys if k not in ignore_keys]
            # Also include ignore_keys for parsing (they exist in the name)
            all_expected = expected + [k for k in ignore_keys if k in all_col_keys]
            # Parse segments using all keys that could appear
            parsed = _parse_kpi_segments(kpi_name, prefix, all_expected + list(ignore_keys))
            if parsed is None:
                continue
            # Drop ignore_keys from the parsed result
            for ik in ignore_keys:
                parsed.pop(ik, None)
            flows.append((parsed, total))
            break

    if not flows:
        return None

    # Build per-column node sets and aggregate flows between adjacent columns
    col_nodes: dict[str, set[str]] = {col["key"]: set() for col in columns}
    # Collect all values per column key
    for parsed, _ in flows:
        for key, val in parsed.items():
            if key in col_nodes:
                col_nodes[key].add(val)

    # Build ordered node list per column
    ordered_col_nodes: dict[str, list[str]] = {}
    for col in columns:
        key = col["key"]
        value_order = col.get("value_order", [])
        values = col_nodes.get(key, set())
        if value_order:
            ordered = [v for v in value_order if v in values]
            ordered += sorted(values - set(ordered))
        else:
            ordered = sorted(values)
        ordered_col_nodes[key] = ordered

    # Build global node list: column-by-column, with unique labels
    nodes: list[KpiSankeyNode] = []
    node_index: dict[tuple[str, str], int] = {}  # (col_key, value) -> index
    for col in columns:
        key = col["key"]
        for val in ordered_col_nodes[key]:
            idx = len(nodes)
            node_index[(key, val)] = idx
            color = node_colors.get(val, default_color)
            display_label = val.replace("_", " ").title()
            nodes.append(KpiSankeyNode(label=display_label, color=color))

    # Aggregate flows between adjacent column pairs
    # First collapse: sum flows that share the same values for non-ignored keys
    collapsed: dict[tuple[str, ...], float] = {}
    for parsed, total in flows:
        key_tuple = tuple(parsed.get(col["key"], "") for col in columns)
        collapsed[key_tuple] = collapsed.get(key_tuple, 0.0) + total

    # Build links between adjacent columns
    links: list[KpiSankeyLink] = []
    for i in range(len(columns) - 1):
        src_key = columns[i]["key"]
        tgt_key = columns[i + 1]["key"]
        src_idx_in_tuple = i
        tgt_idx_in_tuple = i + 1
        # Aggregate per (src_val, tgt_val) pair
        pair_totals: dict[tuple[str, str], float] = {}
        for key_tuple, total in collapsed.items():
            src_val = key_tuple[src_idx_in_tuple]
            tgt_val = key_tuple[tgt_idx_in_tuple]
            if not src_val or not tgt_val:
                continue
            pair = (src_val, tgt_val)
            pair_totals[pair] = pair_totals.get(pair, 0.0) + total
        for (src_val, tgt_val), total in pair_totals.items():
            src_node_idx = node_index.get((src_key, src_val))
            tgt_node_idx = node_index.get((tgt_key, tgt_val))
            if src_node_idx is None or tgt_node_idx is None:
                continue
            src_color = node_colors.get(src_val, default_color)
            link_color = src_color + "80"  # Semi-transparent
            links.append(
                KpiSankeyLink(
                    source=src_node_idx,
                    target=tgt_node_idx,
                    value=total,
                    color=link_color,
                )
            )

    if not links:
        return None

    # Compute per-column totals from collapsed flows (for summary KPIs)
    col_totals: dict[str, float] = {}
    col_node_totals: dict[str, dict[str, float]] = {}
    for col_i, col in enumerate(columns):
        key = col["key"]
        col_totals[key] = 0.0
        col_node_totals[key] = {}
        for key_tuple, total in collapsed.items():
            val = key_tuple[col_i]
            if not val:
                continue
            col_totals[key] += total
            col_node_totals[key][val] = col_node_totals[key].get(val, 0.0) + total

    # Build summary KPIs
    summary_kpis: list[KpiSankeySummaryKpi] = []
    for sk_config in chart_config.get("summary_kpis", []):
        sk_type = sk_config.get("type")
        sk_label = str(sk_config.get("label", ""))
        sk_unit = str(sk_config.get("unit", "count"))
        sk_color: str | None = sk_config.get("color")
        sk_column: str = str(sk_config.get("column", ""))

        if sk_type == "column_total":
            col_val = col_totals.get(sk_column, 0.0)
            summary_kpis.append(
                KpiSankeySummaryKpi(
                    label=sk_label,
                    value=int(col_val),
                    unit=sk_unit,
                    color=sk_color,
                )
            )
        elif sk_type == "node_value":
            sk_node = sk_config.get("node", "")
            sk_format = sk_config.get("format", "raw")
            node_val = col_node_totals.get(sk_column, {}).get(sk_node, 0.0)
            col_total = col_totals.get(sk_column, 0.0)
            if sk_format == "percent_of_column" and col_total > 0:
                pct = (node_val / col_total) * 100
                summary_kpis.append(
                    KpiSankeySummaryKpi(
                        label=sk_label,
                        value=round(pct, 1),
                        unit=sk_unit,
                        color=sk_color,
                    )
                )
            else:
                summary_kpis.append(
                    KpiSankeySummaryKpi(
                        label=sk_label,
                        value=int(node_val),
                        unit=sk_unit,
                        color=sk_color,
                    )
                )

    column_labels = [col["label"] for col in columns]

    return KpiSankeyChartData(
        title=chart_config["title"],
        nodes=nodes,
        links=links,
        summary_kpis=summary_kpis,
        column_labels=column_labels,
    )


def get_kpi_sankey(
    store: DuckDBStore,
    *,
    source_name: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    source_component: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiSankeyResponse:
    """Build Sankey flow diagrams for decision flow KPIs."""
    if not store.has_table(TABLE) or not kpi_db_config.sankey_charts:
        return KpiSankeyResponse(charts=[])

    where, params = _build_where(
        source_name=source_name,
        environment=environment,
        source_type=source_type,
        source_component=source_component,
        segment=segment,
        time_start=time_start,
        time_end=time_end,
    )

    charts: list[KpiSankeyChartData] = []
    for chart_config in kpi_db_config.sankey_charts:
        prefixes = chart_config["kpi_prefixes"]
        # Build prefix LIKE conditions
        prefix_conditions = " OR ".join("kpi_name LIKE ?" for _ in prefixes)
        prefix_params = [p + "%" for p in prefixes]

        sql = f"""
            SELECT kpi_name, SUM(numeric_value) AS total
            FROM {TABLE}
            WHERE {where} AND ({prefix_conditions})
            GROUP BY kpi_name
        """
        rows = store.query_list(sql, params + prefix_params)
        if not rows:
            continue

        chart = _build_sankey_chart(chart_config, rows)
        if chart is not None:
            charts.append(chart)

    return KpiSankeyResponse(charts=charts)
