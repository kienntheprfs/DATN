from datetime import datetime
from typing import Optional, Any, Dict, List

from pydantic import BaseModel, ConfigDict


class FormalDocumentResponse(BaseModel):
    """Response schema for a FormalDocument.

    A formal document is indexed in two places:
    - LightRAG (graph/entity-aware retrieval) — status surfaced via
      ``lightrag_status_summary`` and ``lightrag_documents``.
    - Qdrant / internal pipeline — status surfaced via
      ``qdrant_processing_status`` (maps to the linked Document's
      ``processing_status`` field).
    """

    id: int  # = document_id (set manually in _build_formal_response)
    storage_id: int  # from doc.document.storage_id
    file_path: str  # from doc.document.file_path
    lightrag_track_id: str
    lightrag_doc_id: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = None  # from doc.document.meta_data

    # PK của FormalDocument (= FK đến Document = Document.id)
    document_id: Optional[int] = None
    # Processing status từ linked Document (pending/processing/completed/failed)
    qdrant_processing_status: Optional[str] = None

    # --- LightRAG sync status ---
    sync_status: str = "pending"
    sync_error: Optional[str] = None
    last_synced_at: Optional[datetime] = None

    # --- LightRAG remote status ---
    lightrag_status_summary: Optional[Dict[str, int]] = None
    lightrag_documents: Optional[List[Dict[str, Any]]] = None
    lightrag_total_count: Optional[int] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FormalDocumentUpdate(BaseModel):
    file_path: Optional[str] = None
    meta_data: Optional[Dict[str, Any]] = None
