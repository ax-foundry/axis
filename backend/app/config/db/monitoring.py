import logging
from dataclasses import dataclass, field
from typing import Any

import yaml

from ..env import settings
from ..paths import resolve_config_path
from ._base import BaseDBImportConfig, parse_base_fields

logger = logging.getLogger(__name__)

MONITORING_CONFIG_PATH = resolve_config_path("monitoring_db.yaml")


@dataclass
class AnomalyDetectionConfig:
    """Anomaly detection settings for monitoring trend data."""

    enabled: bool = False
    min_data_points: int = 5
    # Z-score
    z_score_enabled: bool = True
    z_score_threshold: float = 2.0
    z_score_severity: str = "warning"
    z_score_lookback_window: int = 20
    z_score_metrics: list[str] = field(default_factory=list)
    # Moving average
    ma_enabled: bool = True
    ma_window_size: int = 5
    ma_deviation_threshold: float = 0.15
    ma_severity: str = "warning"
    ma_metrics: list[str] = field(default_factory=list)
    # Rate of change
    roc_enabled: bool = True
    roc_threshold: float = 0.3
    roc_severity: str = "error"
    roc_metrics: list[str] = field(default_factory=list)


@dataclass
class MonitoringDBConfig(BaseDBImportConfig):
    """Monitoring database configuration loaded from YAML or env vars."""

    enabled: bool = False
    auto_connect: bool = False
    auto_load: bool = False
    schema_name: str = "public"
    table: str | None = None
    # Score thresholds for chart reference lines and health status
    thresholds_default_good: float = 0.7
    thresholds_default_pass: float = 0.5
    thresholds_per_source: dict[str, dict[str, float]] = field(default_factory=dict)
    # Anomaly detection config
    anomaly_detection: AnomalyDetectionConfig = field(default_factory=AnomalyDetectionConfig)
    visible_metrics: list[str] = field(default_factory=list)

    @property
    def should_auto_load(self) -> bool:
        """Check if auto-load is enabled (either via auto_load or legacy auto_connect)."""
        return (self.auto_load or self.auto_connect) and self.is_configured


def _parse_thresholds(
    db_config: dict[str, Any],
) -> tuple[float, float, dict[str, dict[str, float]]]:
    """Parse the thresholds section from monitoring_db YAML config.

    Returns (default_good, default_pass, per_source_dict).
    """
    default_good = 0.7
    default_pass = 0.5
    per_source: dict[str, dict[str, float]] = {}

    thresholds = db_config.get("thresholds")
    if isinstance(thresholds, dict):
        defaults = thresholds.get("default")
        if isinstance(defaults, dict):
            default_good = float(defaults.get("good", 0.7))
            default_pass = float(defaults.get("pass", 0.5))
        ps = thresholds.get("per_source")
        if isinstance(ps, dict):
            for source_name, vals in ps.items():
                if isinstance(vals, dict):
                    per_source[str(source_name)] = {
                        "good": float(vals.get("good", default_good)),
                        "pass": float(vals.get("pass", default_pass)),
                    }

    return default_good, default_pass, per_source


def _parse_anomaly_detection(db_config: dict[str, Any]) -> AnomalyDetectionConfig:
    """Parse the anomaly_detection section from monitoring_db YAML config."""
    config = AnomalyDetectionConfig()
    ad = db_config.get("anomaly_detection")
    if not isinstance(ad, dict):
        return config

    valid_severities = {"warning", "error"}

    def _sev(val: str, default: str) -> str:
        return val if val in valid_severities else default

    def _metrics_list(val: Any) -> list[str]:
        if isinstance(val, list):
            return [str(m) for m in val if m]
        return []

    z = ad.get("z_score", {}) if isinstance(ad.get("z_score"), dict) else {}
    ma = ad.get("moving_average", {}) if isinstance(ad.get("moving_average"), dict) else {}
    roc = ad.get("rate_of_change", {}) if isinstance(ad.get("rate_of_change"), dict) else {}

    return AnomalyDetectionConfig(
        enabled=bool(ad.get("enabled", False)),
        min_data_points=max(3, int(ad.get("min_data_points", 5))),
        z_score_enabled=bool(z.get("enabled", True)),
        z_score_threshold=float(z.get("threshold", 2.0)),
        z_score_severity=_sev(str(z.get("severity", "warning")), "warning"),
        z_score_lookback_window=int(z.get("lookback_window", 20)),
        z_score_metrics=_metrics_list(z.get("metrics")),
        ma_enabled=bool(ma.get("enabled", True)),
        ma_window_size=max(2, int(ma.get("window_size", 5))),
        ma_deviation_threshold=float(ma.get("deviation_threshold", 0.15)),
        ma_severity=_sev(str(ma.get("severity", "warning")), "warning"),
        ma_metrics=_metrics_list(ma.get("metrics")),
        roc_enabled=bool(roc.get("enabled", True)),
        roc_threshold=float(roc.get("threshold", 0.3)),
        roc_severity=_sev(str(roc.get("severity", "error")), "error"),
        roc_metrics=_metrics_list(roc.get("metrics")),
    )


def load_monitoring_db_config() -> MonitoringDBConfig:
    """Load monitoring database config from YAML file first, then env vars.

    YAML takes precedence if it exists.
    """
    config = MonitoringDBConfig()

    # Try loading from YAML config file first
    if MONITORING_CONFIG_PATH.exists():
        try:
            with MONITORING_CONFIG_PATH.open() as f:
                yaml_config: dict[str, Any] = yaml.safe_load(f) or {}

            if yaml_config.get("monitoring_db"):
                db_config = yaml_config["monitoring_db"]
                base = parse_base_fields(
                    db_config,
                    env_password=settings.monitoring_db_password,
                    env_url=settings.monitoring_db_url,
                )

                t_good, t_pass, t_per_source = _parse_thresholds(db_config)
                anomaly_cfg = _parse_anomaly_detection(db_config)

                config = MonitoringDBConfig(
                    **base,
                    enabled=db_config.get("enabled", False),
                    auto_connect=db_config.get("auto_connect", False),
                    auto_load=db_config.get("auto_load", False),
                    schema_name=db_config.get("schema", "public"),
                    table=db_config.get("table"),
                    thresholds_default_good=t_good,
                    thresholds_default_pass=t_pass,
                    thresholds_per_source=t_per_source,
                    anomaly_detection=anomaly_cfg,
                    visible_metrics=db_config.get("visible_metrics", []) or [],
                )
                logger.info("Loaded monitoring DB config from %s", MONITORING_CONFIG_PATH)
                return config
        except Exception as e:
            logger.warning("Failed to load monitoring YAML config: %s", e)

    # Fall back to env vars
    if settings.monitoring_db_url or settings.monitoring_db_host:
        config = MonitoringDBConfig(
            enabled=True,
            auto_connect=settings.monitoring_db_auto_connect,
            auto_load=False,
            host=settings.monitoring_db_host,
            port=settings.monitoring_db_port,
            database=settings.monitoring_db_name,
            username=settings.monitoring_db_user,
            password=settings.monitoring_db_password,
            schema_name=settings.monitoring_db_schema,
            table=settings.monitoring_db_table,
            ssl_mode=settings.monitoring_db_ssl_mode,
            url=settings.monitoring_db_url,
        )
        logger.info("Loaded monitoring DB config from environment variables")

    return config


monitoring_db_config = load_monitoring_db_config()
