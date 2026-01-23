from typing import List, Optional
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.models import DocumentStorage

class StorageRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, storage_data: dict) -> DocumentStorage:
        storage = DocumentStorage(**storage_data)
        self.db.add(storage)
        await self.db.flush() # Lấy ID nhưng chưa commit transaction cha
        return storage

    async def get_by_id(self, storage_id: int) -> Optional[DocumentStorage]:
        query = select(DocumentStorage).where(DocumentStorage.id == storage_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(self, skip: int = 0, limit: int = 100) -> List[DocumentStorage]:
        query = select(DocumentStorage).offset(skip).limit(limit).order_by(DocumentStorage.created_at.desc())
        result = await self.db.execute(query)
        return result.scalars().all()

    async def update(self, storage_id: int, update_data: dict) -> Optional[DocumentStorage]:
        # Dùng ORM Update để return object sau khi update
        # exclude_unset=True đã được xử lý ở Service/Schema trước khi truyền vào đây
        query = (
            update(DocumentStorage)
            .where(DocumentStorage.id == storage_id)
            .values(**update_data)
            .returning(DocumentStorage)
        )
        result = await self.db.execute(query)
        # Lưu ý: cần flush hoặc commit ở Service
        return result.scalar_one_or_none()

    async def delete(self, storage_id: int) -> bool:
        query = delete(DocumentStorage).where(DocumentStorage.id == storage_id)
        result = await self.db.execute(query)
        return result.rowcount > 0