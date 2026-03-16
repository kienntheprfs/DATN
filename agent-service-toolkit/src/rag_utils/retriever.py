import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from qdrant_client import AsyncQdrantClient, models

from core.settings import settings
from .encoder import HybridQueryEncoder

logger = logging.getLogger(__name__)

# Định nghĩa Output Model chuẩn cho Chatbot
class RetrievedChunk(BaseModel):
    chunk_id: str
    content: str       # Nội dung trả lời
    score: float       # Độ liên quan
    doc_id: int        # ID file gốc (để trích dẫn nếu cần)
    source_type: str   # 'pdf', 'docx', etc.
    answer: Optional[str]
    metadata: Dict[str, Any]

class QdrantHybridRetriever:
    def __init__(self):
        # Kết nối độc lập tới Qdrant Cloud/Server
        self.client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            # timeout=20
        )
        self.encoder = HybridQueryEncoder()
        
        # Tên vector phải KHỚP 100% với file vector_db.py bên KM
        self.DENSE_VECTOR_NAME = "dense_vec"
        self.SPARSE_VECTOR_NAME = "sparse_vec"

    async def search(
        self,
        query: str,
        collection_name: str,  # VD: "kb_123"
        top_k: int = 5,
        score_threshold: float = 0.0,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[RetrievedChunk]:
        """
        Hàm retrieve chính:
        1. Encode query (Dense + Sparse)
        2. Gửi request RRF tới Qdrant
        3. Parse payload trả về format chuẩn
        """
        try:
            # 1. Encode câu hỏi
            query_vec = await self.encoder.encode_query(query)

            # 2. Xây dựng Filter (nếu Chatbot muốn lọc theo metadata)
            qdrant_filter = None
            if filters:
                conditions = []
                for k, v in filters.items():
                    conditions.append(
                        models.FieldCondition(key=k, match=models.MatchValue(value=v))
                    )
                if conditions:
                    qdrant_filter = models.Filter(must=conditions)

            # 3. Cấu hình Prefetch cho RRF (Reciprocal Rank Fusion)
            prefetch = [
                models.Prefetch(
                    query=query_vec["dense"],
                    using=self.DENSE_VECTOR_NAME,
                    limit=top_k * 2, # Lấy dư để fusion tốt hơn
                    filter=qdrant_filter
                ),
                models.Prefetch(
                    query=models.SparseVector(
                        indices=query_vec["sparse"]["indices"],
                        values=query_vec["sparse"]["values"]
                    ),
                    using=self.SPARSE_VECTOR_NAME,
                    limit=top_k * 2,
                    filter=qdrant_filter
                ),
            ]

            # 4. Gửi Query
            results = await self.client.query_points(
                collection_name=collection_name,
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                limit=top_k,
                score_threshold=score_threshold,
                with_payload=True # QUAN TRỌNG: Lấy nội dung text về luôn
            )

            # 5. Map kết quả sang Object chuẩn
            retrieved_data = []
            for point in results.points:
                payload = point.payload or {}
                
                # Payload này được cấu trúc trong tasks.py bên KM
                item = RetrievedChunk(
                    chunk_id=str(point.id),
                    # Bên KM lưu: "content": chunk_data["text"]
                    content=payload.get("content", ""), 
                    score=point.score,
                    # Bên KM lưu: "document_id"
                    doc_id=payload.get("document_id", 0),
                    source_type=payload.get("doc_type", "unknown"), # Nếu bạn có lưu doc_type
                    answer=payload.get("answer_preview", None),
                    metadata=payload.get("metadata", {}),
                )
                retrieved_data.append(item)

            return retrieved_data

        except Exception as e:
            logger.error(f"Retrieval failed for collection {collection_name}: {e}")
            # Tùy strategy: return rỗng hoặc raise lỗi để Chatbot handle
            return []
            
    async def close(self):
        await self.client.close()