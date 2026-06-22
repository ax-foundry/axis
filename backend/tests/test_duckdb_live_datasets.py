"""Tests for the live-dataset registry.

Covers the ``DuckDBConfig.live_datasets`` default + YAML override and the
``get_live_dataset_tables`` label→table accessor that drives cross-dataset
schema surfacing.
"""

from app.config.db.duckdb import DuckDBConfig, load_duckdb_config


class TestLiveDatasetsConfig:
    """``DuckDBConfig.live_datasets`` default + YAML parsing."""

    def test_default_live_datasets(self) -> None:
        """A bare config carries the conventional live-dataset trio in priority order."""
        assert DuckDBConfig().live_datasets == ["monitoring", "kpi", "human_signals"]

    def test_default_factory_is_not_shared(self) -> None:
        """Each instance gets its own list — mutating one must not leak to another."""
        a = DuckDBConfig()
        b = DuckDBConfig()
        a.live_datasets.append("eval")
        assert b.live_datasets == ["monitoring", "kpi", "human_signals"]

    def test_yaml_override(self, tmp_path, monkeypatch) -> None:
        """A ``live_datasets`` key under ``duckdb:`` overrides the default."""
        cfg_file = tmp_path / "duckdb.yaml"
        cfg_file.write_text(
            "duckdb:\n"
            "  enabled: true\n"
            '  live_datasets: ["monitoring", "human_signals"]\n'
        )
        monkeypatch.setattr("app.config.db.duckdb.DUCKDB_CONFIG_PATH", cfg_file)

        config = load_duckdb_config()
        assert config.live_datasets == ["monitoring", "human_signals"]

    def test_yaml_without_live_datasets_falls_back_to_default(self, tmp_path, monkeypatch) -> None:
        """A duckdb.yaml that omits ``live_datasets`` keeps the hardcoded default."""
        cfg_file = tmp_path / "duckdb.yaml"
        cfg_file.write_text("duckdb:\n  enabled: true\n  path: data/x.duckdb\n")
        monkeypatch.setattr("app.config.db.duckdb.DUCKDB_CONFIG_PATH", cfg_file)

        config = load_duckdb_config()
        assert config.live_datasets == ["monitoring", "kpi", "human_signals"]


class TestGetLiveDatasetTables:
    """``get_live_dataset_tables`` maps labels→tables and drops unknown labels."""

    def test_maps_labels_to_tables_in_order(self, monkeypatch) -> None:
        from app.config.db import duckdb as duckdb_cfg
        from app.services.duckdb_store import get_live_dataset_tables

        monkeypatch.setattr(
            duckdb_cfg.duckdb_config, "live_datasets", ["monitoring", "kpi", "human_signals"]
        )
        assert get_live_dataset_tables() == [
            ("monitoring", "monitoring_data"),
            ("kpi", "kpi_data"),
            ("human_signals", "human_signals_cases"),
        ]

    def test_skips_unknown_labels(self, monkeypatch) -> None:
        """A config typo (label not in DATASET_TABLE_MAP) is silently dropped, not raised."""
        from app.config.db import duckdb as duckdb_cfg
        from app.services.duckdb_store import get_live_dataset_tables

        monkeypatch.setattr(
            duckdb_cfg.duckdb_config, "live_datasets", ["monitoring", "not_a_real_label", "kpi"]
        )
        assert get_live_dataset_tables() == [
            ("monitoring", "monitoring_data"),
            ("kpi", "kpi_data"),
        ]

    def test_empty_config(self, monkeypatch) -> None:
        from app.config.db import duckdb as duckdb_cfg
        from app.services.duckdb_store import get_live_dataset_tables

        monkeypatch.setattr(duckdb_cfg.duckdb_config, "live_datasets", [])
        assert get_live_dataset_tables() == []
