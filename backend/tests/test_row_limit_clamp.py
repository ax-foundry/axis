"""Tests for the shared row_limit ceiling.

The ceiling itself is deliberate (it is sized against the Cloud Run memory
budget). What these pin down is that reaching it is *visible* -- a silent clamp
is how a config can read row_limit: 500000 while the sync loads 50000 and
nothing anywhere says so.
"""

import logging

from app.config.db._base import MAX_ROW_LIMIT, clamp_row_limit, parse_base_fields


class TestClampRowLimit:
    def test_returns_value_below_ceiling_unchanged(self) -> None:
        assert clamp_row_limit(10_000, dataset="kpi_db") == 10_000

    def test_returns_value_at_ceiling_unchanged(self) -> None:
        assert clamp_row_limit(MAX_ROW_LIMIT, dataset="kpi_db") == MAX_ROW_LIMIT

    def test_clamps_value_above_ceiling(self) -> None:
        assert clamp_row_limit(500_000, dataset="kpi_db") == MAX_ROW_LIMIT

    def test_warns_when_clamping(self, caplog) -> None:
        with caplog.at_level(logging.WARNING, logger="app.config.db._base"):
            clamp_row_limit(500_000, dataset="kpi_db")
        assert len(caplog.records) == 1
        message = caplog.records[0].getMessage()
        assert "kpi_db" in message
        assert "500000" in message
        assert str(MAX_ROW_LIMIT) in message

    def test_does_not_warn_below_ceiling(self, caplog) -> None:
        with caplog.at_level(logging.WARNING, logger="app.config.db._base"):
            clamp_row_limit(10_000, dataset="kpi_db")
        assert caplog.records == []


class TestParseBaseFieldsRowLimit:
    def test_applies_the_ceiling(self, caplog) -> None:
        with caplog.at_level(logging.WARNING, logger="app.config.db._base"):
            parsed = parse_base_fields({"row_limit": 500_000}, dataset="monitoring_db")
        assert parsed["row_limit"] == MAX_ROW_LIMIT
        assert "monitoring_db" in caplog.records[0].getMessage()

    def test_defaults_when_absent(self) -> None:
        assert parse_base_fields({}, dataset="monitoring_db")["row_limit"] == 10_000


class TestKpiRowLimitIsNotEnforced:
    """kpi_db parses row_limit but the KPI sync never applies it.

    Pinned so the field can't quietly start looking like a ceiling again: the
    misleading version of this warning is what let a 100000 -> 500000 config
    change read as meaningful when it changed nothing.
    """

    def test_kpi_config_does_not_clamp_to_the_ceiling(self) -> None:
        from app.config.db.kpi import KpiDBConfig

        assert KpiDBConfig(row_limit=500_000).row_limit == 500_000

    def test_sync_engine_never_appends_a_limit_for_kpi(self) -> None:
        import inspect

        from app.services import sync_engine

        assert "row_limit" not in inspect.getsource(sync_engine)
