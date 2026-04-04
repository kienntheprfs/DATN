import uuid
from typing import List, Dict, Any
from qdrant_client import AsyncQdrantClient, models


class VectorDBService:
    DENSE_VECTOR_NAME = "dense_vec"
    SPARSE_VECTOR_NAME = "sparse_vec"

    def __init__(self, client: AsyncQdrantClient, collection_name: str):
        self.client = client
        self.collection_name = collection_name

    async def collection_exists(self) -> bool:
        return await self.client.collection_exists(self.collection_name)

    async def ensure_hybrid_collection(self, dense_dim: int = 3072):
        if await self.client.collection_exists(self.collection_name):
            return

        await self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config={
                self.DENSE_VECTOR_NAME: models.VectorParams(
                    size=dense_dim,
                    distance=models.Distance.COSINE,
                )
            },
            sparse_vectors_config={
                self.SPARSE_VECTOR_NAME: models.SparseVectorParams(
                    index=models.SparseIndexParams(
                        on_disk=False,
                    )
                ),
            },
        )

        await self.client.create_payload_index(
            self.collection_name, "doc_id", models.PayloadSchemaType.INTEGER
        )
        await self.client.create_payload_index(
            self.collection_name, "faq_id", models.PayloadSchemaType.INTEGER
        )
        print(f"✅ Created Hybrid Collection: {self.collection_name}")

    async def upsert_hybrid_batch(self, points_data: List[Dict[str, Any]]) -> List[str]:
        points = []
        generated_ids = []

        for item in points_data:
            point_id = str(uuid.uuid4())
            generated_ids.append(point_id)
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector={
                        self.DENSE_VECTOR_NAME: item["dense"],
                        self.SPARSE_VECTOR_NAME: item["sparse"],
                    },
                    payload=item["payload"],
                )
            )

        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,
        )
        return generated_ids

    async def upsert_faq_batch(self, points_data: List[Dict[str, Any]]) -> bool:
        points = []
        for item in points_data:
            points.append(
                models.PointStruct(
                    id=item["id"],
                    vector={
                        self.DENSE_VECTOR_NAME: item["dense"],
                        self.SPARSE_VECTOR_NAME: item["sparse"],
                    },
                    payload=item["payload"],
                )
            )
        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,
        )
        return True

    async def delete_vectors_by_document(self, document_id: int):
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="doc_id",
                            match=models.MatchValue(value=document_id),
                        )
                    ]
                )
            ),
            wait=True,
        )

    async def delete_points_by_ids(self, point_ids: List[str]):
        if not point_ids:
            return
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.PointIdsList(points=point_ids),
            wait=True,
        )
