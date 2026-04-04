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
    ) -> Document:
        document = Document(
            title=title,
            storage_id=storage_id,
            document_type=doc_type,
            file_path=file_path,
            file_size=file_size,
            checksum=checksum,
            processing_status=ProcessingStatus.PENDING,
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

    async def get_by_id(self, document_id: int) -> Optional[Document]:
        query = (
            select(Document)
            .where(Document.id == document_id)
            .where(Document.status != DocumentStatus.DELETED)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        storage_id: Optional[int] = None,
    ) -> Sequence[Document]:
        query = select(Document).where(Document.status != DocumentStatus.DELETED)
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
        stmt = (
            update(Document).where(Document.id == document_id).values(**values)
        )
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
