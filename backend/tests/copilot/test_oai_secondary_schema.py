"""Tests for ``_build_secondary_live_schemas`` in the OAI copilot.

This is the cross-dataset awareness fix that surfaces every *other* loaded live
table's schema so a sentiment question can be answered from
``human_signals_cases`` while ``monitoring`` is the selected dataset.
"""

from typing import Any

import pytest


class _FakeStore:
    """Minimal DuckDB-store stand-in: a table is 'loaded' iff it has metadata."""

    query_limiter = None  # anyio.to_thread.run_sync accepts None (default limiter)

    def __init__(self, tables: dict[str, dict[str, Any]]) -> None:
        self._tables = tables

    def has_table(self, table_name: str) -> bool:
        return table_name in self._tables

    def get_metadata(self, table_name: str) -> dict[str, Any]:
        return self._tables[table_name]


def _meta(columns: list[tuple[str, str]], **extra: Any) -> dict[str, Any]:
    return {
        "columns": [{"column_name": n, "column_type": t} for n, t in columns],
        "filter_values": extra.get("filter_values", {}),
        "row_count": extra.get("row_count", 0),
    }


@pytest.mark.asyncio
async def test_secondary_surfaces_other_live_tables(monkeypatch) -> None:
    """Other loaded live tables appear as compact secondary schemas.

    With ``monitoring_data`` the primary, the rest surface under the OTHER LIVE
    DATASETS header.
    """
    from app.copilot import oai_agent

    monkeypatch.setattr(
        "app.services.duckdb_store.get_live_dataset_tables",
        lambda: [
            ("monitoring", "monitoring_data"),
            ("kpi", "kpi_data"),
            ("human_signals", "human_signals_cases"),
        ],
    )

    store = _FakeStore(
        {
            "monitoring_data": _meta([("source_name", "VARCHAR")], row_count=10),
            "kpi_data": _meta([("kpi_name", "VARCHAR")], row_count=3),
            "human_signals_cases": _meta(
                [("source_name", "VARCHAR"), ("sentiment__score", "VARCHAR")], row_count=5
            ),
        }
    )

    rendered = await oai_agent._build_secondary_live_schemas(store, "monitoring_data")

    assert rendered.startswith(oai_agent.SECONDARY_LIVE_SCHEMA_HEADER)
    # The other live tables are surfaced; the primary is excluded.
    assert "Dataset: kpi" in rendered
    assert "Dataset: human_signals" in rendered
    assert "CREATE TABLE monitoring_data" not in rendered
    # The flattened-signals note travels with human_signals_cases automatically.
    assert "flattened from a JSON" in rendered


@pytest.mark.asyncio
async def test_secondary_skips_unloaded_tables(monkeypatch) -> None:
    """Configured-but-absent tables are skipped; no store / no loaded tables → ''."""
    from app.copilot import oai_agent

    monkeypatch.setattr(
        "app.services.duckdb_store.get_live_dataset_tables",
        lambda: [
            ("monitoring", "monitoring_data"),
            ("kpi", "kpi_data"),
            ("human_signals", "human_signals_cases"),
        ],
    )

    # Only human_signals_cases is loaded; kpi_data + monitoring_data are absent.
    store = _FakeStore({"human_signals_cases": _meta([("source_name", "VARCHAR")], row_count=5)})

    rendered = await oai_agent._build_secondary_live_schemas(store, "monitoring_data")
    assert "Dataset: human_signals" in rendered
    assert "Dataset: kpi" not in rendered

    # Nothing loaded → empty string (no dangling header).
    empty = await oai_agent._build_secondary_live_schemas(_FakeStore({}), "monitoring_data")
    assert empty == ""
