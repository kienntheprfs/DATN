"""Timezone utility functions for topic pipeline.

All time ranges are relative to GMT+7 (Asia/Ho_Chi_Minh).
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from src.core.settings import settings
from src.models.topic_pipeline import TimeRange


def _service_tz() -> ZoneInfo:
    return ZoneInfo(settings.topic_default_timezone)


def now_gmt7() -> datetime:
    """Return current datetime in GMT+7 timezone."""
    return datetime.now(_service_tz())


def to_gmt7(dt: datetime) -> datetime:
    """Convert naive or aware datetime to GMT+7."""
    tz_info = _service_tz()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz_info)
    return dt.astimezone(tz_info)


def to_utc(dt: datetime) -> datetime:
    """Convert datetime to UTC from GMT+7 if needed."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_service_tz())
    return dt.astimezone(timezone.utc)


def parse_time_range(time_range: TimeRange) -> tuple[datetime, datetime]:
    """Parse a time range enum into (from_dt, to_dt) in UTC.

    The boundaries are calculated in GMT+7, then converted to UTC.
    """
    now_local = now_gmt7()
    end_local = now_local
    start_local: datetime

    match time_range:
        case TimeRange.DAYS_1:
            start_local = now_local - timedelta(hours=24)
        case TimeRange.DAYS_7:
            start_local = now_local - timedelta(days=7)
        case TimeRange.DAYS_14:
            start_local = now_local - timedelta(days=14)
        case TimeRange.DAYS_30:
            start_local = now_local - timedelta(days=30)
        case _:
            start_local = now_local - timedelta(days=7)

    return to_utc(start_local), to_utc(end_local)
