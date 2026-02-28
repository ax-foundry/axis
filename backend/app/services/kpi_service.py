import logging

from app.config.db.kpi import kpi_db_config
from app.models.kpi_schemas import (
    KpiCategoriesResponse,
    KpiCategoryItem,
    KpiCategoryPanel,
    KpiCompositionChartConfig,
    KpiCompositionKpiEntry,
    KpiDateRange,
    KpiFiltersResponse,
    KpiSparklinePoint,
    KpiTrendPoint,
    KpiTrendsResponse,
)
from app.services.duckdb_store import DuckDBStore

logger = logging.getLogger(__name__)

TABLE = "kpi_data"


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
    return str(global_kpi.get("card_display_value", kpi_db_config.card_display_value))


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
    return list(global_kpi.get("trend_lines", kpi_db_config.trend_lines))


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
    return "score"


def _get_display_name(kpi_name: str, source_name: str | None = None) -> str:
    """Get the display name for a KPI.

    Resolution order:
    1. display_per_source[source].kpi_overrides[kpi].display_name
    2. kpi_overrides[kpi].display_name (global per-KPI)
    3. Auto-generated from kpi_name
    """
    if source_name:
        src_cfg = kpi_db_config.display_per_source.get(source_name, {})
        src_kpi = src_cfg.get("kpi_overrides", {}).get(kpi_name, {})
        if "display_name" in src_kpi:
            return str(src_kpi["display_name"])
    global_kpi = kpi_db_config.kpi_overrides.get(kpi_name, {})
    if "display_name" in global_kpi:
        return str(global_kpi["display_name"])
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
    return "higher_better"


# -- SQL helpers ---------------------------------------------------------------


def _sum_kpi_names(source_name: str | None = None) -> set[str]:
    """Return kpi_names that should use SUM aggregation (count-type KPIs).

    Checks kpi_overrides and display_per_source for unit == 'count'.
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
    return names


def _daily_agg_expr(sum_kpis: set[str], params: list[object]) -> str:
    """Build a SQL expression that uses SUM for count KPIs, AVG otherwise."""
    if not sum_kpis:
        return "AVG(numeric_value)"
    placeholders = ", ".join("?" for _ in sum_kpis)
    params.extend(sorted(sum_kpis))
    return (
        f"CASE WHEN kpi_name IN ({placeholders}) "
        f"THEN SUM(numeric_value) ELSE AVG(numeric_value) END"
    )


def _build_where(
    *,
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
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
    if segment:
        conditions.append("segment = ?")
        params.append(segment)
    if time_start:
        conditions.append("created_at >= ?")
        params.append(time_start)
    if time_end:
        conditions.append("created_at <= ?")
        params.append(time_end)
    if kpi_names:
        placeholders = ", ".join("?" for _ in kpi_names)
        conditions.append(f"kpi_name IN ({placeholders})")
        params.extend(kpi_names)
    else:
        # Per-source override takes precedence, then global default
        effective = (
            kpi_db_config.visible_kpis_per_source.get(source_name, []) if source_name else []
        ) or kpi_db_config.visible_kpis
        if effective:
            placeholders = ", ".join("?" for _ in effective)
            conditions.append(f"kpi_name IN ({placeholders})")
            params.extend(effective)

    return " AND ".join(conditions), params


# -- Service functions ---------------------------------------------------------


def get_kpi_categories(
    store: DuckDBStore,
    *,
    source_name: str | None = None,
    kpi_category: str | None = None,
    environment: str | None = None,
    source_type: str | None = None,
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiCategoriesResponse:
    """Primary data endpoint: category panels with KPI cards + sparklines.

    Returns all data needed for the Production page KPI section.
    """
    if not store.has_table(TABLE):
        return KpiCategoriesResponse(categories=[])

    sum_kpis = _sum_kpi_names(source_name)

    where, params = _build_where(
        source_name=source_name,
        kpi_category=kpi_category,
        environment=environment,
        source_type=source_type,
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
    segment: str | None = None,
    time_start: str | None = None,
    time_end: str | None = None,
) -> KpiTrendsResponse:
    """Trend data for expanded category panels with rolling averages."""
    if not store.has_table(TABLE):
        return KpiTrendsResponse(data=[], kpi_names=[])

    sum_kpis = _sum_kpi_names(source_name)

    where, params = _build_where(
        source_name=source_name,
        environment=environment,
        source_type=source_type,
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


def get_kpi_filters(store: DuckDBStore) -> KpiFiltersResponse:
    """Distinct filter values for dropdowns."""
    if not store.has_table(TABLE):
        return KpiFiltersResponse(
            source_names=[],
            environments=[],
            kpi_categories=[],
            kpi_names=[],
            source_types=[],
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
    if visible_set:
        all_kpi_names = [n for n in all_kpi_names if n in visible_set]

    try:
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

    return KpiFiltersResponse(
        source_names=_distinct("source_name"),
        environments=_distinct("environment"),
        kpi_categories=_distinct("kpi_category"),
        kpi_names=all_kpi_names,
        source_types=_distinct("source_type"),
        segments=segments,
        kpi_order=kpi_order,
        composition_charts=composition_charts,
    )
