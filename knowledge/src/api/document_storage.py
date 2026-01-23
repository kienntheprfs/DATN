from typing import List
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.sql_db_setup import get_db
from src.schemas.document_storage import StorageCreate, StorageResponse, StorageUpdate
from src.services.document_storage_service import StorageService

router = APIRouter(prefix="/doc-storages", tags=["Knowledge Base Storages"])

@router.post("/", response_model=StorageResponse, status_code=status.HTTP_201_CREATED)
async def create_storage(
    payload: StorageCreate,
    db: AsyncSession = Depends(get_db)
):
    """Tạo mới một Knowledge Base"""
    service = StorageService(db)
    return await service.create_storage(payload)

@router.get("/", response_model=List[StorageResponse])
async def list_storages(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Lấy danh sách các Knowledge Base"""
    service = StorageService(db)
    return await service.list_storages(skip, limit)

@router.get("/{storage_id}", response_model=StorageResponse)
async def get_storage_detail(
    storage_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Xem chi tiết và Config của một Storage"""
    service = StorageService(db)
    return await service.get_storage(storage_id)

@router.patch("/{storage_id}", response_model=StorageResponse)
async def update_storage(
    storage_id: int,
    payload: StorageUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Cập nhật tên, mô tả hoặc config (chunk size...)"""
    service = StorageService(db)
    return await service.update_storage(storage_id, payload)

@router.delete("/{storage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_storage(
    storage_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Xóa Storage. 
    CẢNH BÁO: Hành động này sẽ xóa toàn bộ Documents thuộc về Storage này (Cascade Delete).
    """
    service = StorageService(db)
    await service.delete_storage(storage_id)
    return None