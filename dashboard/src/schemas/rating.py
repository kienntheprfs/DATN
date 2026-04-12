"""Schemas for answer rating APIs."""

from datetime import datetime
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