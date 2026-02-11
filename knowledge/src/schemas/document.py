from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import List, Optional, Any
from src.models.models import DocumentStatus, ProcessingStatus, DocumentType

# --- Base Schemas ---
class DocumentBase(BaseModel):
    title: str
    storage_id: int

# --- Response Schemas ---
class DocumentVersionResponse(BaseModel):
    id: int
    version: int
    document_type: DocumentType
    file_path: str
    file_size: int
    processing_status: ProcessingStatus
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class DocumentResponse(BaseModel):
    id: int
    title: str
    storage_id: int
    status: DocumentStatus
    created_at: datetime
    updated_at: datetime
    # Trả về version mới nhất để UI hiển thị trạng thái xử lý
    latest_version: Optional[DocumentVersionResponse] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentDetailResponse(DocumentResponse):
    """Chi tiết document bao gồm lịch sử các version"""
    versions: List[DocumentVersionResponse] = []

# --- Update Schema ---
class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[DocumentStatus] = None
    # Có thể mở rộng thêm description hoặc tags ở đây