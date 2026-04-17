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
    content: str  # Nội dung trả lời
    score: float  # Độ liên quan
    doc_id: int | str  # ID file gốc (để trích dẫn nếu cần)
    source_type: str  # 'pdf', 'docx', etc.
    answer: Optional[str] = None
    metadata: Dict[str, Any] = {}
    faq_id: Optional[int | str] = None
    faq_source: Optional[str] = None


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
        filters: Optional[Dict[str, Any]] = None,
        precomputed_query_vec: Optional[Dict[str, Any]] = None,
    ) -> List[RetrievedChunk]:
        """
        Hàm retrieve chính:
        1. Encode query (Dense + Sparse)
        2. Gửi request RRF tới Qdrant
        3. Parse payload trả về format chuẩn
        """
        try:
            # 1. Encode câu hỏi (hoặc tái sử dụng vector đã encode sẵn)
            query_vec = precomputed_query_vec or await self.encoder.encode_query(query)

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
                    limit=top_k * 2,  # Lấy dư để fusion tốt hơn
                    filter=qdrant_filter,
                ),
                models.Prefetch(
                    query=models.SparseVector(
                        indices=query_vec["sparse"]["indices"], values=query_vec["sparse"]["values"]
                    ),
                    using=self.SPARSE_VECTOR_NAME,
                    limit=top_k * 2,
                    filter=qdrant_filter,
                ),
            ]

            # 4. Gửi Query
            results = await self.client.query_points(
                collection_name=collection_name,
                prefetch=prefetch,
                query=models.FusionQuery(fusion=models.Fusion.RRF),
                limit=top_k,
                score_threshold=score_threshold,
                with_payload=True,  # QUAN TRỌNG: Lấy nội dung text về luôn
            )

            # 5. Map kết quả sang Object chuẩn
            retrieved_data = []
            for point in results.points:
                payload = point.payload or {}

                # Payload do KM ghi: doc_id, content, chunk_index, type, metadata (tasks.py / celery process_batch)
                item = RetrievedChunk(
                    chunk_id=str(point.id),
                    content=payload.get("content", ""),
                    score=point.score,
                    # KM upsert dùng key "doc_id"; "document_id" chỉ để tương thích point cũ (nếu có)
                    doc_id=payload.get("doc_id", payload.get("document_id", 0)),
                    source_type=payload.get("doc_type", "unknown"),  # Nếu bạn có lưu doc_type
                    answer=payload.get("answer_preview", None),
                    metadata=payload.get("metadata", {}),
                )
                retrieved_data.append(item)

            return retrieved_data

        except Exception as e:
            logger.error(f"Retrieval failed for collection {collection_name}: {e}")
            # Tùy strategy: return rỗng hoặc raise lỗi để Chatbot handle
            return []

    async def search_dense_only(
        self,
        query: str,
        collection_name: str,
        top_k: int = 3,
        score_threshold: float = 0.65,
        filters: Optional[Dict[str, Any]] = None,
        precomputed_dense_vec: Optional[List[float]] = None,
    ) -> List[RetrievedChunk]:
        """
        Search chỉ dùng DENSE vector (không RRF fusion).
        Phù hợp cho FAQ vì cần semantic similarity thuần túy, không bị "bình quân hóa" bởi sparse.
        """
        try:
            # 1. Encode dense vector (hoặc tái sử dụng)
            if precomputed_dense_vec is None:
                query_vec = await self.encoder.encode_query(query)
                precomputed_dense_vec = query_vec["dense"]

            # 2. Xây dựng Filter
            qdrant_filter = None
            if filters:
                conditions = []
                for k, v in filters.items():
                    conditions.append(
                        models.FieldCondition(key=k, match=models.MatchValue(value=v))
                    )
                if conditions:
                    qdrant_filter = models.Filter(must=conditions)

            # 3. Search với dense vector thuần túy bằng query_points
            results = await self.client.query_points(
                collection_name=collection_name,
                query=precomputed_dense_vec,
                using=self.DENSE_VECTOR_NAME,
                limit=top_k,
                score_threshold=score_threshold,
                query_filter=qdrant_filter,
                with_payload=True,
            )

            # 4. Map kết quả
            retrieved_data = []
            # Thêm .points vì query_points trả về đối tượng QueryResponse thay vì List trực tiếp
            for point in results.points:
                payload = point.payload or {}

                # faq_source có thể ở root payload hoặc trong metadata
                raw_metadata = payload.get("metadata", {})
                faq_source = payload.get("faq_source") or raw_metadata.get("faq_source")

                logger.debug(
                    f"FAQ payload debug: chunk_id={point.id}, payload_keys={list(payload.keys())}, "
                    f"faq_source={faq_source}, metadata={raw_metadata}"
                )

                item = RetrievedChunk(
                    chunk_id=str(point.id),
                    content=payload.get("content", ""),
                    score=point.score,
                    doc_id=payload.get("doc_id", payload.get("document_id", 0)),
                    faq_id=payload.get("faq_id", None),
                    source_type=payload.get("doc_type", "faq"),
                    answer=payload.get("answer", payload.get("answer_preview", None)),
                    metadata=raw_metadata,
                    faq_source=faq_source,
                )
                retrieved_data.append(item)

            logger.info(
                f"dense_only_search collection={collection_name} query={query[:50]} "
                f"results={len(retrieved_data)} top_score={retrieved_data[0].score if retrieved_data else 'N/A'}"
            )
            return retrieved_data

        except Exception as e:
            logger.error(f"Dense-only search failed for {collection_name}: {e}")
            return []

    async def close(self):
        await self.client.close()
