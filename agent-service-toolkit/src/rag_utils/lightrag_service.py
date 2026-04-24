from __future__ import annotations

from typing import Any, Optional, List, Dict
import logging
import httpx
from pydantic import BaseModel

from core.settings import settings

logger = logging.getLogger(__name__)


# --- Các model Pydantic để hứng dữ liệu ---
class LightRAGEntity(BaseModel):
    entity_name: str
    entity_type: str
    description: str
    source_id: Optional[str] = None


class LightRAGRelationship(BaseModel):
    src_id: str
    tgt_id: str
    description: str
    source_id: Optional[str] = None


class LightRAGChunk(BaseModel):
    chunk_id: str
    content: str
    file_path: Optional[str] = "Unknown"
    score: float = 1.0


class LightRAGResult(BaseModel):
    chunks: List[LightRAGChunk] = []
    entities: List[LightRAGEntity] = []
    relationships: List[LightRAGRelationship] = []


class LightRAGService:
    def __init__(self):
        self.base_url = (settings.LIGHTRAG_BASE_URL or "").rstrip("/")
        self.api_key = settings.LIGHTRAG_API_KEY
        self.query_data_path = settings.LIGHTRAG_QUERY_PATH or "/query/data"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def query_data(
        self, query: str, mode: str = "hybrid", chunk_top_k: int = 5
    ) -> LightRAGResult:
        """Trả về toàn bộ Chunks, Entities và Relationships"""
        if not self.base_url:
            return LightRAGResult()

        url = f"{self.base_url}{self.query_data_path}"
        payload = {"query": query, "mode": mode, "top_k": chunk_top_k}

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    url, json=payload, headers=self._headers(), timeout=120.0
                )
                response.raise_for_status()
                result_json = response.json()

                if result_json.get("status") == "success":
                    data = result_json.get("data", {})

                    return LightRAGResult(
                        chunks=[LightRAGChunk(**c) for c in data.get("chunks", [])],
                        entities=[LightRAGEntity(**e) for e in data.get("entities", [])],
                        relationships=[
                            LightRAGRelationship(**r) for r in data.get("relationships", [])
                        ],
                    )
                return LightRAGResult()
            except Exception as e:
                logger.exception(f"LightRAG Query Error: {e}")
                return LightRAGResult()
