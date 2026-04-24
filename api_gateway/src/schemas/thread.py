from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

# Request/Response Schemas (DTOs following SOLID)
class ThreadCreateRequest(BaseModel):
    """Request schema for creating a thread."""
    agent_id: Optional[str] = Field(None, max_length=100, description="Agent identifier")
    title: Optional[str] = Field(None, max_length=255, description="Thread title")


class ThreadUpdateRequest(BaseModel):
    """Request schema for updating a thread."""
    title: Optional[str] = Field(None, max_length=255, description="New thread title")
    agent_id: Optional[str] = Field(None, max_length=100, description="New agent identifier")


class ThreadResponse(BaseModel):
    """Response schema for thread data."""
    id: str
    user_id: str
    agent_id: Optional[str]
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ThreadListResponse(BaseModel):
    """Response schema for paginated thread list."""
    threads: List[ThreadResponse]
    total: int
    limit: int
    offset: int