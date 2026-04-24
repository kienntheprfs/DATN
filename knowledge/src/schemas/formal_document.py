from datetime import datetime
from typing import Optional, Any, Dict, List

from pydantic import BaseModel, ConfigDict

class FormalDocumentResponse(BaseModel):
    id: int
    storage_id: int
    file_path: str
    lightrag_track_id: str
    lightrag_doc_id: Optional[str] = None
    # LightRAG is the source of truth for processing status; we surface it in response only.
    lightrag_status_summary: Optional[Dict[str, int]] = None
    lightrag_documents: Optional[List[Dict[str, Any]]] = None
    lightrag_total_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FormalDocumentUpdate(BaseModel):
    file_path: Optional[str] = None

