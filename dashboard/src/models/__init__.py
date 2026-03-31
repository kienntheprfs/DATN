"""Database models for dashboard service."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from sqlmodel import Field, SQLModel


DASHBOARD_SCHEMA: str = "dashboard"


class RatingValue(str, Enum):
    """Allowed rating values for AI answer feedback."""

    LIKE = "LIKE"
    DISLIKE = "DISLIKE"


class AnswerRating(SQLModel, table=True):
    """Persisted rating feedback for one user and one AI answer run."""

    __tablename__ = "dashboard_answer_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "run_id", name="uq_dashboard_user_run_rating"),
        CheckConstraint("length(comment) <= 1000", name="ck_dashboard_answer_ratings_comment_len"),
        Index("idx_dashboard_answer_ratings_user_id", "user_id"),
        Index("idx_dashboard_answer_ratings_run_id", "run_id"),
        Index("idx_dashboard_answer_ratings_thread_id", "thread_id"),
        Index("idx_dashboard_answer_ratings_agent_id", "agent_id"),
        {"schema": DASHBOARD_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: str = Field(nullable=False, max_length=36)
    run_id: str = Field(nullable=False, max_length=255)
    rating: str = Field(nullable=False, max_length=10)
    comment: Optional[str] = Field(default=None, max_length=1000)
    thread_id: str = Field(nullable=False, max_length=36)
    agent_id: Optional[str] = Field(default=None, max_length=100)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


__all__ = ["AnswerRating", "DASHBOARD_SCHEMA", "RatingValue", "SQLModel"]