"""Schemas for admin pinned post APIs."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from src.models import PinnedPostCategory


class PinnedPostBasePayload(BaseModel):
    """Common payload fields for create and update operations."""

    title: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=5000)
    document_type: str = Field(min_length=1, max_length=150)
    source_url: str = Field(min_length=1, max_length=2048)
    category: PinnedPostCategory = PinnedPostCategory.ACADEMIC_REGULATION
    tags: list[str] = Field(default_factory=list, max_length=20)


class PinnedPostCreate(PinnedPostBasePayload):
    """Payload for creating a pinned post."""


class PinnedPostUpdate(PinnedPostBasePayload):
    """Payload for updating a pinned post."""


class PinnedPostAdminListParams(BaseModel):
    """Query params for admin pinned post list endpoint."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=4, ge=1, le=100)
    search: str | None = Field(default=None, max_length=255)
    category: PinnedPostCategory | None = None
    sort_by: str = Field(default="latest")


class PinnedPostResponse(BaseModel):
    """Pinned post item response."""

    id: UUID
    order: int
    title: str
    ref_id: str
    category: PinnedPostCategory
    pinned_date: date
    summary: str
    source_url: str
    document_type: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class PinnedPostStats(BaseModel):
    """Summary cards data for pinned post admin page."""

    total_pins: int
    active_slots: int
    max_slots: int
    top_category: PinnedPostCategory | None
    last_updated_date: date | None


class PinnedPostAdminListResponse(BaseModel):
    """Paginated admin response for pinned posts."""

    items: list[PinnedPostResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    stats: PinnedPostStats


class PinnedPostPublicListResponse(BaseModel):
    """Public response for pinned posts shown on the main user page."""

    items: list[PinnedPostResponse]
    total_items: int


class PinnedPostReorderPayload(BaseModel):
    """Ordered list of pinned post ids for manual sorting."""

    ordered_post_ids: list[UUID] = Field(min_length=1)


class PinnedPostReorderResponse(BaseModel):
    """Response returned after successful manual reorder."""

    items: list[PinnedPostResponse]
