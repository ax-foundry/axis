"""Tests for the pure incremental-sync helpers in sync_engine.

These guard the watermark lifecycle: serialization that round-trips through
the KV store, the lag-window rewind that recovers late-arriving rows, and the
periodic full-rebuild due-check.
"""

from datetime import UTC, datetime

from app.services.sync_engine import (
    _apply_watermark_lag,
    _full_rebuild_due,
    _serialize_watermark,
)

# ----------------------------------------------------------------------
# _serialize_watermark
# ----------------------------------------------------------------------


def test_serialize_watermark_datetime_matches_legacy_str_format() -> None:
    """isoformat(sep=' ') is byte-identical to str(datetime) — stored
    watermarks from older versions keep parsing the same way."""
    dt = datetime(2026, 6, 1, 12, 30, 45, 123456)
    assert _serialize_watermark(dt) == str(dt)
    assert _serialize_watermark(dt) == "2026-06-01 12:30:45.123456"


def test_serialize_watermark_round_trips_through_fromisoformat() -> None:
    dt = datetime(2026, 6, 1, 12, 30, 45)
    assert datetime.fromisoformat(_serialize_watermark(dt)) == dt


def test_serialize_watermark_tz_aware_round_trips() -> None:
    dt = datetime(2026, 6, 1, 12, 30, 45, tzinfo=UTC)
    assert datetime.fromisoformat(_serialize_watermark(dt)) == dt


def test_serialize_watermark_non_datetime_passthrough() -> None:
    assert _serialize_watermark(12345) == "12345"
    assert _serialize_watermark("abc") == "abc"


# ----------------------------------------------------------------------
# _apply_watermark_lag
# ----------------------------------------------------------------------


def test_lag_rewinds_temporal_watermark() -> None:
    assert _apply_watermark_lag("2026-06-01 12:00:00", 120) == "2026-06-01 10:00:00"


def test_lag_parses_legacy_str_datetime_format() -> None:
    """Watermarks stored by older versions via str(datetime) must parse."""
    legacy = str(datetime(2026, 6, 1, 12, 0, 0, 500000))
    assert _apply_watermark_lag(legacy, 60) == "2026-06-01 11:00:00.500000"


def test_lag_parses_iso_t_separator() -> None:
    assert _apply_watermark_lag("2026-06-01T12:00:00", 30) == "2026-06-01 11:30:00"


def test_lag_zero_or_negative_is_noop() -> None:
    assert _apply_watermark_lag("2026-06-01 12:00:00", 0) == "2026-06-01 12:00:00"
    assert _apply_watermark_lag("2026-06-01 12:00:00", -5) == "2026-06-01 12:00:00"


def test_lag_non_temporal_watermark_passthrough() -> None:
    """Numeric/sequence watermarks are returned unchanged, not mangled."""
    assert _apply_watermark_lag("not-a-date", 120) == "not-a-date"


# ----------------------------------------------------------------------
# _full_rebuild_due
# ----------------------------------------------------------------------

_NOW = datetime(2026, 6, 12, 3, 0, 0, tzinfo=UTC)


def test_rebuild_disabled_when_interval_zero() -> None:
    assert _full_rebuild_due(None, 0, _NOW) is False
    assert _full_rebuild_due("2020-01-01T00:00:00+00:00", 0, _NOW) is False


def test_rebuild_due_when_never_rebuilt() -> None:
    assert _full_rebuild_due(None, 24, _NOW) is True


def test_rebuild_due_when_interval_elapsed() -> None:
    assert _full_rebuild_due("2026-06-11T02:00:00+00:00", 24, _NOW) is True


def test_rebuild_not_due_within_interval() -> None:
    assert _full_rebuild_due("2026-06-11T09:00:00+00:00", 24, _NOW) is False


def test_rebuild_naive_timestamp_treated_as_utc() -> None:
    assert _full_rebuild_due("2026-06-11T02:00:00", 24, _NOW) is True
    assert _full_rebuild_due("2026-06-11T09:00:00", 24, _NOW) is False


def test_rebuild_unparseable_timestamp_counts_as_due() -> None:
    assert _full_rebuild_due("garbage", 24, _NOW) is True
