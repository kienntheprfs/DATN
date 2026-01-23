from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

# Base: Dùng chung cho Create và Update
class StorageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tên bộ dữ liệu (Knowledge Base)")
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = Field(
        default={"chunk_size": 1000, "chunk_overlap": 200},
        description="Cấu hình RAG riêng cho storage này (JSON)"
    )

class StorageCreate(StorageBase):
    pass

class StorageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

class StorageResponse(StorageBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True