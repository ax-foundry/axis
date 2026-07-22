"""Tests for prefix-aware KPI service logic.

Covers config parsing, prefix matching, SQL generation, visibility filtering,
dynamic display name parsing, and display config resolution.
"""

from unittest.mock import patch

import duckdb
import pytest

from app.config.db.kpi import (
    KpiDBConfig,
    _parse_display_per_source,
    _parse_kpi_override_prefixes,
    _parse_kpi_overrides,
    _parse_prefix_list,
    _parse_weighted_kpis,
)
from app.services.duckdb_store import DuckDBStore
from app.services.kpi_service import (
    SumKpiSpec,
    _build_where,
    _daily_agg_expr,
    _find_longest_matching_prefix,
    _get_card_display_value,
    _get_display_name,
    _get_polarity,
    _get_segment_visual_order,
    _get_unit,
    _matches_prefix,
    _parse_dynamic_display_name,
    _weighted_kpi_spec,
    get_kpi_segment_comparison,
)


class FakeStore:
    """Minimal store test double that records the segment-comparison SQL."""

    def __init__(self) -> None:
        """Initialise captured query state."""
        self.sql: str | None = None
        self.params: list[object] | None = None

    def query_list(self, sql: str, params: list[object]) -> list[dict[str, object]]:
        """Capture SQL and return deterministic segment rows."""
        self.sql = sql
        self.params = params
        return [
            {"segment": "tool.a", "agg_value": 0.95, "count": 10},
            {"segment": "tool.b", "agg_value": 0.9, "count": 5},
        ]


# ---------------------------------------------------------------------------
# Config parsing
# ---------------------------------------------------------------------------


class TestParsePrefixList:
    def test_valid_list(self) -> None:
        assert _parse_prefix_list(["foo_", "bar_"]) == ["foo_", "bar_"]

    def test_strips_whitespace(self) -> None:
        assert _parse_prefix_list(["  foo_ ", " bar_"]) == ["foo_", "bar_"]

    def test_rejects_empty_and_blank(self) -> None:
        assert _parse_prefix_list(["", " ", None, "ok_"]) == ["ok_"]

    def test_none_input(self) -> None:
        assert _parse_prefix_list(None) == []

    def test_non_list_input(self) -> None:
        assert _parse_prefix_list("not_a_list") == []


class TestParseKpiOverridePrefixes:
    def test_valid_overrides(self) -> None:
        raw = {
            "flow_a__": {
                "unit": "count",
                "polarity": "higher_better",
                "label_format": "A {x}",
            }
        }
        result = _parse_kpi_override_prefixes(raw)
        assert result == {
            "flow_a__": {
                "unit": "count",
                "polarity": "higher_better",
                "label_format": "A {x}",
            }
        }

    def test_invalid_unit_rejected(self) -> None:
        raw = {"p__": {"unit": "invalid"}}
        result = _parse_kpi_override_prefixes(raw)
        assert result == {}  # no valid fields parsed → empty

    def test_preserves_label_format(self) -> None:
        raw = {"p__": {"label_format": "Test {a} {b}"}}
        result = _parse_kpi_override_prefixes(raw)
        assert result["p__"]["label_format"] == "Test {a} {b}"

    def test_none_input(self) -> None:
        assert _parse_kpi_override_prefixes(None) == {}

    def test_non_dict_override_skipped(self) -> None:
        raw = {"good__": {"unit": "count"}, "bad__": "not_a_dict"}
        result = _parse_kpi_override_prefixes(raw)
        assert "good__" in result
        assert "bad__" not in result


class TestParseSegmentVisualOrder:
    def test_kpi_override_accepts_segment_visual_order(self) -> None:
        result = _parse_kpi_overrides(
            {"metric": {"segment_visual_order": "lowest_top", "unit": "percent"}}
        )
        assert result["metric"]["segment_visual_order"] == "lowest_top"

    def test_kpi_override_rejects_invalid_segment_visual_order(self) -> None:
        result = _parse_kpi_overrides({"metric": {"segment_visual_order": "sideways"}})
        assert result == {}

    def test_display_per_source_accepts_source_default_segment_visual_order(self) -> None:
        result = _parse_display_per_source({"athena": {"segment_visual_order": "highest_top"}})
        assert result["athena"]["segment_visual_order"] == "highest_top"

    def test_display_per_source_accepts_kpi_segment_visual_order(self) -> None:
        result = _parse_display_per_source(
            {
                "athena": {
                    "kpi_overrides": {
                        "tool_success_rate_by_name": {"segment_visual_order": "lowest_top"}
                    }
                }
            }
        )
        assert (
            result["athena"]["kpi_overrides"]["tool_success_rate_by_name"]["segment_visual_order"]
            == "lowest_top"
        )


# ---------------------------------------------------------------------------
# Prefix matching
# ---------------------------------------------------------------------------


class TestMatchesPrefix:
    def test_match(self) -> None:
        assert _matches_prefix("flow_a__x", ["flow_a__"]) is True

    def test_no_match(self) -> None:
        assert _matches_prefix("other_x", ["flow_a__"]) is False

    def test_empty_prefixes(self) -> None:
        assert _matches_prefix("anything", []) is False

    def test_multiple_prefixes(self) -> None:
        assert _matches_prefix("flow_b__y", ["flow_a__", "flow_b__"]) is True


class TestFindLongestMatchingPrefix:
    def test_longest_wins(self) -> None:
        d = {"flow_": {}, "flow_a__": {}, "flow_a__x_": {}}
        assert _find_longest_matching_prefix("flow_a__x_y", d) == "flow_a__x_"

    def test_no_match(self) -> None:
        d = {"flow_a__": {}}
        assert _find_longest_matching_prefix("other_x", d) is None

    def test_empty_dict(self) -> None:
        assert _find_longest_matching_prefix("anything", {}) is None

    def test_exact_prefix(self) -> None:
        d = {"flow_": {}}
        assert _find_longest_matching_prefix("flow_x", d) == "flow_"


# ---------------------------------------------------------------------------
# SumKpiSpec + SQL generation
# ---------------------------------------------------------------------------


class TestSumKpiSpec:
    def test_is_empty_when_both_empty(self) -> None:
        assert SumKpiSpec(exact_names=set(), prefixes=[]).is_empty is True

    def test_not_empty_with_exact(self) -> None:
        assert SumKpiSpec(exact_names={"a"}, prefixes=[]).is_empty is False

    def test_not_empty_with_prefixes(self) -> None:
        assert SumKpiSpec(exact_names=set(), prefixes=["p_"]).is_empty is False


class TestDailyAggExpr:
    def test_empty_spec(self) -> None:
        params: list[object] = []
        result = _daily_agg_expr(SumKpiSpec(set(), []), params)
        assert result == "AVG(numeric_value)"
        assert params == []

    def test_exact_only(self) -> None:
        params: list[object] = []
        result = _daily_agg_expr(SumKpiSpec({"b", "a"}, []), params)
        assert "kpi_name IN (?, ?)" in result
        assert params == ["a", "b"]  # sorted

    def test_prefix_only(self) -> None:
        params: list[object] = []
        result = _daily_agg_expr(SumKpiSpec(set(), ["flow_"]), params)
        assert "kpi_name LIKE ?" in result
        assert params == ["flow_%"]

    def test_combined(self) -> None:
        params: list[object] = []
        spec = SumKpiSpec(exact_names={"x"}, prefixes=["p_"])
        result = _daily_agg_expr(spec, params)
        assert "kpi_name IN (?)" in result
        assert "kpi_name LIKE ?" in result
        assert "x" in params
        assert "p_%" in params
        assert "CASE WHEN" in result

    def test_duplicate_prefixes_deduplicated(self) -> None:
        params: list[object] = []
        spec = SumKpiSpec(exact_names=set(), prefixes=["p_", "p_", "q_"])
        result = _daily_agg_expr(spec, params)
        assert params == ["p_%", "q_%"]
        assert result.count("kpi_name LIKE ?") == 2


# ---------------------------------------------------------------------------
# Visibility SQL (_build_where)
# ---------------------------------------------------------------------------


class TestBuildWhereVisibility:
    def _make_config(
        self,
        visible_kpis: list[str] | None = None,
        visible_kpi_prefixes: list[str] | None = None,
    ) -> KpiDBConfig:
        return KpiDBConfig(
            visible_kpis=visible_kpis or [],
            visible_kpi_prefixes=visible_kpi_prefixes or [],
        )

    def test_no_visibility_filters(self) -> None:
        cfg = self._make_config()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            where, params = _build_where()
        assert "kpi_name" not in where
        assert params == []

    def test_exact_only(self) -> None:
        cfg = self._make_config(visible_kpis=["a", "b"])
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            where, params = _build_where()
        assert "kpi_name IN (?, ?)" in where
        assert "a" in params and "b" in params

    def test_prefix_only(self) -> None:
        cfg = self._make_config(visible_kpi_prefixes=["flow_"])
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            where, params = _build_where()
        assert "kpi_name LIKE ?" in where
        assert "flow_%" in params

    def test_combined_exact_and_prefix(self) -> None:
        cfg = self._make_config(visible_kpis=["x"], visible_kpi_prefixes=["p_"])
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            where, params = _build_where()
        assert "kpi_name IN (?)" in where
        assert "kpi_name LIKE ?" in where
        # Wrapped in parens for AND safety
        assert "(" in where and ")" in where

    def test_explicit_kpi_names_bypass_visibility(self) -> None:
        cfg = self._make_config(visible_kpis=["a"], visible_kpi_prefixes=["p_"])
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            where, params = _build_where(kpi_names=["z"])
        # Only the explicit kpi_names filter, not visibility
        assert "kpi_name IN (?)" in where
        assert params[-1] == "z"
        assert "LIKE" not in where


# ---------------------------------------------------------------------------
# Display name resolution
# ---------------------------------------------------------------------------


class TestGetDisplayName:
    def _make_config(
        self,
        kpi_overrides: dict | None = None,
        kpi_override_prefixes: dict | None = None,
        display_per_source: dict | None = None,
    ) -> KpiDBConfig:
        return KpiDBConfig(
            kpi_overrides=kpi_overrides or {},
            kpi_override_prefixes=kpi_override_prefixes or {},
            display_per_source=display_per_source or {},
        )

    def test_exact_override_takes_precedence(self) -> None:
        cfg = self._make_config(
            kpi_overrides={"flow_a__engine_approved": {"display_name": "Exact Name"}},
            kpi_override_prefixes={
                "flow_a__": {"label_format": "A {engine}"},
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_display_name("flow_a__engine_approved") == "Exact Name"

    def test_label_format_parse(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "flow_a__": {
                    "label_format": "Engine {engine} -> Athena {athena}",
                },
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            result = _get_display_name("flow_a__engine_approved__athena_refer")
        assert result == "Engine Approved -> Athena Refer"

    def test_label_format_multi_word_key(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "flow_b__": {
                    "label_format": "Athena {athena} -> Final {final} (Blocked: {blocked_origin})",
                },
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            result = _get_display_name("flow_b__athena_refer__final_decline__blocked_origin_true")
        assert result == "Athena Refer -> Final Decline (Blocked: True)"

    def test_label_format_fallback_to_static_display_name(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "flow_a__": {
                    "label_format": "Engine {engine} -> Athena {athena}",
                    "display_name": "Flow A Metric",
                },
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            # Name that doesn't parse successfully against the format
            result = _get_display_name("flow_a__malformed")
        assert result == "Flow A Metric"

    def test_fallback_to_title_case(self) -> None:
        cfg = self._make_config()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            result = _get_display_name("some_metric_name")
        assert result == "Some Metric Name"

    def test_source_override_takes_precedence(self) -> None:
        cfg = self._make_config(
            display_per_source={
                "src1": {"kpi_overrides": {"flow_a__x": {"display_name": "Source Name"}}}
            },
            kpi_override_prefixes={
                "flow_a__": {"label_format": "A {x}"},
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_display_name("flow_a__x", "src1") == "Source Name"

    def test_prefix_static_display_name_without_label_format(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "flow_a__": {"display_name": "Flow A Metric"},
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            result = _get_display_name("flow_a__anything")
        assert result == "Flow A Metric"


class TestParseDynamicDisplayName:
    def _make_config(
        self,
        kpi_override_prefixes: dict | None = None,
    ) -> KpiDBConfig:
        return KpiDBConfig(
            kpi_override_prefixes=kpi_override_prefixes or {},
        )

    def test_no_prefix_match(self) -> None:
        cfg = self._make_config()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _parse_dynamic_display_name("no_match") is None

    def test_no_label_format(self) -> None:
        cfg = self._make_config(kpi_override_prefixes={"p__": {"unit": "count"}})
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _parse_dynamic_display_name("p__x") is None

    def test_successful_parse(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "p__": {"label_format": "X {a} Y {b}"},
            }
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            result = _parse_dynamic_display_name("p__a_hello__b_world")
        assert result == "X Hello Y World"

    def test_malformed_returns_none(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "p__": {"label_format": "X {a} Y {b}"},
            }
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            # Missing key 'b' → KeyError → None
            result = _parse_dynamic_display_name("p__a_hello")
        assert result is None


# ---------------------------------------------------------------------------
# Config resolution (_get_unit, _get_polarity) with prefix fallback
# ---------------------------------------------------------------------------


class TestGetUnitWithPrefix:
    def _make_config(self, **kwargs: object) -> KpiDBConfig:
        return KpiDBConfig(**kwargs)  # type: ignore[arg-type]

    def test_exact_override_wins(self) -> None:
        cfg = self._make_config(
            kpi_overrides={"metric": {"unit": "percent"}},
            kpi_override_prefixes={"met": {"unit": "count"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_unit("metric") == "percent"

    def test_prefix_fallback(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={"flow_": {"unit": "count"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_unit("flow_x_y") == "count"

    def test_default_when_no_match(self) -> None:
        cfg = self._make_config()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_unit("unknown") == "score"

    def test_longest_prefix_wins(self) -> None:
        cfg = self._make_config(
            kpi_override_prefixes={
                "flow_": {"unit": "score"},
                "flow_a__": {"unit": "count"},
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_unit("flow_a__x") == "count"


class TestGetPolarityWithPrefix:
    def test_prefix_fallback(self) -> None:
        cfg = KpiDBConfig(
            kpi_override_prefixes={"flow_": {"polarity": "lower_better"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_polarity("flow_x") == "lower_better"

    def test_default_when_no_match(self) -> None:
        cfg = KpiDBConfig()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_polarity("unknown") == "higher_better"


class TestGetSegmentVisualOrder:
    def test_default_is_highest_top(self) -> None:
        cfg = KpiDBConfig()
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_segment_visual_order("metric") == "highest_top"

    def test_global_kpi_override(self) -> None:
        cfg = KpiDBConfig(
            kpi_overrides={"metric": {"segment_visual_order": "lowest_top"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_segment_visual_order("metric") == "lowest_top"

    def test_source_default_overrides_global_kpi(self) -> None:
        cfg = KpiDBConfig(
            kpi_overrides={"metric": {"segment_visual_order": "lowest_top"}},
            display_per_source={"athena": {"segment_visual_order": "highest_top"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_segment_visual_order("metric", "athena") == "highest_top"

    def test_source_kpi_override_has_highest_precedence(self) -> None:
        cfg = KpiDBConfig(
            display_per_source={
                "athena": {
                    "segment_visual_order": "highest_top",
                    "kpi_overrides": {"metric": {"segment_visual_order": "lowest_top"}},
                }
            },
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_segment_visual_order("metric", "athena") == "lowest_top"


class TestGetKpiSegmentComparison:
    def test_response_defaults_to_highest_top_and_stable_sql_order(self) -> None:
        cfg = KpiDBConfig()
        store = FakeStore()

        with patch("app.services.kpi_service.kpi_db_config", cfg):
            response = get_kpi_segment_comparison(
                store,  # type: ignore[arg-type]
                kpi_name="metric",
                source_name="athena",
            )

        assert response.segment_visual_order == "highest_top"
        assert [s.segment for s in response.segments] == ["tool.a", "tool.b"]
        assert store.sql is not None
        assert "ORDER BY agg_value DESC, segment ASC" in store.sql


class TestGetCardDisplayValueWithPrefix:
    def test_prefix_fallback(self) -> None:
        cfg = KpiDBConfig(
            kpi_override_prefixes={"flow_": {"card_display_value": "avg_7d"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_card_display_value("flow_x") == "avg_7d"


# ---------------------------------------------------------------------------
# Call-weighted rate KPIs
# ---------------------------------------------------------------------------


class TestParseWeightedKpis:
    def test_valid_entry(self) -> None:
        parsed = _parse_weighted_kpis(
            {"rate": {"weight_kpi": "count", "join_keys": ["dataset_id", "segment"]}}
        )
        assert parsed == {"rate": {"weight_kpi": "count", "join_keys": ["dataset_id", "segment"]}}

    def test_rejects_missing_weight_kpi(self) -> None:
        assert _parse_weighted_kpis({"rate": {"join_keys": ["dataset_id"]}}) == {}

    def test_rejects_empty_join_keys(self) -> None:
        """Without a join key the pivot collapses every row onto one pair."""
        assert _parse_weighted_kpis({"rate": {"weight_kpi": "count"}}) == {}
        assert _parse_weighted_kpis({"rate": {"weight_kpi": "count", "join_keys": []}}) == {}

    def test_strips_blank_join_keys(self) -> None:
        parsed = _parse_weighted_kpis(
            {"rate": {"weight_kpi": "count", "join_keys": [" segment ", "", None]}}
        )
        assert parsed["rate"]["join_keys"] == ["segment"]

    def test_non_dict_input(self) -> None:
        assert _parse_weighted_kpis("nope") == {}
        assert _parse_weighted_kpis({"rate": "nope"}) == {}


class TestWeightedKpiSpec:
    def test_returns_none_for_unconfigured_kpi(self) -> None:
        with patch("app.services.kpi_service.kpi_db_config", KpiDBConfig()):
            assert _weighted_kpi_spec("rate") is None

    def test_builds_spec_from_config(self) -> None:
        cfg = KpiDBConfig(
            weighted_kpis={"rate": {"weight_kpi": "count", "join_keys": ["dataset_id", "segment"]}}
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            spec = _weighted_kpi_spec("rate")
        assert spec is not None
        assert spec.weight_kpi == "count"
        assert spec.join_keys == ["dataset_id", "segment"]

    def test_rejects_non_identifier_join_key(self) -> None:
        """join_keys are interpolated into SQL, so they are validated not trusted."""
        cfg = KpiDBConfig(
            weighted_kpis={"rate": {"weight_kpi": "count", "join_keys": ["seg; DROP TABLE x"]}}
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _weighted_kpi_spec("rate") is None


def _weighted_store() -> DuckDBStore:
    """A DuckDBStore over :memory: seeded so weighted and unweighted disagree.

    tool.a is called 8x at a perfect rate and 4x at half; tool.b is called twice
    and always fails. Averaging the four rate rows gives 0.625; weighting each by
    its call count gives 10/14 -- the rate a caller actually experiences.
    """
    store = DuckDBStore.__new__(DuckDBStore)
    store._conn = duckdb.connect(":memory:")  # type: ignore[attr-defined]
    store.db_path = __file__

    import threading

    import anyio

    store._query_limiter = anyio.CapacityLimiter(8)  # type: ignore[attr-defined]
    store._cache_lock = threading.Lock()  # type: ignore[attr-defined]
    store._cached_metadata = {}  # type: ignore[attr-defined]
    store._sync_status = {}  # type: ignore[attr-defined]
    store._register_lock = threading.Lock()  # type: ignore[attr-defined]

    store._conn.execute(
        "CREATE TABLE kpi_data (created_at TIMESTAMP, source_name VARCHAR, "
        "source_type VARCHAR, kpi_name VARCHAR, kpi_category VARCHAR, "
        "dataset_id VARCHAR, numeric_value DOUBLE, source_component VARCHAR, "
        "environment VARCHAR, segment VARCHAR)"
    )
    rows = [
        ("d1", "count", 8.0, "tool.a"),
        ("d1", "rate", 1.0, "tool.a"),
        ("d1", "count", 2.0, "tool.b"),
        ("d1", "rate", 0.0, "tool.b"),
        ("d2", "count", 4.0, "tool.a"),
        ("d2", "rate", 0.5, "tool.a"),
        # segment IS NULL -- trace-grain row, must not become its own bar
        ("d1", "rate", 0.9, None),
    ]
    for dataset_id, kpi, value, segment in rows:
        store._conn.execute(
            "INSERT INTO kpi_data VALUES (now(), 'athena', 'tools', ?, "
            "'automation_usage', ?, ?, 'workflow', 'production', ?)",
            [kpi, dataset_id, value, segment],
        )
    return store


WEIGHTED_CFG = KpiDBConfig(
    weighted_kpis={"rate": {"weight_kpi": "count", "join_keys": ["dataset_id", "segment"]}}
)


class TestSegmentComparisonWeighted:
    def test_weights_each_tool_by_its_call_count(self) -> None:
        with patch("app.services.kpi_service.kpi_db_config", WEIGHTED_CFG):
            resp = get_kpi_segment_comparison(_weighted_store(), kpi_name="rate")

        assert resp.aggregation == "weighted"
        bars = {b.segment: b for b in resp.segments}
        # tool.a: (8*1.0 + 4*0.5) / (8 + 4); a plain AVG would give 0.75.
        assert bars["tool.a"].agg_value == pytest.approx(10 / 12)
        assert bars["tool.a"].count == 2
        assert bars["tool.b"].agg_value == pytest.approx(0.0)

    def test_unweighted_kpi_is_untouched(self) -> None:
        """The weighted branch is inert for a KPI with no weighted_kpis entry."""
        with patch("app.services.kpi_service.kpi_db_config", KpiDBConfig()):
            resp = get_kpi_segment_comparison(_weighted_store(), kpi_name="rate")

        assert resp.aggregation == "avg"
        bars = {b.segment: b for b in resp.segments}
        assert bars["tool.a"].agg_value == pytest.approx(0.75)  # (1.0 + 0.5) / 2

    def test_excludes_null_segment_rows(self) -> None:
        with patch("app.services.kpi_service.kpi_db_config", WEIGHTED_CFG):
            resp = get_kpi_segment_comparison(_weighted_store(), kpi_name="rate")
        assert None not in [b.segment for b in resp.segments]
        assert len(resp.segments) == 2

    def test_reports_grain_conflicts_instead_of_absorbing_them(self) -> None:
        """Two count rows on one join key: MAX() picks one, the counter says so."""
        store = _weighted_store()
        store._conn.execute(  # type: ignore[attr-defined]
            "INSERT INTO kpi_data VALUES (now(), 'athena', 'tools', 'count', "
            "'automation_usage', 'd1', 99.0, 'workflow', 'production', 'tool.a')"
        )
        with patch("app.services.kpi_service.kpi_db_config", WEIGHTED_CFG):
            resp = get_kpi_segment_comparison(store, kpi_name="rate")

        bars = {b.segment: b for b in resp.segments}
        assert bars["tool.a"].conflict_pairs == 1
        assert bars["tool.b"].conflict_pairs == 0

    def test_composes_to_the_true_overall_rate(self) -> None:
        """Per-tool weighted rate x per-tool call count == the true call-weighted rate.

        This is what lets a caller build the headline number from two existing
        endpoint calls instead of a third server-side aggregate.
        """
        store = _weighted_store()
        with patch("app.services.kpi_service.kpi_db_config", WEIGHTED_CFG):
            rates = get_kpi_segment_comparison(store, kpi_name="rate")
        with patch("app.services.kpi_service.kpi_db_config", KpiDBConfig(sum_kpi_prefixes=["cou"])):
            counts = get_kpi_segment_comparison(store, kpi_name="count")

        calls = {b.segment: b.agg_value for b in counts.segments}
        composed = sum(calls[b.segment] * b.agg_value for b in rates.segments) / sum(calls.values())
        assert composed == pytest.approx(10 / 14)
