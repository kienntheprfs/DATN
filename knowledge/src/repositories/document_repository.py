from sqlalchemy import select, update, delete, desc, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from typing import Optional, Sequence, List

from ..models.models import Document, ProcessingStatus, DocumentStatus, Chunk


class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_document(
        self,
        *,
        title: str,
        storage_id: int,
        doc_type: str,
        file_path: str,
        file_size: int,
        checksum: str,
        meta_data: Optional[dict] = None,
    ) -> Document:
        document = Document(
            title=title,
            storage_id=storage_id,
            document_type=doc_type,
            file_path=file_path,
            file_size=file_size,
            checksum=checksum,
            processing_status=ProcessingStatus.PENDING,
            meta_data=meta_data or {},
        )
        self.db.add(document)
        await self.db.flush()
        return document

    async def get_for_ingestion(self, document_id: int) -> Document | None:
        stmt = (
            select(Document)
            .options(joinedload(Document.storage))
            .where(Document.id == document_id)
            .where(Document.status != DocumentStatus.DELETED)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(
        self,
        document_id: int,
        include_deleted: bool = False,
    ) -> Optional[Document]:
        """
        Get document by ID.

        Args:
            document_id: ID of the document
            include_deleted: If True, include DELETED documents.
                            Default False (excludes DELETED).
                            Note: DELETE_PENDING and DELETE_FAILED are always included
                            since they're transitional states.
        """
        query = select(Document).where(Document.id == document_id)

        if not include_deleted:
            # Only exclude permanently deleted documents
            # Keep DELETE_PENDING and DELETE_FAILED for status tracking
            query = query.where(Document.status != DocumentStatus.DELETED)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        storage_id: Optional[int] = None,
        include_deleted: bool = False,
        include_delete_failed: bool = True,
    ) -> Sequence[Document]:
        """
        Get list of documents with optional filtering.

        Args:
            skip: Number of records to skip
            limit: Maximum records to return
            storage_id: Filter by storage
            include_deleted: Include permanently deleted documents
            include_delete_failed: Include documents with delete failures
        """
        query = select(Document)

        if not include_deleted:
            query = query.where(Document.status != DocumentStatus.DELETED)

        if not include_delete_failed:
            query = query.where(Document.status != DocumentStatus.DELETE_FAILED)

        if storage_id:
            query = query.where(Document.storage_id == storage_id)

        query = query.order_by(desc(Document.updated_at)).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def update(self, document_id: int, update_data: dict) -> Optional[Document]:
        query = (
            update(Document)
            .where(Document.id == document_id)
            .values(**update_data)
            .returning(Document)
        )
        result = await self.db.execute(query)
        await self.db.flush()
        return result.scalar_one_or_none()

    async def soft_delete(self, document_id: int) -> bool:
        query = (
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.DELETED)
        )
        result = await self.db.execute(query)
        return result.rowcount > 0

    async def set_delete_pending(self, document_id: int) -> bool:
        """
        Set document status to DELETE_PENDING to indicate deletion in progress.

        This method allows transition from:
        - ACTIVE → DELETE_PENDING (initial deletion request)
        - DELETE_FAILED → DELETE_PENDING (retry after failure)

        Returns:
            True if update succeeded, False if document not found or not in valid state.
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .where(
                Document.status.in_(
                    [
                        DocumentStatus.ACTIVE,
                        DocumentStatus.DELETE_FAILED,  # Allow retry from failed state
                    ]
                )
            )
            .values(
                status=DocumentStatus.DELETE_PENDING,
                deletion_started_at=func.now(),
                deletion_error=None,  # Clear any previous error
            )
        )
        result = await self.db.execute(query)
        return result.rowcount > 0

    async def set_delete_failed(
        self,
        document_id: int,
        error_msg: str,
    ) -> bool:
        """
        Set document status to DELETE_FAILED with error message.

        Args:
            document_id: ID of the document
            error_msg: Error message describing what went wrong

        Returns:
            True if update succeeded, False if document not found.
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .where(
                Document.status.in_(
                    [
                        DocumentStatus.DELETE_PENDING,
                        DocumentStatus.DELETE_FAILED,
                    ]
                )
            )
            .values(
                status=DocumentStatus.DELETE_FAILED,
                deletion_error=error_msg[:1000] if error_msg else None,  # Truncate
            )
        )
        result = await self.db.execute(query)
        return result.rowcount > 0

    async def set_deleted(self, document_id: int) -> bool:
        """
        Set document status to DELETED upon successful completion.

        Returns:
            True if update succeeded, False if document not found.
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .where(Document.status == DocumentStatus.DELETE_PENDING)
            .values(
                status=DocumentStatus.DELETED,
                deletion_completed_at=func.now(),
                deletion_error=None,  # Clear error on success
            )
        )
        result = await self.db.execute(query)
        return result.rowcount > 0

    async def cancel_deletion(self, document_id: int) -> bool:
        """
        Cancel a pending deletion and restore document to ACTIVE status.

        This is useful when:
        - User wants to cancel deletion before it completes
        - Need to retry deletion with fresh state

        Returns:
            True if cancellation succeeded, False if document not in DELETE_PENDING.
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .where(Document.status == DocumentStatus.DELETE_PENDING)
            .values(
                status=DocumentStatus.ACTIVE,
                deletion_error=None,
            )
        )
        result = await self.db.execute(query)
        return result.rowcount > 0

    async def update_processing_status(
        self,
        document_id: int,
        status: ProcessingStatus,
        error_msg: Optional[str] = None,
    ) -> None:
        values: dict = {"processing_status": status}
        if status == ProcessingStatus.PROCESSING:
            values["processing_started_at"] = func.now()
        elif status in (ProcessingStatus.COMPLETED, ProcessingStatus.FAILED):
            values["processing_completed_at"] = func.now()
        if error_msg:
            values["processing_error"] = error_msg
        stmt = update(Document).where(Document.id == document_id).values(**values)
        await self.db.execute(stmt)
        await self.db.flush()

    async def bulk_create_chunks(self, chunks_data: List[dict]) -> None:
        if not chunks_data:
            return
        stmt = pg_insert(Chunk).values(chunks_data)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_document_chunk_index")
        await self.db.execute(stmt)
        await self.db.flush()

    async def delete_chunks_for_document(self, document_id: int) -> None:
        stmt = delete(Chunk).where(Chunk.document_id == document_id)
        await self.db.execute(stmt)
        await self.db.flush()

    async def cleanup_failed_document(self, document_id: int) -> None:
        await self.delete_chunks_for_document(document_id)

    async def get_by_title_and_storage(
        self,
        title: str,
        storage_id: int,
    ) -> Optional[Document]:
        query = (
            select(Document)
            .where(Document.title == title)
            .where(Document.storage_id == storage_id)
            .where(Document.status != DocumentStatus.DELETED)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_checksum_and_storage(
        self,
        checksum: str,
        storage_id: int,
    ) -> Optional[Document]:
        query = (
            select(Document)
            .where(Document.checksum == checksum)
            .where(Document.storage_id == storage_id)
            .where(Document.status != DocumentStatus.DELETED)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
