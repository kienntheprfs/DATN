from __future__ import annotations

import asyncio
import logging
from typing import Optional, List

import httpx
from pydantic import BaseModel

from core.settings import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------
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
    rerank_score: Optional[float] = None


class LightRAGResult(BaseModel):
    chunks: List[LightRAGChunk] = []
    entities: List[LightRAGEntity] = []
    relationships: List[LightRAGRelationship] = []


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class LightRAGService:
    """
    HTTP client wrapper cho LightRAG server.

    Tối ưu P0:
    - Persistent httpx.AsyncClient với connection pool (tái sử dụng TCP connection,
      tránh TLS handshake mỗi request → tiết kiệm 200–500ms).
    - Timeout cụ thể cho từng phase (connect / read) thay vì 120s chung chung.
    - only_need_context=True: bỏ qua bước LLM synthesis phía LightRAG server,
      chỉ lấy raw context → nhanh hơn đáng kể (LLM call bị loại bỏ phía server).
    """

    # Timeouts (giây) — có thể override qua settings nếu cần
    CONNECT_TIMEOUT: float = 3.0
    READ_TIMEOUT: float = 15.0   # Down từ 120s; nếu server chậm hơn → tăng lên 20–25s
    WRITE_TIMEOUT: float = 5.0
    POOL_TIMEOUT: float = 3.0

    # Connection pool
    MAX_KEEPALIVE: int = 5
    MAX_CONNECTIONS: int = 10

    def __init__(self):
        self.base_url = (settings.LIGHTRAG_BASE_URL or "").rstrip("/")
        self.api_key = settings.LIGHTRAG_API_KEY
        self.query_data_path = settings.LIGHTRAG_QUERY_PATH or "/query/data"

        # Persistent client — khởi tạo lazy (tạo khi cần, tái sử dụng mãi)
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Trả về persistent client, tạo mới nếu chưa có hoặc đã bị đóng."""
        if self._client is None or self._client.is_closed:
            logger.info("LightRAGService: khởi tạo persistent httpx.AsyncClient mới")
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=self.CONNECT_TIMEOUT,
                    read=self.READ_TIMEOUT,
                    write=self.WRITE_TIMEOUT,
                    pool=self.POOL_TIMEOUT,
                ),
                limits=httpx.Limits(
                    max_keepalive_connections=self.MAX_KEEPALIVE,
                    max_connections=self.MAX_CONNECTIONS,
                    keepalive_expiry=30.0,
                ),
            )
        return self._client

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def query_data(
        self,
        query: str,
        mode: str = "naive",
        chunk_top_k: int = 5,
        only_need_context: bool = True,
        naive_query_embedding: List[float] = None,
    ) -> LightRAGResult:
        """
        Truy vấn LightRAG server và trả về Chunks, Entities, Relationships.

        Args:
            query:              Câu hỏi tìm kiếm.
            mode:               "naive" | "local" | "global" | "hybrid" | "mix".
            chunk_top_k:        Số chunks trả về tối đa.
            only_need_context:  True → server chỉ trả raw context, bỏ qua LLM synthesis.
                                Đây là tham số quan trọng nhất để giảm latency phía server.
        """
        if not self.base_url:
            return LightRAGResult()

        url = f"{self.base_url}{self.query_data_path}"
        payload = {
            "query": query,
            "mode": mode,
            "top_k": chunk_top_k,
            "only_need_context": only_need_context,
            "naive_query_embedding": naive_query_embedding
        }

        client = self._get_client()
        try:
            response = await client.post(url, json=payload, headers=self._headers())
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

            logger.warning("LightRAG returned non-success status: %s", result_json.get("status"))
            return LightRAGResult()

        except httpx.ConnectTimeout:
            logger.warning(
                "LightRAG connect timeout (%.1fs) — trả về rỗng", self.CONNECT_TIMEOUT
            )
            return LightRAGResult()
        except httpx.ReadTimeout:
            logger.warning(
                "LightRAG read timeout (%.1fs) — trả về rỗng", self.READ_TIMEOUT
            )
            return LightRAGResult()
        except httpx.HTTPStatusError as e:
            logger.error("LightRAG HTTP error: %s", e)
            return LightRAGResult()
        except Exception as e:
            logger.exception("LightRAG Query Error: %s", e)
            return LightRAGResult()

    async def close(self):
        """Đóng client khi shutdown app (gọi trong lifespan handler)."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            logger.info("LightRAGService: đã đóng httpx.AsyncClient")
