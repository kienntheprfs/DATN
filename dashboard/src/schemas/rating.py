"""Schemas for answer rating APIs."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.models import RatingValue


class RatingCreate(BaseModel):
    """Payload for creating or updating a rating by run id."""

    run_id: UUID
    rating: RatingValue
    comment: Optional[str] = Field(default=None, max_length=1000)
    thread_id: str = Field(min_length=1, max_length=36)
    agent_id: Optional[str] = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_comment_rule(self) -> "RatingCreate":
        """Allow comments only for DISLIKE ratings."""
        if self.rating != RatingValue.DISLIKE and self.comment:
            raise ValueError("comment is only allowed when rating is DISLIKE")
        return self


class RatingUpdate(BaseModel):
    """Payload for updating only mutable rating fields."""

    rating: RatingValue
    comment: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_comment_rule(self) -> "RatingUpdate":
        """Allow comments only for DISLIKE ratings."""
        if self.rating != RatingValue.DISLIKE and self.comment:
            raise ValueError("comment is only allowed when rating is DISLIKE")
        return self


class RatingResponse(BaseModel):
    """Rating API response model."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    run_id: str
    rating: RatingValue
    comment: Optional[str]
    thread_id: str
    agent_id: Optional[str]
    created_at: datetime
    updated_at: datetime


class RatingStats(BaseModel):
    """Aggregate rating statistics for one agent."""

    total: int
    like_count: int
    dislike_count: int
    like_percentage: float


class RatingAdminListParams(BaseModel):
    """Query params used by admin list endpoint."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=100)
    search: Optional[str] = Field(default=None, max_length=255)
    rating: Optional[RatingValue] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    sort_by: str = Field(default="created_desc")


class RatingAdminListItem(BaseModel):
    """A single rating item for the admin table."""

    id: UUID
    user_id: str
    user_name: Optional[str] = None
    run_id: str
    thread_id: str
    thread_name: Optional[str] = None
    agent_id: Optional[str]
    rating: RatingValue
    comment: Optional[str]
    question: str
    answer: str
    created_at: datetime
    updated_at: datetime


class RatingAdminListResponse(BaseModel):
    """Paginated response for admin rating list."""

    items: list[RatingAdminListItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class DailyRatingStat(BaseModel):
    """Daily aggregated count of likes/dislikes."""

    date: date
    like_count: int
    dislike_count: int


class DislikeReasonStat(BaseModel):
    """Aggregate count for a single dislike reason tag."""

    reason: str
    count: int


class RatingAdminStatsResponse(BaseModel):
    """Overall, daily, and reason-based rating statistics for the admin dashboard."""

    total: int
    like_count: int
    dislike_count: int
    like_percentage: float
    daily_stats: list[DailyRatingStat]
    dislike_reasons: list[DislikeReasonStat]