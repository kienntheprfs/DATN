from fastapi import APIRouter, UploadFile, File, Form, Depends, BackgroundTasks, Query, Path, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from src.core.sql_db_setup import get_db
from src.services.local_storage import StorageService
from src.services.document_service import DocumentService
from src.workers.tasks import background_index_document
from ..schemas.document import DocumentDetailResponse, DocumentResponse, DocumentUpdate
from ..models.models import Document, DocumentVersion, DocumentType, ProcessingStatus
from src.workers.celery_tasks import trigger_ingestion_pipeline
import uuid
router = APIRouter(prefix="/documents", tags=["Documents"])

# CHECK for good practices
@router.post("/upload", status_code=202)
async def upload_document(
    # Bỏ BackgroundTasks vì ta dùng Celery
    file: UploadFile = File(...),
    storage_id: int = Form(...),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)

    # 1. Upload lên file storage và Lưu Metadata vào DB
    # Lưu ý: Hàm này BẮT BUỘC phải commit DB xong xuôi mới được trigger Celery
    version = await service.upload_document(
        file=file,
        storage_id=storage_id
    )

    # 2. Trigger Celery Pipeline
    # Hàm trigger_ingestion_pipeline trả về AsyncResult (chứa task_id)
    task_result = trigger_ingestion_pipeline(version.id)

    return {
        "status": "queued",
        "document_id": version.document_id,
        "version_id": version.id,
        "task_id": task_result.id # Trả về ID để tracking nếu cần
    }

# @router.post("/upload", status_code=202)
# async def upload_document(
#     background_tasks: BackgroundTasks,
#     file: UploadFile = File(...),
#     storage_id: int = Form(...),
#     db: AsyncSession = Depends(get_db)
# ):
#     service = DocumentService(db)

#     version = await service.upload_document(
#         file=file,
#         storage_id=storage_id
#     )

#     background_tasks.add_task(
#         background_index_document,
#         version.id
#     )

#     return {
#         "status": "queued",
#         "document_id": version.document_id,
#         "version_id": version.id
#     }

@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    storage_id: Optional[int] = Query(None, description="Filter by Storage ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of documents with pagination and filtering.
    """
    service = DocumentService(db)
    return await service.list_documents(skip=skip, limit=limit, storage_id=storage_id)

@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document_detail(
    document_id: int = Path(..., title="The ID of the document to get"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed information about a specific document, including version history.
    """
    service = DocumentService(db)
    return await service.get_document(document_id)

@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    payload: DocumentUpdate,
    document_id: int = Path(..., title="The ID of the document to update"),
    db: AsyncSession = Depends(get_db)
):
    """
    Update document metadata (Title, Status, etc.).
    Note: To update the file content, use the Upload API (it creates a new version).
    """
    service = DocumentService(db)
    return await service.update_document(document_id, payload)

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int = Path(..., title="The ID of the document to delete"),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft delete a document (change status to DELETED).
    """
    service = DocumentService(db)
    await service.delete_document(document_id)
    return # 204 No Content returns nothing