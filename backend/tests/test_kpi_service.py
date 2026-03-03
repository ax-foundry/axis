"""Tests for prefix-aware KPI service logic.

Covers config parsing, prefix matching, SQL generation, visibility filtering,
dynamic display name parsing, and display config resolution.
"""

from unittest.mock import patch

from app.config.db.kpi import (
    KpiDBConfig,
    _parse_kpi_override_prefixes,
    _parse_prefix_list,
)
from app.services.kpi_service import (
    SumKpiSpec,
    _build_where,
    _daily_agg_expr,
    _find_longest_matching_prefix,
    _get_card_display_value,
    _get_display_name,
    _get_polarity,
    _get_unit,
    _matches_prefix,
    _parse_dynamic_display_name,
)

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


class TestGetCardDisplayValueWithPrefix:
    def test_prefix_fallback(self) -> None:
        cfg = KpiDBConfig(
            kpi_override_prefixes={"flow_": {"card_display_value": "avg_7d"}},
        )
        with patch("app.services.kpi_service.kpi_db_config", cfg):
            assert _get_card_display_value("flow_x") == "avg_7d"
