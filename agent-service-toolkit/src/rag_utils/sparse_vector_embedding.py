from typing import List
from fastembed import SparseTextEmbedding
from qdrant_client.http import models
import numpy as np

class SparseEmbeddingService:
    _instance = None
    _model = None

    def __new__(cls):
        """
        Singleton Pattern: Đảm bảo chỉ có 1 instance duy nhất được tạo.
        """
        if cls._instance is None:
            # Nếu chưa có instance nào, tạo mới
            cls._instance = super(SparseEmbeddingService, cls).__new__(cls)
            
            # Load model (Chỉ chạy 1 lần duy nhất)
            print("⏳ Loading Sparse Embedding Model (Qdrant/bm25)...")
            cls._model = SparseTextEmbedding(model_name="Qdrant/bm25")
            print("✅ Sparse Model loaded successfully.")
            
        return cls._instance

    def embed(self, texts: List[str]) -> List[models.SparseVector]:
        """
        Sinh sparse vectors cho một danh sách text.
        Trả về định dạng chuẩn của Qdrant (models.SparseVector).
        """
        if not texts:
            return []

        # Gọi model của fastembed (trả về generator các object SparseEmbedding)
        raw_embeddings = list(self._model.embed(texts))
        
        results = []
        for embedding in raw_embeddings:
            # QUAN TRỌNG: Phải convert numpy array sang list để tránh lỗi validation của Qdrant
            qdrant_vector = models.SparseVector(
                indices=embedding.indices.tolist(),
                values=embedding.values.tolist()
            )
            results.append(qdrant_vector)
            
        return results
