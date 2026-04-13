import asyncio
from typing import Dict, Any
from langchain_openai import AzureOpenAIEmbeddings
from fastembed import SparseTextEmbedding
# Giả sử bạn có file config riêng cho chatbot
from core.settings import settings 

class HybridQueryEncoder:
    """
    Service độc lập dùng để embed câu hỏi người dùng.
    Phải cấu hình GIỐNG HỆT bên Knowledge Service.
    """
    _instance = None
    _sparse_model = None
    _dense_embedder = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(HybridQueryEncoder, cls).__new__(cls)
            cls._instance._initialize_models()
        return cls._instance

    def _initialize_models(self):
        # 1. Sparse Model (BM25) - Load local RAM
        if self._sparse_model is None:
            # Model name phải khớp bên KM
            self._sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")

        # 2. Dense Model (Azure OpenAI)
        if self._dense_embedder is None:
            self._dense_embedder = AzureOpenAIEmbeddings(
                deployment=settings.EMBEDDING_DEPLOYMENT_NAME,
                model=settings.EMBEDDING_MODEL,
                azure_endpoint=settings.EMBEDDING_ENDPOINT,
                api_key=settings.EMBEDDING_API_KEY,
                api_version=settings.EMBEDDING_API_VERSION,
            )

    async def encode_query(self, query: str) -> Dict[str, Any]:
        """
        Input: "Câu hỏi user"
        Output: { "dense": [...], "sparse": {indices: ..., values: ...} }
        """
        # Encode Dense (Async call to Azure)
        dense_task = self._dense_embedder.aembed_query(query)
        
        # Encode Sparse (CPU bound -> wrap in thread)
        # Vì fastembed là sync, cần đưa vào to_thread để không block Chatbot API
        def _sparse_sync():
            # embed trả về generator, lấy item đầu tiên
            return list(self._sparse_model.embed([query]))[0]

        sparse_task = asyncio.to_thread(_sparse_sync)

        # Chạy song song
        dense_vec, sparse_obj = await asyncio.gather(dense_task, sparse_task)

        # Convert Sparse Object sang Dict chuẩn cho Qdrant
        sparse_vec = {
            "indices": sparse_obj.indices.tolist(),
            "values": sparse_obj.values.tolist()
        }

        return {
            "dense": dense_vec,
            "sparse": sparse_vec
        }