"""Tests for timezone utility functions."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from src.models.topic_pipeline import TimeRange
from src.services.timezone_utils import now_gmt7, parse_time_range, to_gmt7, to_utc


def test_now_gmt7_returns_gmt7_time() -> None:
    result = now_gmt7()
    assert result.tzinfo == ZoneInfo("Asia/Ho_Chi_Minh")


def test_parse_time_range_24h() -> None:
    start, end = parse_time_range(TimeRange.DAYS_1)
    assert start.tzinfo == timezone.utc
    assert end.tzinfo == timezone.utc
    delta = end - start
    assert 86395 <= delta.total_seconds() <= 86405


def test_parse_time_range_7d() -> None:
    start, end = parse_time_range(TimeRange.DAYS_7)
    delta = end - start
    assert 7 * 86400 - 5 <= delta.total_seconds() <= 7 * 86400 + 5


def test_to_gmt7_converts_naive_to_aware() -> None:
    naive = datetime(2026, 4, 22, 12, 0, 0)
    result = to_gmt7(naive)
    assert result.tzinfo is not None


def test_to_utc_converts_from_gmt7_to_utc() -> None:
    gmt7 = datetime(2026, 4, 22, 12, 0, 0, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
    result = to_utc(gmt7)
    assert result.tzinfo == timezone.utc
    assert result.hour == 5
