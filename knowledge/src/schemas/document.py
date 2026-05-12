from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, Any
from src.models.models import DocumentStatus, ProcessingStatus, DocumentType


class DocumentResponse(BaseModel):
    id: int
    title: str
    storage_id: int
    status: DocumentStatus
    document_type: DocumentType
    file_path: str
    file_size: int
    checksum: str

    processing_status: ProcessingStatus
    processing_error: Optional[str] = None
    processing_started_at: Optional[datetime] = None
    processing_completed_at: Optional[datetime] = None

    deletion_error: Optional[str] = None
    deletion_started_at: Optional[datetime] = None
    deletion_completed_at: Optional[datetime] = None

    meta_data: Optional[dict] = None
    is_formal_doc: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentDetailResponse(DocumentResponse):
    """Same shape as list item; no separate version history."""

    pass


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[DocumentStatus] = None
    meta_data: Optional[dict] = None


class AdminDocumentListItem(BaseModel):
    id: int
    title: str
    status: Optional[DocumentStatus] = None
    code: Optional[str] = None
    summary: Optional[str] = None
    signed_date: Optional[str] = None
    unit: Optional[str] = None
    document_type: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    is_formal_doc: bool = False
    processing_status: Optional[ProcessingStatus] = None
    file_size: Optional[int] = None
    meta_data: Optional[dict[str, Any]] = None
    sync_status: Optional[str] = None
    sync_error: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AdminDocumentListResponse(BaseModel):
    items: list[AdminDocumentListItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int
