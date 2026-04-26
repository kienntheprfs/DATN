from typing import Optional, Sequence

from sqlalchemy import delete, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.models import FormalDocument


class FormalDocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        storage_id: int,
        file_path: str,
        lightrag_track_id: str,
        lightrag_doc_id: Optional[str] = None,
        meta_data: Optional[dict] = None,
    ) -> FormalDocument:
        doc = FormalDocument(
            storage_id=storage_id,
            file_path=file_path,
            lightrag_track_id=lightrag_track_id,
            lightrag_doc_id=lightrag_doc_id,
            meta_data=meta_data or {},
        )
        self.db.add(doc)
        await self.db.flush()
        return doc

    async def get_by_id(self, document_id: int) -> Optional[FormalDocument]:
        stmt = select(FormalDocument).where(FormalDocument.id == document_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_track_id(self, track_id: str) -> Optional[FormalDocument]:
        stmt = select(FormalDocument).where(FormalDocument.lightrag_track_id == track_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        skip: int = 0,
        limit: int = 20,
        storage_id: Optional[int] = None,
    ) -> Sequence[FormalDocument]:
        stmt = select(FormalDocument)
        if storage_id:
            stmt = stmt.where(FormalDocument.storage_id == storage_id)

        stmt = stmt.order_by(desc(FormalDocument.updated_at)).offset(skip).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update(self, document_id: int, update_data: dict) -> Optional[FormalDocument]:
        stmt = (
            update(FormalDocument)
            .where(FormalDocument.id == document_id)
            .values(**update_data)
            .returning(FormalDocument)
        )
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.scalar_one_or_none()

    async def delete(self, document_id: int) -> bool:
        stmt = delete(FormalDocument).where(FormalDocument.id == document_id)
        result = await self.db.execute(stmt)
        return result.rowcount > 0

