"""Schemas for topic pipeline APIs."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.topic_pipeline import JobStage, JobStatus, TimeRange, TopicType


class JobTriggerRequest(BaseModel):
    """Payload for triggering a topic pipeline job."""

    time_range: TimeRange = TimeRange.DAYS_7


class JobTriggerResponse(BaseModel):
    """Response after triggering a job."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    time_range: TimeRange
    status: JobStatus
    stage: JobStage
    progress: int
    message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobDetailResponse(BaseModel):
    """Full job detail response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    time_range: TimeRange
    status: JobStatus
    stage: JobStage
    progress: int
    message: Optional[str] = None
    error_detail: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class TopicResultSummary(BaseModel):
    """Summary of one topic modeling run."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    topic_type: TopicType
    time_range: TimeRange
    n_topics: int
    n_documents: int
    topic_summary: dict[int, str]
    topic_keywords: dict[int, list[dict[str, float | str]]]
    created_at: datetime


class TopicQuestionItem(BaseModel):
    """A single question item for UI listing."""

    id: UUID
    question: str
    topic_id: int
    label: Optional[str] = None
    source: Optional[str] = None
    created_at: datetime


class TopicQuestionsResponse(BaseModel):
    """Paginated questions from latest result."""

    items: list[TopicQuestionItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class TopicQuestionsParams(BaseModel):
    """Query params for questions listing."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    topic_id: Optional[int] = None
    sort_by: str = Field(
        default="created_desc",
        pattern="^(created_desc|created_asc|topic_asc|topic_desc)$",
    )


# ---------------------------------------------------------------------------
# Topic list (full detail per topic for frontend cards)
# ---------------------------------------------------------------------------

class TopicSourceItem(BaseModel):
    """Contribution breakdown by source."""

    label: str
    percent: str  # e.g. "62.4%"


class TopicSentiment(BaseModel):
    """Sentiment percentages for a topic."""

    positive: float = 0.0
    neutral: float = 100.0


class TopicKeywordItem(BaseModel):
    """A single keyword with appearance-rate score."""

    term: str
    score: float


class TopicListItem(BaseModel):
    """Enriched topic item for frontend topic list / detail panels."""

    topic_id: int
    result_id: UUID
    title: str                     # human-readable label (from topic_summary)
    summary: str                   # comma-joined top 3 keywords
    queries: int                   # total documents assigned to this topic
    status: str                    # derived: new | stable | waiting
    pinned: bool
    knowledge_updated: bool
    discarded: bool = False
    evidence_document_ids: list[int] = []
    pinned_post_ids: list[str] = []
    featured_entity: str           # keyword with highest score in topic
    featured_entity_rate: float    # occurrence rate % of the featured entity
    confidence: float              # avg score of top keyword (proxy for cluster quality)
    sync_ago: str                  # human-readable relative time of result
    tags: list[str]                # top keyword terms
    sources: list[TopicSourceItem]
    sentiment: TopicSentiment
    created_at: datetime           # result created_at


class TopicListResponse(BaseModel):
    """Response for topic list endpoint."""

    result_id: UUID
    topic_type: str
    time_range: str
    total_topics: int
    total_documents: int
    items: list[TopicListItem]
    created_at: datetime


# ---------------------------------------------------------------------------
# Pin / knowledge update
# ---------------------------------------------------------------------------

class TopicPinRequest(BaseModel):
    """Payload for updating pin / knowledge state."""

    pinned: Optional[bool] = None
    knowledge_updated: Optional[bool] = None
    discarded: Optional[bool] = None
    evidence_document_ids: Optional[list[int]] = None
    pinned_post_ids: Optional[list[str]] = None


class TopicPinResponse(BaseModel):
    """Response after pin / knowledge update."""

    result_id: UUID
    topic_id: int
    pinned: bool
    knowledge_updated: bool
    discarded: bool
    evidence_document_ids: list[int] = []
    pinned_post_ids: list[str] = []


# ---------------------------------------------------------------------------
# Trend data
# ---------------------------------------------------------------------------

class TrendDataPoint(BaseModel):
    """Single data point in a trend series."""

    period: str    # ISO date string (day/week/month truncated)
    count: int


class TopicTrendResponse(BaseModel):
    """Trend data for a topic."""

    topic_id: int
    result_id: UUID
    topic_type: str
    view: str                     # day | week | month
    data: list[TrendDataPoint]


# ---------------------------------------------------------------------------
# Keywords
# ---------------------------------------------------------------------------

class TopicKeywordsResponse(BaseModel):
    """Keywords for a specific topic."""

    topic_id: int
    result_id: UUID
    keywords: list[TopicKeywordItem]
