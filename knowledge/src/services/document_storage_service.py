from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from ..repositories.document_storage_repository import StorageRepository
from ..schemas.document_storage import StorageCreate, StorageUpdate
from ..models.models import DocumentStorage

class StorageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = StorageRepository(db)

    async def create_storage(self, payload: StorageCreate) -> DocumentStorage:
        # Business Logic: Có thể check trùng tên ở đây nếu muốn
        storage = await self.repo.create(payload.model_dump())
        await self.db.commit()
        await self.db.refresh(storage)
        return storage

    async def get_storage(self, storage_id: int) -> DocumentStorage:
        storage = await self.repo.get_by_id(storage_id)
        if not storage:
            raise HTTPException(status_code=404, detail="Storage not found")
        return storage

    async def list_storages(self, skip: int = 0, limit: int = 100) -> List[DocumentStorage]:
        return await self.repo.get_all(skip, limit)

    async def update_storage(self, storage_id: int, payload: StorageUpdate) -> DocumentStorage:
        # Lọc bỏ các field None (user không gửi lên)
        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No data to update")

        updated_storage = await self.repo.update(storage_id, update_data)
        if not updated_storage:
            raise HTTPException(status_code=404, detail="Storage not found")
        
        await self.db.commit()
        await self.db.refresh(updated_storage)
        return updated_storage

    async def delete_storage(self, storage_id: int):
        """
        Lưu ý: Vì trong model DocumentStorage bạn để:
        cascade="all, delete-orphan"
        Nên khi xóa Storage, toàn bộ Documents con sẽ bị xóa theo trong SQL.
        TUY NHIÊN: File vật lý và Vector DB sẽ không tự mất.
        TODO: Cần thêm logic cleanup file/vector ở đây sau này.
        """
        success = await self.repo.delete(storage_id)
        if not success:
            raise HTTPException(status_code=404, detail="Storage not found")
        await self.db.commit()