import asyncio
import logging
import httpx
import torch
import torch.nn.functional as F
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
    Agent chỉ cần biết đến class này, không cần biết bên dưới dùng Jina, BGE hay Local.
    """

    @abstractmethod
    async def rerank(
        self,
        query: str,
        documents: List,
        top_n: int = 5,
    ) -> List:
        """
        Input: Câu hỏi (query) và danh sách tài liệu.
        Output: Danh sách tài liệu đã được sắp xếp lại, cắt theo top_n và cập nhật score.
        """
        pass


# ==========================================
# 2. JINA AI RERANKER (API — Cloud)
# ==========================================
class JinaReranker(BaseReranker):
    def __init__(self):
        if not settings.JINA_API_URL:
            raise ValueError("JINA_API_URL chưa được cấu hình trong settings/.env")
        if not settings.JINA_API_KEY:
            raise ValueError("JINA_API_KEY chưa được cấu hình trong settings/.env")
        self.url: str = settings.JINA_API_URL
        self.api_key: str = settings.JINA_API_KEY
        # Persistent client — tái sử dụng TCP connection
        self._client = httpx.AsyncClient(timeout=15.0)

    async def rerank(self, query: str, documents: List, top_n: int = 5) -> List:
        if not documents:
            return []

        doc_contents = [doc.content for doc in documents]
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        data = {
            "model": "jina-reranker-v3",
            "query": query,
            "top_n": top_n,
            "documents": doc_contents,
            "return_documents": False,
        }

        try:
            response = await self._client.post(self.url, headers=headers, json=data)
            response.raise_for_status()
            result = response.json()

            reranked_results = []
            for item in result.get("results", []):
                original_doc = documents[item["index"]]
                original_doc.score = item["relevance_score"]
                reranked_results.append(original_doc)

            return reranked_results

        except Exception as e:
            logger.error("Jina Reranking failed: %s — falling back to original order", e)
            return documents[:top_n]


# ==========================================
# 3. BGE RERANKER (Local — BAAI/bge-reranker-v2-m3)
# ==========================================
class BGEReranker(BaseReranker):
    """
    Reranker chạy hoàn toàn local bằng FlagEmbedding.
    Không cần API key, không có network latency.
    Tốc độ: ~150–350ms cho 15 docs trên CPU (so với Jina ~1.5s).

    Cài đặt: pip install FlagEmbedding
    Model sẽ tự download về ~/.cache/huggingface khi khởi động lần đầu.
    """

    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy load — chỉ load khi lần đầu gọi rerank."""
        if self._model is None:
            try:
                from transformers import AutoTokenizer, AutoModelForSequenceClassification
                model_name = "BAAI/bge-reranker-v2-m3"
                logger.info("Loading BGE reranker model: %s ...", model_name)
                self._tokenizer = AutoTokenizer.from_pretrained(model_name)
                self._model = AutoModelForSequenceClassification.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                )
                self._device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model.to(self._device)
                self._model.eval()
                logger.info("BGE reranker loaded successfully on %s.", self._device)
            except ImportError:
                raise ImportError(
                    "transformers chưa được cài đặt. Chạy: pip install transformers torch"
                )

    def _compute_scores_sync(self, pairs: List[List[str]]) -> List[float]:
        """Chạy sync inference — sẽ được wrap bằng to_thread."""
        self._load_model()
        # Tokenize theo batch, tránh gọi prepare_for_model trực tiếp
        inputs = self._tokenizer(
            [p[0] for p in pairs],
            [p[1] for p in pairs],
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(self._device)

        with torch.no_grad():
            logits = self._model(**inputs).logits.squeeze(-1)  # shape: (N,)

        # Normalize về [0, 1] bằng sigmoid
        scores: List[float] = torch.sigmoid(logits).cpu().tolist()
        if isinstance(scores, float):
            scores = [scores]
        return scores

    async def rerank(self, query: str, documents: List, top_n: int = 5) -> List:
        if not documents:
            return []

        # Tạo danh sách [query, doc_content] pairs
        pairs = [[query, doc.content] for doc in documents]

        try:
            # Chạy CPU-bound inference trong thread riêng — không block event loop
            scores: List[float] = await asyncio.to_thread(
                self._compute_scores_sync, pairs
            )

            # Gắn score mới vào từng document
            scored = list(zip(scores, documents))
            scored.sort(key=lambda x: x[0], reverse=True)

            result = []
            for score, doc in scored[:top_n]:
                doc.score = score
                result.append(doc)

            return result

        except Exception as e:
            logger.error("BGE Reranking failed: %s — falling back to original order", e)
            return documents[:top_n]


# ==========================================
# 4. FACTORY — chọn backend qua settings
# ==========================================
def get_reranker() -> BaseReranker:
    """
    Khởi tạo reranker dựa theo settings.RERANKER_BACKEND:
      - "bge"  → BGEReranker (local, không cần API key) — RECOMMENDED
      - "jina" → JinaReranker (cloud API)
    """
    backend = getattr(settings, "RERANKER_BACKEND", "jina").lower()
    if backend == "bge":
        logger.info("Reranker backend: BGE (local BAAI/bge-reranker-v2-m3)")
        return BGEReranker()
    else:
        logger.info("Reranker backend: Jina AI (cloud API)")
        return JinaReranker()