import logging
import httpx
from abc import ABC, abstractmethod
from typing import List

from core.settings import settings
from .retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# ==========================================
# 1. ABSTRACT BASE CLASS (INTERFACE)
# ==========================================
class BaseReranker(ABC):
    """
    Interface chuẩn cho tất cả các Reranker.
    Agent chỉ cần biết đến class này, không cần biết bên dưới dùng Jina, Cohere hay Local.
    """
    
    @abstractmethod
    async def rerank(
        self, 
        query: str, 
        documents: List[RetrievedChunk], 
        top_n: int = 5
    ) -> List[RetrievedChunk]:
        """
        Input: Câu hỏi (query) và danh sách tài liệu ban đầu (documents).
        Output: Danh sách tài liệu đã được sắp xếp lại, cắt theo top_n và cập nhật score.
        """
        pass

# ==========================================
# 2. IMPLEMENTATION CHO JINA AI
# ==========================================
class JinaReranker(BaseReranker):
    def __init__(self):
        self.api_key = settings.JINA_API_KEY
        self.url = settings.JINA_API_URL

    async def rerank(
        self, 
        query: str, 
        documents: List[RetrievedChunk], 
        top_n: int = 5
    ) -> List[RetrievedChunk]:
        
        if not documents:
            return []

        # Chuẩn bị payload
        doc_contents = [doc.content for doc in documents]
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        data = {
            "model": "jina-reranker-v3",
            "query": query,
            "top_n": top_n,
            "documents": doc_contents,
            "return_documents": False
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.url, headers=headers, json=data, timeout=15.0)
                response.raise_for_status()
                result = response.json()

                reranked_results = []
                
                # Map kết quả trả về với object RetrievedChunk ban đầu
                for item in result.get("results", []):
                    original_idx = item["index"]
                    new_score = item["relevance_score"]
                    
                    original_doc = documents[original_idx]
                    original_doc.score = new_score  # Update với score uy tín hơn từ Reranker
                    reranked_results.append(original_doc)

                return reranked_results

            except Exception as e:
                logger.error(f"Jina Reranking failed: {e}")
                # Fallback: Trả về kết quả ban đầu nếu gọi API lỗi (cắt theo top_n)
                return documents[:top_n]