import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import AsyncQdrantClient, models
from src.core.config import settings

class VectorDBService:
    DENSE_VECTOR_NAME = "dense_vec"
    SPARSE_VECTOR_NAME = "sparse_vec"

    def __init__(self, client: AsyncQdrantClient, collection_name: str):
        # Lưu client và collection_name vào instance để dùng cho tiện
        self.client = client
        self.collection_name = collection_name

    async def ensure_hybrid_collection(self, dense_dim: int = 3072):
        """
        Kiểm tra và tạo collection Hybrid (Dense + Sparse) nếu chưa có.
        """
        if await self.client.collection_exists(self.collection_name):
            return

        await self.client.create_collection(
            collection_name=self.collection_name,
            # 1. Config Dense Vector
            vectors_config={
                self.DENSE_VECTOR_NAME: models.VectorParams(
                    size=dense_dim, 
                    distance=models.Distance.COSINE
                )
            },
            # 2. Config Sparse Vector (Quan trọng cho Hybrid)
            sparse_vectors_config={
                self.SPARSE_VECTOR_NAME: models.SparseVectorParams(
                    index=models.SparseIndexParams(
                        on_disk=False, 
                    )
                )
            }
        )
        
        # Optimize: Tạo Payload Index
        await self.client.create_payload_index(self.collection_name, "doc_id", models.PayloadSchemaType.INTEGER)
        await self.client.create_payload_index(self.collection_name, "version_id", models.PayloadSchemaType.INTEGER)
        
        print(f"✅ Created Hybrid Collection: {self.collection_name}")

    async def upsert_hybrid_batch(self, points_data: List[Dict[str, Any]]) -> List[str]:
        """
        Upsert batch. Input: List[{'dense': ..., 'sparse': ..., 'payload': ...}]
        """
        points = []
        generated_ids = []

        for item in points_data:
            # Tạo UUID nếu chưa có (Qdrant yêu cầu UUID hoặc Int)
            point_id = str(uuid.uuid4())
            generated_ids.append(point_id)

            points.append(models.PointStruct(
                id=point_id,
                vector={
                    self.DENSE_VECTOR_NAME: item["dense"], 
                    self.SPARSE_VECTOR_NAME: item["sparse"]
                },
                payload=item["payload"]
            ))

        # wait=True để đảm bảo data available ngay lập tức cho transaction tracking
        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True
        )
        return generated_ids
    
    async def upsert_faq_batch(self, points_data: List[Dict[str, Any]]) -> bool:
        """
        Upsert FAQ variants.
        Dữ liệu FAQ nên nằm chung Collection với Chunks để tận dụng Unified Search.
        Ta phân biệt bằng payload field `type: "faq"`.
        """
        points = []
        
        for item in points_data:
            # item bao gồm: id (uuid), dense, sparse, payload
            points.append(models.PointStruct(
                id=item["id"], # Sử dụng ID được tạo từ bên ngoài để map với Postgres
                vector={
                    self.DENSE_VECTOR_NAME: item["dense"], 
                    self.SPARSE_VECTOR_NAME: item["sparse"]
                },
                payload=item["payload"]
            ))

        # Dùng wait=True để đảm bảo data consistency cho luồng xử lý tiếp theo
        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True
        )
        return True
    
    async def delete_vectors_by_version(self, version_id: int):
        """
        ROLLBACK QDRANT: Xóa vector theo Filter (Payload)
        """
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="version_id",
                            match=models.MatchValue(value=version_id),
                        )
                    ]
                )
            ),
        )
