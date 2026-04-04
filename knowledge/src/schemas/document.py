from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional
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
    meta_data: Optional[dict] = None
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
