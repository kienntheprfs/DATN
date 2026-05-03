"""Database models for dashboard service."""

from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlmodel import Field, SQLModel


DASHBOARD_SCHEMA: str = "dashboard"


class RatingValue(str, Enum):
    """Allowed rating values for AI answer feedback."""

    LIKE = "LIKE"
    DISLIKE = "DISLIKE"


class JobStatus(str, Enum):
    """Lifecycle states for a topic pipeline job."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobStage(str, Enum):
    """Execution stages for a topic pipeline job."""

    PENDING = "pending"
    LOADING_INPUT = "loading_input"
    MODELING = "modeling"
    EXPORTING_FILE = "exporting_file"
    EXPORTING_DB = "exporting_db"
    COMPLETED = "completed"


class TopicType(str, Enum):
    """Supported input types for topic modeling."""

    MISSING_KNOWLEDGE = "missing_knowledge"
    POPULAR_QUESTIONS = "popular_questions"


class TimeRange(str, Enum):
    """Supported time range filters (GMT+7)."""

    DAYS_1 = "24h"
    DAYS_7 = "7d"
    DAYS_14 = "14d"
    DAYS_30 = "30d"


class AnswerRating(SQLModel, table=True):
    """Persisted rating feedback for one user and one AI answer run."""

    __tablename__ = "dashboard_answer_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "run_id", name="uq_dashboard_user_run_rating"),
        CheckConstraint(
            "length(comment) <= 1000", name="ck_dashboard_answer_ratings_comment_len"
        ),
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


class PinnedPostCategory(str, Enum):
    """Allowed categories for dashboard pinned posts."""

    ACADEMIC_REGULATION = "Quy chế Đào tạo"
    POSTGRADUATE = "Sau Đại học"
    STUDENT_AFFAIRS = "Công tác Sinh viên"
    SCIENTIFIC_RESEARCH = "Nghiên cứu Khoa học"


class DashboardPinnedPost(SQLModel, table=True):
    """Persisted pinned post metadata for admin content curation."""

    __tablename__ = "dashboard_pinned_posts"
    __table_args__ = (
        UniqueConstraint("ref_id", name="uq_dashboard_pinned_posts_ref_id"),
        UniqueConstraint(
            "display_order", name="uq_dashboard_pinned_posts_display_order"
        ),
        CheckConstraint(
            "length(title) >= 1", name="ck_dashboard_pinned_posts_title_not_blank"
        ),
        CheckConstraint(
            "length(summary) >= 1", name="ck_dashboard_pinned_posts_summary_not_blank"
        ),
        Index("idx_dashboard_pinned_posts_category", "category"),
        Index("idx_dashboard_pinned_posts_pinned_date", "pinned_date"),
        Index("idx_dashboard_pinned_posts_updated_at", "updated_at"),
        {"schema": DASHBOARD_SCHEMA},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    display_order: int = Field(nullable=False, ge=1)
    title: str = Field(nullable=False, max_length=255)
    ref_id: str = Field(nullable=False, max_length=50)
    category: str = Field(nullable=False, max_length=100)
    pinned_date: date = Field(nullable=False)
    summary: str = Field(nullable=False, max_length=5000)
    source_url: str = Field(nullable=False, max_length=2048)
    document_type: str = Field(nullable=False, max_length=150)
    tags: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    created_by: str = Field(nullable=False, max_length=64)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


from src.models.topic_pipeline import (  # noqa: E402
    DashboardTopicAssignment,
    DashboardTopicPipelineJob,
    DashboardTopicResult,
)


__all__ = [
    "AnswerRating",
    "DashboardPinnedPost",
    "DashboardTopicAssignment",
    "DashboardTopicPipelineJob",
    "DashboardTopicResult",
    "DASHBOARD_SCHEMA",
    "JobStage",
    "JobStatus",
    "PinnedPostCategory",
    "RatingValue",
    "SQLModel",
    "TimeRange",
    "TopicType",
]

