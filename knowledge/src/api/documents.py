from fastapi import APIRouter, UploadFile, File, Form, Depends, Query, Path, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from src.core.sql_db_setup import get_db
from src.services.document_service import DocumentService
from ..schemas.document import DocumentDetailResponse, DocumentResponse, DocumentUpdate
from ..schemas.formal_document import FormalDocumentResponse, FormalDocumentUpdate
from src.workers.celery_tasks import trigger_ingestion_pipeline
router = APIRouter(prefix="/documents", tags=["Documents"])

# CHECK for good practices
@router.post("/upload", status_code=202)
async def upload_document(
    # Bỏ BackgroundTasks vì ta dùng Celery
    file: UploadFile = File(...),
    storage_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
    auto_generate_faq: bool = Form(False),
    is_formal_doc: bool = Form(False)
):
    service = DocumentService(db)

    if not is_formal_doc:
        # 1. Upload lên file storage và Lưu Metadata vào DB
        # Lưu ý: Hàm này BẮT BUỘC phải commit DB xong xuôi mới được trigger Celery
        version = await service.upload_normal_document(
            file=file,
            storage_id=storage_id
        )

        # 2. Trigger Celery Pipeline
        # Hàm trigger_ingestion_pipeline trả về AsyncResult (chứa task_id)
        task_result = trigger_ingestion_pipeline(version.id, auto_generate_faq)

        return {
            "status": "queued",
            "document_id": version.document_id,
            "version_id": version.id,
            "task_id": task_result.id # Trả về ID để tracking nếu cần
        }
    else:
        formal_doc = await service.upload_formal_document(
            file=file,
            storage_id=storage_id
        )
        return {
            "status": "queued",
            "document_id": formal_doc.id,
            "track_id": formal_doc.lightrag_track_id,
            "lightrag_doc_id": formal_doc.lightrag_doc_id
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

@router.get("/formal-documents", response_model=List[FormalDocumentResponse])
async def list_formal_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    storage_id: Optional[int] = Query(None, description="Filter by Storage ID"),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)
    return await service.list_formal_documents(skip=skip, limit=limit, storage_id=storage_id)


@router.get("/formal-documents/{document_id}", response_model=FormalDocumentResponse)
async def get_formal_document_detail(
    document_id: int = Path(..., title="The ID of the formal document to get"),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)
    return await service.get_formal_document(document_id)


@router.patch("/formal-documents/{document_id}", response_model=FormalDocumentResponse)
async def update_formal_document(
    payload: FormalDocumentUpdate,
    document_id: int = Path(..., title="The ID of the formal document to update"),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)
    return await service.update_formal_document(document_id, payload)


@router.post("/formal-documents/{document_id}/sync", response_model=FormalDocumentResponse)
async def sync_formal_document(
    document_id: int = Path(..., title="The ID of the formal document to sync from track_id"),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)
    return await service.sync_formal_document_by_track(document_id)



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
    is_formal_doc: Optional[bool] = Query(None, description="If null, auto-detect by ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft delete a document (change status to DELETED).
    """
    service = DocumentService(db)
    if is_formal_doc is True:
        await service.delete_formal_document(document_id)
        return
    if is_formal_doc is False:
        await service.delete_document(document_id)
        return

    normal_doc = await service.doc_repo.get_by_id(document_id)
    formal_doc = await service.formal_doc_repo.get_by_id(document_id)
    if normal_doc and formal_doc:
        raise HTTPException(
            status_code=409,
            detail="Ambiguous document id. Please set is_formal_doc=true/false explicitly.",
        )
    if formal_doc:
        await service.delete_formal_document(document_id)
    elif normal_doc:
        await service.delete_document(document_id)
    else:
        raise HTTPException(status_code=404, detail="Document not found")
    return # 204 No Content returns nothing

