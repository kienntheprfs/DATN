"""
Transaction management module for Qdrant database operations.

This module provides transactional semantics for Qdrant operations, enabling:
1. Tracking of upserted point IDs for rollback
2. Backup of existing points before deletion for recovery
3. Automatic rollback on errors via context manager pattern

IMPORTANT: Qdrant does not support true ACID transactions natively.
This is a "Best Effort" transaction pattern that provides:
- Atomic rollback of failed operations
- Point-in-time consistency within a single logical operation
- Idempotent error recovery

Usage:
    async with QdrantTransaction(client, collection_name) as txn:
        point_ids = await vector_service.upsert_with_transaction(txn, points_data)
        # If error occurs here, all upserted points will be rolled back
        txn.mark_success()  # Optional: marks transaction as committed
"""

import logging
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from qdrant_client import AsyncQdrantClient, models

logger = logging.getLogger(__name__)


@dataclass
class TransactionPoint:
    """Represents a single point within a transaction for tracking."""

    point_id: Any
    vector: Dict[str, Any]
    payload: Dict[str, Any]


class QdrantTransaction:
    """
    Context Manager for managing Qdrant transactions with rollback capability.

    This class implements a "Best Effort" transaction pattern for Qdrant:
    - BEFORE operations: Backup existing points if they might be modified/deleted
    - DURING operations: Track all newly upserted points
    - ON ERROR: Rollback by deleting new points and restoring backed-up points
    - ON SUCCESS: Clear tracking data (no action needed since upserts are permanent)

    Attributes:
        client: AsyncQdrantClient instance for Qdrant operations
        collection_name: Target collection name
        _upserted_points: Set of point IDs that have been upserted in this transaction
        _backup_points: List of points that were deleted/overwritten (for restore)
        _committed: Flag indicating if transaction was explicitly committed
        _rollback_point_ids: Optional set of specific point IDs to rollback on error
    """

    def __init__(
        self,
        client: AsyncQdrantClient,
        collection_name: str,
        max_backup_points: int = 10000,
    ):
        """
        Initialize a new Qdrant transaction.

        Args:
            client: AsyncQdrantClient instance
            collection_name: Name of the collection to operate on
            max_backup_points: Maximum number of points to backup (memory safety)
        """
        self.client = client
        self.collection_name = collection_name
        self.max_backup_points = max_backup_points

        # Track upserted point IDs for potential rollback
        self._upserted_point_ids: Set[str] = set()

        # Backup of deleted/overwritten points for restoration
        self._backup_points: List[TransactionPoint] = []

        # Transaction state
        self._committed: bool = False
        self._rolled_back: bool = False

        # Optional: specific point IDs to rollback (alternative to doc_id based)
        self._rollback_point_ids: Optional[Set[str]] = None

        # Operation tracking for debugging
        self._operations: List[str] = []

    async def __aenter__(self) -> "QdrantTransaction":
        """Enter the transaction context."""
        logger.debug(
            f"Starting Qdrant transaction for collection: {self.collection_name}"
        )
        self._operations.append("TRANSACTION_START")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        """
        Exit the transaction context.

        If an exception occurred, automatically triggers rollback.
        If no exception, marks transaction as committed.

        Args:
            exc_type: Exception type if an error occurred
            exc_val: Exception value
            exc_tb: Exception traceback

        Returns:
            False to propagate exceptions, True to suppress them
        """
        if exc_type:
            # Exception occurred - rollback all changes
            logger.error(
                f"Qdrant transaction failed with error: {exc_val}. "
                f"Initiating rollback for collection '{self.collection_name}'..."
            )
            self._operations.append("ROLLBACK_TRIGGERED")
            await self.rollback()
            return False  # Propagate the exception

        # No exception - commit successful
        self._committed = True
        self._operations.append("TRANSACTION_COMMIT")
        logger.info(
            f"Qdrant transaction committed successfully for collection: "
            f"{self.collection_name}"
        )
        return True

    def track_upsert(self, point_ids: List[str]) -> None:
        """
        Track newly upserted point IDs for potential rollback.

        Call this after successfully upserting points to register them
        for automatic cleanup if a later operation fails.

        Args:
            point_ids: List of point IDs that were just upserted
        """
        for pid in point_ids:
            self._upserted_point_ids.add(str(pid))
        logger.debug(
            f"Tracked {len(point_ids)} upserted points. "
            f"Total tracked: {len(self._upserted_point_ids)}"
        )
        self._operations.append(f"TRACK_UPSERT:{len(point_ids)}")

    def track_rollback_ids(self, point_ids: List[str]) -> None:
        """
        Set specific point IDs to rollback on error.

        This is an alternative to doc_id-based deletion, useful when
        you want to delete specific points regardless of their doc_id.

        Args:
            point_ids: List of point IDs to delete on rollback
        """
        if self._rollback_point_ids is None:
            self._rollback_point_ids = set()
        for pid in point_ids:
            self._rollback_point_ids.add(str(pid))
        logger.debug(f"Set {len(point_ids)} explicit rollback point IDs")

    async def backup_and_delete_by_doc_id(self, doc_id: int) -> None:
        """
        Delete points by document ID while backing them up for potential rollback.

        This is used when re-processing a document - we backup existing vectors
        so if the new processing fails, we can restore the old ones.

        Args:
            doc_id: Document ID to filter points for deletion
        """
        self._operations.append(f"BACKUP_DELETE_DOC:{doc_id}")

        # Step 1: Scroll and backup existing points
        scroll_result, _ = await self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="doc_id",
                        match=models.MatchValue(value=doc_id),
                    )
                ]
            ),
            with_payload=True,
            with_vectors=True,
            limit=self.max_backup_points,
        )

        if not scroll_result:
            logger.debug(f"No existing points found for doc_id={doc_id}")
            return

        # Step 2: Backup points for potential restoration
        for point in scroll_result:
            self._backup_points.append(
                TransactionPoint(
                    point_id=point.id, vector=point.vector, payload=point.payload
                )
            )

        logger.info(
            f"Backed up {len(scroll_result)} existing points for doc_id={doc_id}"
        )

        # Step 3: Perform the actual deletion
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.PointIdsList(points=[p.id for p in scroll_result]),
            wait=True,
        )
        logger.debug(f"Deleted {len(scroll_result)} points for doc_id={doc_id}")

    async def delete_with_backup(
        self, doc_id: int, additional_filter: Optional[models.Filter] = None
    ) -> None:
        """
        Delete points matching criteria while backing them up.

        Args:
            doc_id: Document ID to filter points
            additional_filter: Optional additional filter conditions
        """
        self._operations.append(f"DELETE_WITH_BACKUP:{doc_id}")

        # Build filter
        must_conditions = [
            models.FieldCondition(
                key="doc_id",
                match=models.MatchValue(value=doc_id),
            )
        ]

        if additional_filter and additional_filter.must:
            must_conditions.extend(additional_filter.must)

        scroll_filter = models.Filter(must=must_conditions)

        # Scroll and backup
        scroll_result, _ = await self.client.scroll(
            collection_name=self.collection_name,
            scroll_filter=scroll_filter,
            with_payload=True,
            with_vectors=True,
            limit=self.max_backup_points,
        )

        if not scroll_result:
            return

        for point in scroll_result:
            self._backup_points.append(
                TransactionPoint(
                    point_id=point.id, vector=point.vector, payload=point.payload
                )
            )

        # Delete
        await self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.PointIdsList(points=[p.id for p in scroll_result]),
            wait=True,
        )

    async def rollback(self) -> None:
        """
        Rollback all changes made in this transaction.

        This method:
        1. Deletes all newly upserted points (undoes upsert operations)
        2. Restores all backed-up points (undoes delete operations)

        It's safe to call this multiple times - subsequent calls are no-ops.
        """
        if self._rolled_back:
            logger.warning("Rollback already executed, skipping duplicate call")
            return

        self._rolled_back = True
        rollback_ops = []

        # Step 1: Delete newly upserted points (if any were tracked)
        if self._upserted_point_ids:
            point_ids_list = list(self._upserted_point_ids)
            try:
                await self.client.delete(
                    collection_name=self.collection_name,
                    points_selector=models.PointIdsList(points=point_ids_list),
                    wait=True,
                )
                rollback_ops.append(f"Deleted {len(point_ids_list)} new points")
                logger.info(
                    f"Rollback: Deleted {len(point_ids_list)} newly upserted points"
                )
            except Exception as e:
                logger.error(
                    f"Rollback failed to delete new points: {e}. "
                    f"Point IDs: {point_ids_list[:10]}..."
                )

        # Step 2: Handle explicit rollback IDs (alternative tracking)
        if self._rollback_point_ids:
            ids_to_delete = list(self._rollback_point_ids - self._upserted_point_ids)
            if ids_to_delete:
                try:
                    await self.client.delete(
                        collection_name=self.collection_name,
                        points_selector=models.PointIdsList(points=ids_to_delete),
                        wait=True,
                    )
                    rollback_ops.append(
                        f"Deleted {len(ids_to_delete)} explicit rollback points"
                    )
                    logger.info(
                        f"Rollback: Deleted {len(ids_to_delete)} explicit rollback points"
                    )
                except Exception as e:
                    logger.error(f"Rollback failed for explicit IDs: {e}")

        # Step 3: Restore backed-up points (if any were saved)
        if self._backup_points:
            points_to_restore = [
                models.PointStruct(id=bp.point_id, vector=bp.vector, payload=bp.payload)
                for bp in self._backup_points
            ]

            try:
                await self.client.upsert(
                    collection_name=self.collection_name,
                    points=points_to_restore,
                    wait=True,
                )
                rollback_ops.append(
                    f"Restored {len(points_to_restore)} backed-up points"
                )
                logger.info(
                    f"Rollback: Restored {len(points_to_restore)} backed-up points"
                )
            except Exception as e:
                logger.error(
                    f"Rollback failed to restore backed-up points: {e}. "
                    f"These points may need manual recovery."
                )

        self._operations.append(f"ROLLBACK_COMPLETE:{len(rollback_ops)}")
        logger.info(
            f"Rollback completed for collection '{self.collection_name}'. "
            f"Operations: {'; '.join(rollback_ops) if rollback_ops else 'none'}"
        )

    def get_tracked_ids(self) -> Set[str]:
        """Get all tracked point IDs for external use (e.g., error handlers)."""
        return self._upserted_point_ids.copy()

    def get_backup_count(self) -> int:
        """Get count of backed-up points."""
        return len(self._backup_points)

    def is_rolled_back(self) -> bool:
        """Check if this transaction has been rolled back."""
        return self._rolled_back

    def get_operations_log(self) -> List[str]:
        """Get log of all operations performed in this transaction."""
        return self._operations.copy()


class DocumentTransaction:
    """
    Higher-level transaction manager for document-level operations.

    This class coordinates both Qdrant and PostgreSQL operations
    within a single logical transaction, ensuring consistency across
    both databases.

    Usage:
        async with DocumentTransaction(db, qdrant_client, collection_name) as txn:
            # Upsert to Qdrant with tracking
            point_ids = await vector_service.upsert_with_transaction(txn, points)

            # Save metadata to PostgreSQL
            await chunk_repo.bulk_create(chunks)

            # On success: both are committed
            # On failure: both are rolled back
    """

    def __init__(
        self,
        db_session: Any,  # AsyncSession
        qdrant_client: AsyncQdrantClient,
        collection_name: str,
    ):
        """
        Initialize document transaction.

        Args:
            db_session: SQLAlchemy async session for PostgreSQL
            qdrant_client: Qdrant async client
            collection_name: Target collection name
        """
        self.db = db_session
        self.qdrant_txn = QdrantTransaction(qdrant_client, collection_name)
        self._committing = False

    async def __aenter__(self) -> "DocumentTransaction":
        """Enter document transaction context."""
        await self.qdrant_txn.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        """Exit document transaction with coordinated rollback."""
        if exc_type:
            # Error occurred - rollback both databases
            logger.error(
                f"Document transaction failed. Rolling back both "
                f"Qdrant and PostgreSQL for collection: {self.qdrant_txn.collection_name}"
            )

            # Rollback Qdrant first (no exception)
            try:
                await self.qdrant_txn.rollback()
            except Exception as qdrant_error:
                logger.error(f"Qdrant rollback error: {qdrant_error}")

            # Rollback PostgreSQL
            try:
                await self.db.rollback()
                logger.info("PostgreSQL rollback completed")
            except Exception as pg_error:
                logger.error(f"PostgreSQL rollback error: {pg_error}")

            return False  # Propagate original exception

        # Success - commit PostgreSQL (Qdrant is already committed via upsert)
        try:
            await self.db.commit()
            logger.info("Document transaction committed successfully")
        except Exception as e:
            # PostgreSQL commit failed - rollback Qdrant
            logger.error(
                f"PostgreSQL commit failed after Qdrant upsert: {e}. "
                f"Initiating Qdrant rollback..."
            )
            try:
                await self.qdrant_txn.rollback()
                await self.db.rollback()
            except Exception as rollback_error:
                logger.error(f"Rollback after commit failure failed: {rollback_error}")
            raise

        # Clean up Qdrant transaction
        await self.qdrant_txn.__aexit__(None, None, None)
        return True

    def track_upsert(self, point_ids: List[str]) -> None:
        """Delegate to Qdrant transaction."""
        self.qdrant_txn.track_upsert(point_ids)

    async def backup_and_delete_doc(self, doc_id: int) -> None:
        """Delegate to Qdrant transaction."""
        await self.qdrant_txn.backup_and_delete_by_doc_id(doc_id)
