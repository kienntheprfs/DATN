"""Database models for topic pipeline feature."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, CheckConstraint, Column, ForeignKey, Index, text
from sqlmodel import Field, SQLModel


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


class DashboardTopicPipelineJob(SQLModel, table=True):
    """Persisted metadata for one topic modeling pipeline run.

    A single job may produce multiple DashboardTopicResult rows — one per
    TopicType (missing_knowledge, popular_questions).
    """

    __tablename__ = "dashboard_topic_pipeline_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_dashboard_topic_pipeline_jobs_status",
        ),
        CheckConstraint(
            "stage IN ('pending', 'loading_input', 'modeling', 'exporting_file', 'exporting_db', 'completed')",
            name="ck_dashboard_topic_pipeline_jobs_stage",
        ),
        Index("idx_dashboard_topic_pipeline_jobs_created_at", "created_at"),
        Index("idx_dashboard_topic_pipeline_jobs_status", "status"),
        Index(
            "uq_dashboard_topic_pipeline_jobs_one_active",
            "status",
            unique=True,
            postgresql_where=text("status IN ('pending', 'running')"),
        ),
        {"schema": "dashboard"},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    time_range: str = Field(nullable=False, max_length=10)
    status: str = Field(nullable=False, max_length=20, default=JobStatus.PENDING.value)
    stage: str = Field(nullable=False, max_length=30, default=JobStage.PENDING.value)
    progress: int = Field(nullable=False, ge=0, le=100, default=0)
    message: Optional[str] = Field(default=None, max_length=500)
    error_detail: Optional[str] = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    completed_at: Optional[datetime] = Field(default=None)


class DashboardTopicResult(SQLModel, table=True):
    """Persisted summary for one topic type within a pipeline run.

    Each result stores:
    - topic_summary: {topic_id: label_str}      — human-readable labels
    - topic_keywords: {topic_id: [{term,score}]} — keyword weights
    - topic_sentiment: {topic_id: {positive,neutral}} — sentiment %
    - topic_marked: {topic_id: {pinned,knowledge_updated}} — UI pin state
    """

    __tablename__ = "dashboard_topic_results"
    __table_args__ = (
        Index(
            "idx_dashboard_topic_results_topic_type_created", "topic_type", "created_at"
        ),
        Index("idx_dashboard_topic_results_job_id", "job_id"),
        {"schema": "dashboard"},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    job_id: UUID = Field(
        sa_column=Column(
            ForeignKey(
                "dashboard.dashboard_topic_pipeline_jobs.id",
                name="fk_dashboard_topic_result_job",
                ondelete="CASCADE",
            ),
            nullable=False,
        )
    )
    topic_type: str = Field(nullable=False, max_length=50)
    time_range: str = Field(nullable=False, max_length=10)
    n_topics: int = Field(nullable=False, ge=0)
    n_documents: int = Field(nullable=False, ge=0)
    topic_summary: dict[int, str] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    topic_keywords: dict[int, list[dict[str, float | str]]] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    # Sentiment stats: {topic_id: {"positive": float, "neutral": float}}
    topic_sentiment: dict = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    # Pin/knowledge-update state per topic:
    # {topic_id: {"pinned": bool, "knowledge_updated": bool}}
    topic_marked: dict = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class DashboardTopicAssignment(SQLModel, table=True):
    """Persisted question-to-topic assignment for one pipeline run."""

    __tablename__ = "dashboard_topic_assignments"
    __table_args__ = (
        Index("idx_dashboard_topic_assignments_result_id", "result_id"),
        Index("idx_dashboard_topic_assignments_topic_id", "topic_id"),
        Index(
            "idx_dashboard_topic_assignments_result_topic",
            "result_id",
            "topic_id",
        ),
        {"schema": "dashboard"},
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    result_id: UUID = Field(
        sa_column=Column(
            ForeignKey(
                "dashboard.dashboard_topic_results.id",
                name="fk_dashboard_topic_assignment_result",
                ondelete="CASCADE",
            ),
            nullable=False,
        )
    )
    question: str = Field(nullable=False, max_length=5000)
    topic_id: int = Field(nullable=False, ge=0)
    label: Optional[str] = Field(default=None, max_length=255)
    source: str = Field(nullable=False, max_length=100)
    # Timestamp of the original question in the source system.
    # Used for accurate trend bucketing instead of the pipeline run time.
    original_created_at: Optional[datetime] = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


__all__ = [
    "DashboardTopicAssignment",
    "DashboardTopicPipelineJob",
    "DashboardTopicResult",
    "JobStage",
    "JobStatus",
    "SQLModel",
    "TimeRange",
    "TopicType",
]
