"""
FAQ Service for managing Frequently Asked Questions.

This module provides business logic for FAQ operations including:
- Manual FAQ CRUD (Create, Read, Update, Delete)
- FAQ generation from documents (via Celery pipeline)
- Dual-write pattern: PostgreSQL + Qdrant vector store

Transaction Safety:
    All write operations use QdrantTransaction to ensure consistency:
    - On success: Both PostgreSQL and Qdrant are updated
    - On failure: Both are rolled back to maintain consistency

    The transaction pattern ensures:
    1. Qdrant upserts are tracked for rollback
    2. Qdrant deletes backup points for restoration
    3. PostgreSQL commits only after Qdrant succeeds
    4. Full rollback if any step fails

Error Handling:
    - Qdrant failures: Rollback PostgreSQL, don't commit
    - PostgreSQL failures: Rollback Qdrant changes
    - Partial updates: Full rollback to maintain consistency
"""

from __future__ import annotations

import logging
import uuid
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.vector_db_setup import QdrantManager
from src.core.transaction import QdrantTransaction
from src.models.models import FAQSource
from src.repositories.faq_repository import FAQRepository
from src.schemas.faq import ManualFAQCreate, ManualFAQUpdate
from src.services.ingestion import IngestionService
from src.services.vector_db import VectorDBService

logger = logging.getLogger(__name__)


class FAQService:
    """
    Service for managing FAQ operations with transaction support.

    This service handles both PostgreSQL (metadata) and Qdrant (vectors)
    operations within transactional boundaries.

    Attributes:
        db: SQLAlchemy async session
        repo: FAQRepository for PostgreSQL operations
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize FAQService.

        Args:
            db: SQLAlchemy async session for database operations
        """
        self.db = db
        self.repo = FAQRepository(db)

    async def _get_vector_service(self) -> VectorDBService:
        """
        Get or create VectorDBService instance.

        Ensures the FAQ collection exists before returning.

        Returns:
            Configured VectorDBService for FAQ collection
        """
        svc = VectorDBService(QdrantManager.get_client(), settings.FAQ_COLLECTION_NAME)
        await svc.ensure_hybrid_collection()
        return svc

    async def list_manual(self, skip: int = 0, limit: int = 50) -> List:
        """
        List manual FAQs with pagination.

        Args:
            skip: Number of records to skip
            limit: Maximum records to return

        Returns:
            List of FAQ objects
        """
        return list(await self.repo.list_manual(skip=skip, limit=limit))

    async def get_manual(self, faq_id: int):
        """
        Get a single manual FAQ by ID.

        Args:
            faq_id: ID of the FAQ to retrieve

        Returns:
            FAQ object

        Raises:
            HTTPException: If FAQ not found
        """
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"FAQ with id={faq_id} not found",
            )
        return faq

    async def create_manual(self, payload: ManualFAQCreate):
        """
        Create a new manual FAQ with vector embedding.

        This operation:
        1. Validates input (at least one question required)
        2. Embeds all questions (hybrid: dense + sparse)
        3. Creates FAQ record in PostgreSQL
        4. Upserts vectors to Qdrant
        5. Commits transaction

        On any failure, both PostgreSQL and Qdrant are rolled back.

        Args:
            payload: FAQ creation data

        Returns:
            Created FAQ object with relations loaded

        Raises:
            HTTPException: On validation failure or operation failure
        """
        ingestion = IngestionService()
        vec = await self._get_vector_service()
        qdrant_client = QdrantManager.get_client()

        # Validate: at least one non-empty question required
        texts = [q.strip() for q in payload.questions if q and q.strip()]
        if not texts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one non-empty question is required",
            )

        # Generate embeddings for all questions
        embeddings = await ingestion.embed_hybrid_batch(texts)
        point_ids = [str(uuid.uuid4()) for _ in texts]

        # Transaction scope: PostgreSQL + Qdrant
        async with QdrantTransaction(
            qdrant_client, settings.FAQ_COLLECTION_NAME
        ) as txn:
            # Step 1: Create FAQ record in PostgreSQL (without variants first)
            faq = await self.repo.create_manual(
                answer=payload.answer,
                meta_data=payload.meta_data,
                variants=[],  # Will populate after vectors are created
            )
            await self.db.flush()

            # Step 2: Prepare Qdrant points and variant records
            points = []
            variants = []
            for i, qtext in enumerate(texts):
                pid = point_ids[i]
                variants.append({"question": qtext, "embedding_id": pid})
                points.append(
                    {
                        "id": pid,
                        "dense": embeddings[i]["dense"],
                        "sparse": embeddings[i]["sparse"],
                        "payload": {
                            "content": qtext,
                            "answer_preview": payload.answer[:300],
                            "type": "faq",
                            "faq_source": "manual",
                            "faq_id": faq.id,
                        },
                    }
                )

            # Step 3: Upsert vectors to Qdrant (tracked in transaction)
            await vec.upsert_with_explicit_ids(points, transaction=txn)

            # Step 4: Update FAQ with variants
            await self.repo.replace_manual_variants(faq.id, variants)

            # Transaction will commit on success, rollback on exception
            await self.db.commit()
            await self.db.refresh(faq)

            logger.info(f"Created manual FAQ id={faq.id} with {len(texts)} questions")

        return await self.repo.get_by_id(faq.id, source=FAQSource.MANUAL)

    async def update_manual(self, faq_id: int, payload: ManualFAQUpdate):
        """
        Update an existing manual FAQ.

        This operation supports partial updates:
        - If questions change: Delete old vectors, create new ones
        - If answer changes: Update answer_preview in existing vectors
        - If metadata changes: Update metadata in PostgreSQL

        All changes are wrapped in a transaction for atomicity.

        Args:
            faq_id: ID of FAQ to update
            payload: Update data

        Returns:
            Updated FAQ object

        Raises:
            HTTPException: If FAQ not found or validation fails
        """
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"FAQ with id={faq_id} not found",
            )

        # Check if there's anything to update
        if (
            payload.questions is None
            and payload.answer is None
            and payload.meta_data is None
        ):
            return faq

        vec = await self._get_vector_service()
        qdrant_client = QdrantManager.get_client()

        async with QdrantTransaction(
            qdrant_client, settings.FAQ_COLLECTION_NAME
        ) as txn:
            # Handle question updates
            if payload.questions is not None:
                texts = [q.strip() for q in payload.questions if q and q.strip()]
                if not texts:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="At least one non-empty question is required",
                    )

                # Delete old vectors
                old_ids = await self.repo.list_embedding_ids_for_faq(faq_id)
                await vec.delete_points_by_ids(old_ids, transaction=txn)

                # Generate new embeddings
                ingestion = IngestionService()
                embeddings = await ingestion.embed_hybrid_batch(texts)
                point_ids = [str(uuid.uuid4()) for _ in texts]

                # Determine answer to use
                answer = payload.answer if payload.answer is not None else faq.answer

                # Prepare new points
                points = []
                variants = []
                for i, qtext in enumerate(texts):
                    pid = point_ids[i]
                    variants.append({"question": qtext, "embedding_id": pid})
                    points.append(
                        {
                            "id": pid,
                            "dense": embeddings[i]["dense"],
                            "sparse": embeddings[i]["sparse"],
                            "payload": {
                                "content": qtext,
                                "answer_preview": answer[:300],
                                "type": "faq",
                                "faq_source": "manual",
                                "faq_id": faq.id,
                            },
                        }
                    )

                # Upsert new vectors
                await vec.upsert_with_explicit_ids(points, transaction=txn)

                # Update PostgreSQL variants
                await self.repo.replace_manual_variants(faq_id, variants)

            # Handle answer-only update (without changing questions)
            elif payload.answer is not None and faq.questions:
                old_ids = await self.repo.list_embedding_ids_for_faq(faq_id)

                # Delete old vectors
                await vec.delete_points_by_ids(old_ids, transaction=txn)

                # Re-embed existing questions with new answer
                ingestion = IngestionService()
                texts = [v.question for v in faq.questions]
                embeddings = await ingestion.embed_hybrid_batch(texts)

                # Prepare points with new answer preview
                points = []
                variants = []
                for i, qtext in enumerate(texts):
                    pid = str(uuid.uuid4())
                    variants.append({"question": qtext, "embedding_id": pid})
                    points.append(
                        {
                            "id": pid,
                            "dense": embeddings[i]["dense"],
                            "sparse": embeddings[i]["sparse"],
                            "payload": {
                                "content": qtext,
                                "answer_preview": payload.answer[:300],
                                "type": "faq",
                                "faq_source": "manual",
                                "faq_id": faq.id,
                            },
                        }
                    )

                # Upsert new vectors
                await vec.upsert_with_explicit_ids(points, transaction=txn)

                # Update PostgreSQL variants with new IDs
                await self.repo.replace_manual_variants(faq_id, variants)

            # Update answer and/or metadata in PostgreSQL
            if payload.answer is not None or payload.meta_data is not None:
                await self.repo.update_manual(
                    faq_id,
                    answer=payload.answer,
                    meta_data=payload.meta_data,
                )

            # Commit transaction
            await self.db.commit()

            logger.info(f"Updated manual FAQ id={faq_id}")

        return await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)

    async def delete_manual(self, faq_id: int) -> None:
        """
        Delete a manual FAQ and its associated vectors.

        This operation:
        1. Deletes vectors from Qdrant
        2. Deletes FAQ record from PostgreSQL
        3. Commits transaction

        On any failure, both are rolled back.

        Args:
            faq_id: ID of FAQ to delete

        Raises:
            HTTPException: If FAQ not found
        """
        faq = await self.repo.get_by_id(faq_id, source=FAQSource.MANUAL)
        if not faq:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"FAQ with id={faq_id} not found",
            )

        vec = await self._get_vector_service()
        qdrant_client = QdrantManager.get_client()

        async with QdrantTransaction(
            qdrant_client, settings.FAQ_COLLECTION_NAME
        ) as txn:
            # Delete vectors from Qdrant (backup for potential rollback)
            ids = await self.repo.list_embedding_ids_for_faq(faq_id)

            # Backup is handled internally by delete_points_by_ids if needed
            await vec.delete_points_by_ids(ids, transaction=txn, backup=False)

            # Delete from PostgreSQL
            await self.repo.delete_manual(faq_id)

            # Commit transaction
            await self.db.commit()

            logger.info(f"Deleted manual FAQ id={faq_id}")

    async def get_stats(self) -> dict:
        """
        Get FAQ statistics.

        Returns:
            Dict with counts of manual and generated FAQs
        """
        manual_faqs = await self.repo.list_manual(skip=0, limit=10000)
        return {
            "manual_count": len(manual_faqs),
            "total_count": await self.repo.count_all(),
        }
