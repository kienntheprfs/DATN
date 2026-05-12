from typing import Optional, Sequence

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager

from ..models.models import Document, FormalDocument, ProcessingStatus


class FormalDocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        document_id: int,
        lightrag_track_id: str,
        lightrag_doc_id: Optional[str] = None,
    ) -> FormalDocument:
        """Create a new FormalDocument record (extension of Document).

        Args:
            document_id: PK = FK to documents.id (enforces 1-1).
            lightrag_track_id: LightRAG batch-tracking ID returned on upload.
            lightrag_doc_id: LightRAG document ID (available after ingestion).
        """
        doc = FormalDocument(
            document_id=document_id,
            lightrag_track_id=lightrag_track_id,
            lightrag_doc_id=lightrag_doc_id,
        )
        self.db.add(doc)
        await self.db.flush()
        return doc

    async def get_by_id(self, document_id: int) -> Optional[FormalDocument]:
        stmt = (
            select(FormalDocument)
            .where(FormalDocument.document_id == document_id)
            .options(contains_eager(FormalDocument.document))
            .join(FormalDocument.document)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_track_id(self, track_id: str) -> Optional[FormalDocument]:
        stmt = (
            select(FormalDocument)
            .where(FormalDocument.lightrag_track_id == track_id)
            .options(contains_eager(FormalDocument.document))
            .join(FormalDocument.document)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        storage_id: Optional[int] = None,
    ) -> Sequence[FormalDocument]:
        stmt = (
            select(FormalDocument)
            .join(FormalDocument.document)
            .options(contains_eager(FormalDocument.document))
        )
        if storage_id is not None:
            stmt = stmt.where(Document.storage_id == storage_id)

        stmt = stmt.order_by(desc(FormalDocument.updated_at)).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update(
        self, document_id: int, update_data: dict
    ) -> Optional[FormalDocument]:
        stmt = (
            update(FormalDocument)
            .where(FormalDocument.document_id == document_id)
            .values(**update_data)
            .returning(FormalDocument)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.scalar_one_or_none()

    async def update_sync_status(
        self,
        document_id: int,
        status: ProcessingStatus,
        error: Optional[str] = None,
    ) -> Optional[FormalDocument]:
        values: dict = {"sync_status": status}
        if error:
            values["sync_error"] = error
        if status == ProcessingStatus.COMPLETED:
            values["last_synced_at"] = func.now()
            values["sync_status"] = ProcessingStatus.COMPLETED
        stmt = (
            update(FormalDocument)
            .where(FormalDocument.document_id == document_id)
            .values(**values)
            .returning(FormalDocument)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.scalar_one_or_none()

    async def delete(self, document_id: int) -> bool:
        stmt = delete(FormalDocument).where(FormalDocument.document_id == document_id)
        result = await self.db.execute(stmt)
        return result.rowcount > 0
