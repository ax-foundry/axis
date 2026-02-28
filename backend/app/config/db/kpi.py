"""KPI database configuration."""

import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

from ..env import settings
from ..paths import resolve_config_path

logger = logging.getLogger(__name__)

KPI_DB_CONFIG_PATH = resolve_config_path("kpi_db.yaml")

VALID_CARD_DISPLAY_VALUES = {"latest", "avg_7d", "avg_30d"}
VALID_TREND_LINES = {"daily", "avg_7d", "avg_30d"}
VALID_UNITS = {"percent", "seconds", "count", "score"}


@dataclass
class KpiDBConfig:
    """Agent KPI database configuration loaded from YAML or env vars.

    Simplified from EvalDBConfig: single query (no dataset/results split).
    """

    enabled: bool = False
    auto_load: bool = False
    url: str | None = None
    host: str | None = None
    port: int = 5432
    database: str | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: str = "prefer"
    query: str | None = None  # Single query (no split)
    query_timeout: int = 60
    row_limit: int = 50000
    columns: dict[str, str] = field(default_factory=dict)
    db_type: str = "postgres"
    partition_column: str | None = None
    refresh_interval_minutes: int = 0
    incremental_column: str | None = None
    visible_kpis: list[str] = field(default_factory=list)  # Empty = show all
    visible_kpis_per_source: dict[str, list[str]] = field(
        default_factory=dict
    )  # Per-agent overrides
    # Display config
    card_display_value: str = "latest"  # latest | avg_7d | avg_30d
    trend_lines: list[str] = field(default_factory=lambda: ["daily", "avg_7d", "avg_30d"])
    kpi_overrides: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Per-source display overrides (card_display_value, trend_lines, kpi_overrides)
    display_per_source: dict[str, dict[str, Any]] = field(default_factory=dict)
    # Category metadata: slug -> {display_name, icon}
    # When empty, categories are auto-discovered from kpi_category column in data.
    categories: dict[str, dict[str, str]] = field(default_factory=dict)
    # Composition chart definitions: stacked bar charts built from existing KPI values
    composition_charts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        """Check if enough config is provided to connect."""
        if self.url:
            return True
        return bool(self.host and self.database)

    @property
    def has_query(self) -> bool:
        """Check if a SQL query is configured."""
        return bool(self.query and self.query.strip())

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled and configured."""
        return self.auto_load and self.is_configured


def _parse_visible_kpis_per_source(raw: Any) -> dict[str, list[str]]:
    """Parse visible_kpis_per_source from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, list[str]] = {}
    for source, kpis in raw.items():
        if isinstance(kpis, list):
            result[str(source)] = [str(k) for k in kpis if k]
    return result


def _parse_kpi_overrides(raw: Any) -> dict[str, dict[str, Any]]:
    """Parse per-KPI display overrides from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for kpi_name, overrides in raw.items():
        if not isinstance(overrides, dict):
            continue
        parsed: dict[str, Any] = {}
        if "card_display_value" in overrides:
            val = str(overrides["card_display_value"])
            if val in VALID_CARD_DISPLAY_VALUES:
                parsed["card_display_value"] = val
        if "trend_lines" in overrides and isinstance(overrides["trend_lines"], list):
            parsed["trend_lines"] = [
                str(t) for t in overrides["trend_lines"] if str(t) in VALID_TREND_LINES
            ]
        if "unit" in overrides:
            val = str(overrides["unit"])
            if val in VALID_UNITS:
                parsed["unit"] = val
        if "display_name" in overrides:
            parsed["display_name"] = str(overrides["display_name"])
        if "polarity" in overrides and overrides["polarity"] in (
            "higher_better",
            "lower_better",
        ):
            parsed["polarity"] = str(overrides["polarity"])
        if parsed:
            result[str(kpi_name)] = parsed
    return result


def _parse_categories(raw: Any) -> dict[str, dict[str, str]]:
    """Parse KPI category definitions from YAML config."""
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, str]] = {}
    for slug, meta in raw.items():
        if not isinstance(meta, dict):
            continue
        result[str(slug)] = {
            "display_name": str(meta.get("display_name", slug.replace("_", " ").title())),
            "icon": str(meta.get("icon", "BarChart3")),
        }
    return result


def _parse_composition_charts(raw: Any) -> list[dict[str, Any]]:
    """Parse composition_charts list from YAML config.

    Each chart must have a title and a kpis list.
    """
    if not isinstance(raw, list):
        return []
    charts: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        title = entry.get("title")
        kpis = entry.get("kpis")
        if not title or not isinstance(kpis, list) or len(kpis) == 0:
            continue
        parsed_kpis = []
        for kpi in kpis:
            if isinstance(kpi, dict) and kpi.get("kpi_name"):
                parsed_kpis.append(
                    {
                        "kpi_name": str(kpi["kpi_name"]),
                        "label": str(kpi.get("label", kpi["kpi_name"])),
                        "color": str(kpi.get("color", "#6B7280")),
                    }
                )
        if not parsed_kpis:
            continue
        charts.append(
            {
                "title": str(title),
                "kpis": parsed_kpis,
                "show_remainder": bool(entry.get("show_remainder", False)),
                "remainder_label": str(entry.get("remainder_label", "Other")),
                "remainder_color": str(entry.get("remainder_color", "#6B7280")),
            }
        )
    return charts


def _parse_display_per_source(raw: Any) -> dict[str, dict[str, Any]]:
    """Parse per-source display overrides from YAML config.

    Each source can have card_display_value, trend_lines, and kpi_overrides.
    """
    if not isinstance(raw, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for source_name, source_cfg in raw.items():
        if not isinstance(source_cfg, dict):
            continue
        parsed: dict[str, Any] = {}
        if "card_display_value" in source_cfg:
            val = str(source_cfg["card_display_value"])
            if val in VALID_CARD_DISPLAY_VALUES:
                parsed["card_display_value"] = val
        if "trend_lines" in source_cfg and isinstance(source_cfg["trend_lines"], list):
            parsed["trend_lines"] = [
                str(t) for t in source_cfg["trend_lines"] if str(t) in VALID_TREND_LINES
            ]
        if "kpi_overrides" in source_cfg:
            parsed["kpi_overrides"] = _parse_kpi_overrides(source_cfg["kpi_overrides"])
        if parsed:
            result[str(source_name)] = parsed
    return result


def load_kpi_db_config() -> KpiDBConfig:
    """Load KPI database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = KpiDBConfig()

    if KPI_DB_CONFIG_PATH.exists():
        try:
            with KPI_DB_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("kpi_db"):
                db_config = yaml_config["kpi_db"]
                query_timeout = min(db_config.get("query_timeout", 60), 120)
                row_limit = min(db_config.get("row_limit", 50000), 50000)

                config = KpiDBConfig(
                    enabled=db_config.get("enabled", False),
                    auto_load=db_config.get("auto_load", False),
                    url=db_config.get("url") or settings.kpi_db_url,
                    host=db_config.get("host"),
                    port=db_config.get("port", 5432),
                    database=db_config.get("database"),
                    username=db_config.get("username"),
                    password=db_config.get("password") or settings.kpi_db_password,
                    ssl_mode=db_config.get("ssl_mode", "prefer"),
                    query=db_config.get("query"),
                    query_timeout=query_timeout,
                    row_limit=row_limit,
                    columns=db_config.get("columns", {}),
                    partition_column=db_config.get("partition_column"),
                    refresh_interval_minutes=db_config.get("refresh_interval_minutes", 0),
                    incremental_column=db_config.get("incremental_column"),
                    visible_kpis=db_config.get("visible_kpis", []) or [],
                    visible_kpis_per_source=_parse_visible_kpis_per_source(
                        db_config.get("visible_kpis_per_source")
                    ),
                    card_display_value=(
                        str(db_config["card_display_value"])
                        if db_config.get("card_display_value") in VALID_CARD_DISPLAY_VALUES
                        else "latest"
                    ),
                    trend_lines=[
                        str(t)
                        for t in (db_config.get("trend_lines") or [])
                        if str(t) in VALID_TREND_LINES
                    ]
                    or ["daily", "avg_7d", "avg_30d"],
                    kpi_overrides=_parse_kpi_overrides(db_config.get("kpi_overrides")),
                    display_per_source=_parse_display_per_source(
                        db_config.get("display_per_source")
                    ),
                    categories=_parse_categories(db_config.get("categories")),
                    composition_charts=_parse_composition_charts(
                        db_config.get("composition_charts")
                    ),
                )
                logger.info("Loaded KPI DB config from %s", KPI_DB_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load KPI DB YAML config: %s", e)

    # Fall back to env vars
    if settings.kpi_db_url or settings.kpi_db_host:
        config = KpiDBConfig(
            enabled=True,
            auto_load=settings.kpi_db_auto_load,
            url=settings.kpi_db_url,
            host=settings.kpi_db_host,
            port=settings.kpi_db_port,
            database=settings.kpi_db_name,
            username=settings.kpi_db_user,
            password=settings.kpi_db_password,
            ssl_mode=settings.kpi_db_ssl_mode,
        )
        logger.info("Loaded KPI DB config from environment variables")

    return config


kpi_db_config = load_kpi_db_config()
