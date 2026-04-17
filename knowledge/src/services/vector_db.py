"""
Vector Database Service for Qdrant operations.

This module provides a high-level interface for Qdrant vector database operations
including:
- Hybrid vector storage (dense + sparse)
- Batch upsert operations with optional transaction tracking
- Point deletion and management
- Collection management

The service supports two operation modes:
1. Direct mode: Operations are immediately persisted
2. Transaction mode: Operations are tracked for potential rollback

Usage:
    # Direct mode
    await vector_svc.upsert_hybrid_batch(points)

    # Transaction mode (for rollback support)
    from src.core.transaction import QdrantTransaction
    async with QdrantTransaction(client, collection_name) as txn:
        point_ids = await vector_svc.upsert_hybrid_batch(points, transaction=txn)
        # On error, all upserted points will be rolled back
"""

import uuid
import logging
from typing import List, Dict, Any, Optional, Set
from qdrant_client import AsyncQdrantClient, models

from src.core.transaction import QdrantTransaction

logger = logging.getLogger(__name__)


class VectorDBService:
    """
    Service for managing vector operations in Qdrant.

    This service handles:
    - Hybrid vector storage (dense + sparse embeddings)
    - Batch operations for performance
    - Transaction-aware operations for error recovery

    Attributes:
        DENSE_VECTOR_NAME: Key for dense vector field in payload
        SPARSE_VECTOR_NAME: Key for sparse vector field in payload
    """

    DENSE_VECTOR_NAME = "dense_vec"
    SPARSE_VECTOR_NAME = "sparse_vec"

    def __init__(self, client: AsyncQdrantClient, collection_name: str):
        """
        Initialize VectorDBService.

        Args:
            client: AsyncQdrantClient instance
            collection_name: Name of the collection to operate on
        """
        self.client = client
        self.collection_name = collection_name

    async def collection_exists(self) -> bool:
        """
        Check if the collection exists in Qdrant.

        Returns:
            True if collection exists, False otherwise
        """
        return await self.client.collection_exists(self.collection_name)

    async def ensure_hybrid_collection(self, dense_dim: int = 3072) -> None:
        """
        Ensure the hybrid collection exists, creating it if necessary.

        Creates a collection with:
        - Dense vector field (configurable dimension, default 3072 for Azure OpenAI)
        - Sparse vector field for BM25-style keyword search
        - Payload indexes on doc_id and faq_id for efficient filtering

        Args:
            dense_dim: Dimension of dense vectors (default 3072 for text-embedding-3-large)
        """
        if await self.client.collection_exists(self.collection_name):
            logger.debug(f"Collection '{self.collection_name}' already exists")
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

        # Create payload indexes for efficient filtering
        await self.client.create_payload_index(
            self.collection_name, "doc_id", models.PayloadSchemaType.INTEGER
        )
        await self.client.create_payload_index(
            self.collection_name, "faq_id", models.PayloadSchemaType.INTEGER
        )
        logger.info(f"Created hybrid collection: {self.collection_name}")

    def _build_point_struct(
        self,
        point_id: str,
        dense_vector: Any,
        sparse_vector: Any,
        payload: Dict[str, Any],
    ) -> models.PointStruct:
        """
        Build a PointStruct with hybrid vectors.

        Args:
            point_id: Unique identifier for the point
            dense_vector: Dense embedding vector
            sparse_vector: Sparse embedding vector (BM25-style)
            payload: Metadata and content payload

        Returns:
            Configured PointStruct ready for upsert
        """
        return models.PointStruct(
            id=point_id,
            vector={
                self.DENSE_VECTOR_NAME: dense_vector,
                self.SPARSE_VECTOR_NAME: sparse_vector,
            },
            payload=payload,
        )

    async def upsert_hybrid_batch(
        self,
        points_data: List[Dict[str, Any]],
        transaction: Optional[QdrantTransaction] = None,
    ) -> List[str]:
        """
        Upsert a batch of points with hybrid vectors.

        This method generates UUIDs for each point and upserts them to Qdrant.
        If a transaction is provided, the generated IDs are tracked for
        potential rollback on error.

        Args:
            points_data: List of point data dicts with keys:
                - dense: Dense embedding vector
                - sparse: Sparse embedding vector
                - payload: Point metadata and content
            transaction: Optional transaction for rollback tracking

        Returns:
            List of generated point IDs

        Example:
            points = [
                {
                    "dense": [0.1, 0.2, ...],
                    "sparse": {"indices": [1, 2], "values": [0.5, 0.3]},
                    "payload": {"content": "text", "doc_id": 1, "type": "chunk"}
                }
            ]
            point_ids = await vector_svc.upsert_hybrid_batch(points)
        """
        if not points_data:
            return []

        points = []
        generated_ids = []

        for item in points_data:
            point_id = str(uuid.uuid4())
            generated_ids.append(point_id)

            points.append(
                self._build_point_struct(
                    point_id=point_id,
                    dense_vector=item["dense"],
                    sparse_vector=item["sparse"],
                    payload=item["payload"],
                )
            )

        # Perform the upsert
        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,  # Wait for operation to complete
        )

        logger.debug(
            f"Upserted {len(points)} points to collection '{self.collection_name}'"
        )

        # Track for transaction if provided
        if transaction:
            transaction.track_upsert(generated_ids)
            logger.debug(f"Tracked {len(generated_ids)} points in transaction")

        return generated_ids

    async def upsert_with_explicit_ids(
        self,
        points_data: List[Dict[str, Any]],
        transaction: Optional[QdrantTransaction] = None,
    ) -> bool:
        """
        Upsert points using explicitly provided IDs.

        Unlike upsert_hybrid_batch which generates UUIDs, this method
        uses IDs provided in the points_data (e.g., for FAQ variants).

        Args:
            points_data: List of point data dicts with keys:
                - id: Explicit point ID to use
                - dense: Dense embedding vector
                - sparse: Sparse embedding vector
                - payload: Point metadata
            transaction: Optional transaction for rollback tracking

        Returns:
            True if successful
        """
        if not points_data:
            return True

        points = []
        explicit_ids = []

        for item in points_data:
            point_id = str(item["id"])
            explicit_ids.append(point_id)

            points.append(
                self._build_point_struct(
                    point_id=point_id,
                    dense_vector=item["dense"],
                    sparse_vector=item["sparse"],
                    payload=item["payload"],
                )
            )

        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,
        )

        logger.debug(f"Upserted {len(points)} points with explicit IDs")

        # Track for transaction if provided
        if transaction:
            transaction.track_upsert(explicit_ids)

        return True

    async def upsert_hybrid_batch_with_backup(
        self,
        points_data: List[Dict[str, Any]],
        doc_id: int,
        transaction: QdrantTransaction,
    ) -> List[str]:
        """
        Upsert points with automatic backup of existing document points.

        This is the preferred method for re-processing documents:
        1. Backup existing points for the document
        2. Delete them
        3. Upsert new points
        4. Track new points for rollback

        If the upsert fails, existing points can be restored.

        Args:
            points_data: List of point data to upsert
            doc_id: Document ID for backup/deduplication
            transaction: Transaction context for tracking

        Returns:
            List of generated point IDs
        """
        # Backup existing points before upserting
        await transaction.backup_and_delete_by_doc_id(doc_id)

        # Upsert new points (will be tracked in transaction)
        return await self.upsert_hybrid_batch(points_data, transaction)

    async def delete_vectors_by_document(
        self, document_id: int, transaction: Optional[QdrantTransaction] = None
    ) -> int:
        """
        Delete all vectors associated with a document.

        Args:
            document_id: ID of the document whose vectors to delete
            transaction: Optional transaction for backup tracking

        Returns:
            Number of points deleted (estimated)
        """
        if transaction:
            # Backup before deleting (for rollback support)
            await transaction.backup_and_delete_by_doc_id(document_id)
            return 0  # Already deleted within transaction

        # Direct delete without transaction
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
        logger.info(f"Deleted vectors for document_id={document_id}")
        return 1

    async def delete_points_by_ids(
        self,
        point_ids: List[str],
        transaction: Optional[QdrantTransaction] = None,
        backup: bool = False,
    ) -> None:
        """
        Delete specific points by their IDs.

        Args:
            point_ids: List of point IDs to delete
            transaction: Optional transaction for backup tracking
            backup: If True, backup points before deletion
        """
        if not point_ids:
            return

        if backup and transaction:
            # TODO: Implement backup by scrolling first if needed
            # For now, we'll skip backup for explicit ID deletion
            pass

        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.PointIdsList(points=point_ids),
            wait=True,
        )
        logger.debug(f"Deleted {len(point_ids)} points by ID")

    async def delete_vectors_by_document_with_rollback(
        self, document_id: int, transaction: QdrantTransaction
    ) -> None:
        """
        Delete document vectors with rollback capability.

        This method backs up points before deletion, allowing
        restoration if a subsequent operation fails.

        Args:
            document_id: Document ID to delete vectors for
            transaction: Transaction context for backup/restore
        """
        await transaction.backup_and_delete_by_doc_id(document_id)

    async def scroll_all_points(
        self, filter_cond: Optional[models.Filter] = None, limit: int = 10000
    ) -> List[Dict[str, Any]]:
        """
        Retrieve all points matching a filter (with pagination via offset).

        Warning: For large datasets, prefer batch processing with scroll
        using offset parameter.

        Args:
            filter_cond: Optional filter conditions
            limit: Maximum points to return per page

        Returns:
            List of point data dicts with id, vector, and payload
        """
        all_points = []
        offset = None

        while True:
            result, offset = await self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=filter_cond,
                with_payload=True,
                with_vectors=True,
                limit=limit,
                offset=offset,
            )

            for point in result:
                all_points.append(
                    {"id": point.id, "vector": point.vector, "payload": point.payload}
                )

            if offset is None:
                break

        return all_points

    async def get_point_count(self, filter_cond: Optional[models.Filter] = None) -> int:
        """
        Get count of points matching filter.

        Args:
            filter_cond: Optional filter conditions

        Returns:
            Count of matching points
        """
        result = await self.client.count(
            collection_name=self.collection_name, count_filter=filter_cond, exact=True
        )
        return result.count

    async def point_exists(self, point_id: str) -> bool:
        """
        Check if a specific point exists.

        Args:
            point_id: ID of the point to check

        Returns:
            True if point exists, False otherwise
        """
        try:
            result = await self.client.retrieve(
                collection_name=self.collection_name, ids=[point_id], with_payload=False
            )
            return len(result) > 0
        except Exception:
            return False

    async def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on the collection.

        Returns:
            Dict with collection health information
        """
        try:
            exists = await self.collection_exists()
            info = await self.client.get_collection(self.collection_name)

            return {
                "healthy": True,
                "collection_exists": exists,
                "points_count": info.points_count,
                "vectors_count": info.vectors_count,
                "collection_name": self.collection_name,
            }
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e),
                "collection_name": self.collection_name,
            }
