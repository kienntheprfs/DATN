from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Form,
    Depends,
    Query,
    Path,
    status,
    HTTPException,
)
import asyncio
import json
import re
import unicodedata
from urllib.parse import quote
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from src.core.sql_db_setup import get_db
from src.services.document_service import DocumentService
from ..schemas.document import (
    AdminDocumentListResponse,
    DocumentDetailResponse,
    DocumentResponse,
    DocumentUpdate,
)
from ..schemas.formal_document import FormalDocumentResponse, FormalDocumentUpdate
from src.workers.celery_tasks import (
    trigger_ingestion_pipeline,
    trigger_document_deletion,
    trigger_formal_document_deletion,
)

router = APIRouter(prefix="/documents", tags=["Documents"])


# CHECK for good practices
@router.post("/upload", status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    storage_id: int = Form(2),
    db: AsyncSession = Depends(get_db),
    auto_generate_faq: bool = Form(False),
    is_formal_doc: bool = Form(False),
    meta_data_json: Optional[str] = Form(None),
):
    service = DocumentService(db)
    meta_data: Optional[dict] = None
    if meta_data_json:
        try:
            parsed = json.loads(meta_data_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid meta_data_json") from exc
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="meta_data_json must be a JSON object")
        meta_data = parsed

    if not is_formal_doc:
        document = await service.upload_normal_document(
            file=file,
            storage_id=storage_id,
            meta_data=meta_data,
        )

        task_result = trigger_ingestion_pipeline(document.id, auto_generate_faq)

        return {
            "status": "queued",
            "document_id": document.id,
            "task_id": task_result.id,
            "is_formal_doc": False,
        }
    else:
        formal_doc, sync_task_id = await service.upload_formal_document(
            file=file,
            storage_id=storage_id,
            meta_data=meta_data,
        )
        return {
            "status": "queued",
            "document_id": formal_doc.id,
            "track_id": formal_doc.lightrag_track_id,
            "lightrag_doc_id": formal_doc.lightrag_doc_id,
            "sync_task_id": sync_task_id,
            "is_formal_doc": True,
            "meta_data": formal_doc.meta_data,
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
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    return await service.list_formal_documents(
        skip=skip, limit=limit, storage_id=storage_id
    )


@router.get("/formal-documents/{document_id}", response_model=FormalDocumentResponse)
async def get_formal_document_detail(
    document_id: int = Path(..., title="The ID of the formal document to get"),
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    return await service.get_formal_document(document_id)


@router.patch("/formal-documents/{document_id}", response_model=FormalDocumentResponse)
async def update_formal_document(
    payload: FormalDocumentUpdate,
    document_id: int = Path(..., title="The ID of the formal document to update"),
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    return await service.update_formal_document(document_id, payload)


@router.post(
    "/formal-documents/{document_id}/sync", response_model=FormalDocumentResponse
)
async def sync_formal_document(
    document_id: int = Path(
        ..., title="The ID of the formal document to sync from track_id"
    ),
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    return await service.sync_formal_document_by_track(document_id)


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    storage_id: Optional[int] = Query(None, description="Filter by Storage ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get list of documents with pagination and filtering.
    """
    service = DocumentService(db)
    return await service.list_documents(skip=skip, limit=limit, storage_id=storage_id)


@router.get("/admin/list", response_model=AdminDocumentListResponse)
async def list_admin_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    year: Optional[int] = Query(None, ge=1900, le=3000),
    unit: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None),
    document_kind: Optional[str] = Query(
        None,
        description="Deprecated alias for document_type",
    ),
    is_formal_doc: Optional[bool] = Query(None),
    storage_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    return await service.list_admin_documents(
        page=page,
        page_size=page_size,
        search=search,
        year=year,
        unit=unit,
        document_type=document_type or document_kind,
        is_formal_doc=is_formal_doc,
        storage_id=storage_id,
    )


@router.get("/{document_id}/file")
async def stream_document_file(
    document_id: int = Path(..., title="The ID of the document file to stream"),
    is_formal_doc: Optional[bool] = Query(
        None,
        description="If null, auto-detect by ID",
    ),
    download: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    service = DocumentService(db)
    file_key, file_name, media_type, _ = await service.resolve_document_file(
        document_id=document_id,
        is_formal_doc=is_formal_doc,
    )

    async def iter_file():
        async with service.storage.download_stream(file_key) as file_obj:
            while True:
                chunk = await asyncio.to_thread(file_obj.read, 1024 * 1024)
                if not chunk:
                    break
                yield chunk

    disposition_type = "attachment" if download else "inline"
    normalized_name = unicodedata.normalize("NFKD", file_name)
    ascii_name = normalized_name.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", ascii_name).strip("._")
    if not ascii_name:
        ascii_name = f"document-{document_id}"

    encoded_name = quote(file_name, safe="")
    content_disposition = (
        f"{disposition_type}; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded_name}"
    )
    headers = {"Content-Disposition": content_disposition}
    return StreamingResponse(iter_file(), media_type=media_type, headers=headers)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
async def get_document_detail(
    document_id: int = Path(..., title="The ID of the document to get"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a single document record (file + processing state on the same row).
    """
    service = DocumentService(db)
    return await service.get_document(document_id)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    payload: DocumentUpdate,
    document_id: int = Path(..., title="The ID of the document to update"),
    db: AsyncSession = Depends(get_db),
):
    """
    Update document metadata (title, status, meta_data).
    Replacing the binary file is not modeled as a separate version; upload a new document if needed.
    """
    service = DocumentService(db)
    return await service.update_document(document_id, payload)


@router.delete("/{document_id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_document(
    document_id: int = Path(..., title="The ID of the document to delete"),
    is_formal_doc: Optional[bool] = Query(
        None, description="If null, auto-detect by ID"
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a document asynchronously via Celery task.

    This endpoint:
    1. Sets document status to DELETE_PENDING (immediate)
    2. Triggers Celery task for background deletion
    3. Returns immediately with task ID for tracking

    Document status flow:
    - ACTIVE → DELETE_PENDING (when API called)
    - DELETE_PENDING → DELETED (on success)
    - DELETE_PENDING → DELETE_FAILED (on failure, can retry)

    Deletion includes:
    - Deleting vectors from Qdrant
    - Deleting chunk metadata from PostgreSQL
    - Soft-deleting the document record
    - Deleting the file from storage (if applicable)
    - Invalidating semantic cache

    To check deletion status:
    - GET /documents/{id} - Check status field and deletion_error field
    - Status "delete_pending" = deletion in progress
    - Status "deleted" = deletion completed
    - Status "delete_failed" = deletion failed (see deletion_error for details)

    To retry a failed deletion:
    - Call DELETE /documents/{id} again

    Returns:
        202 Accepted with document_id and task_id for tracking
    """
    service = DocumentService(db)

    # Import here to avoid circular import
    from src.models.models import DocumentStatus, ProcessingStatus

    # Detect document type if not explicitly specified
    if is_formal_doc is True:
        # Explicit formal document deletion
        formal_doc = await service.formal_doc_repo.get_by_id(document_id)
        if not formal_doc:
            raise HTTPException(status_code=404, detail="Formal document not found")

        if formal_doc.lightrag_track_id and service.lightrag.enabled:
            try:
                track_result = await service.lightrag.get_track_result(formal_doc.lightrag_track_id)
                if isinstance(track_result, dict):
                    status_summary = track_result.get("status_summary", {})
                    if status_summary.get("Processing", 0) > 0 or status_summary.get("Pending", 0) > 0:
                        raise HTTPException(
                            status_code=409,
                            detail="Cannot delete formal document while it is being processed in LightRAG. Please wait until processing completes."
                        )
            except HTTPException:
                raise
            except Exception:
                pass

        # Sync from LightRAG to get latest status
        try:
            await service._sync_formal_doc_from_lightrag(formal_doc)
        except Exception:
            pass  # Proceed with deletion even if sync fails

        task = trigger_formal_document_deletion(
            document_id=document_id,
            lightrag_doc_id=formal_doc.lightrag_doc_id,
            storage_id=formal_doc.storage_id,
            storage_path=formal_doc.file_path,
        )

        return {
            "status": "queued",
            "message": "Formal document deletion queued",
            "document_id": document_id,
            "task_id": task.id,
        }

    if is_formal_doc is False:
        # Explicit normal document deletion
        normal_doc = await service.doc_repo.get_by_id(document_id)
        if not normal_doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Check current status
        if normal_doc.processing_status in [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING]:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete document while it is being processed. Please wait until processing completes."
            )

        if normal_doc.status == DocumentStatus.DELETED:
            raise HTTPException(
                status_code=400, detail="Document has already been deleted"
            )

        if normal_doc.status == DocumentStatus.DELETE_PENDING:
            raise HTTPException(
                status_code=409,
                detail="Document deletion is already in progress. "
                "Please wait or check the current status.",
            )

        # Prepare message based on previous status
        is_retry = normal_doc.status == DocumentStatus.DELETE_FAILED
        previous_error = normal_doc.deletion_error if is_retry else None

        # Set status to DELETE_PENDING before triggering task
        collection_name = f"kb_{normal_doc.storage_id}"
        updated = await service.doc_repo.set_delete_pending(document_id)

        if not updated:
            # Document may have been modified concurrently
            raise HTTPException(
                status_code=409, detail="Document status changed. Please retry."
            )

        # Commit the status change immediately
        await db.commit()

        task = trigger_document_deletion(
            document_id=document_id,
            collection_name=collection_name,
            storage_id=normal_doc.storage_id,
            storage_path=normal_doc.file_path,
        )

        response = {
            "status": "queued",
            "message": "Document deletion queued",
            "document_id": document_id,
            "task_id": task.id,
            "current_status": "delete_pending",
        }

        if is_retry:
            response["message"] = (
                "Document deletion queued (retry after previous failure)"
            )
            response["previous_error"] = previous_error

        return response

    # Auto-detect: check both tables
    normal_doc = await service.doc_repo.get_by_id(document_id)
    formal_doc = await service.formal_doc_repo.get_by_id(document_id)

    if normal_doc and formal_doc:
        raise HTTPException(
            status_code=409,
            detail="Ambiguous document id. Please set is_formal_doc=true/false explicitly.",
        )
    if formal_doc:
        if formal_doc.lightrag_track_id and service.lightrag.enabled:
            try:
                track_result = await service.lightrag.get_track_result(formal_doc.lightrag_track_id)
                if isinstance(track_result, dict):
                    status_summary = track_result.get("status_summary", {})
                    if status_summary.get("Processing", 0) > 0 or status_summary.get("Pending", 0) > 0:
                        raise HTTPException(
                            status_code=409,
                            detail="Cannot delete formal document while it is being processed in LightRAG. Please wait until processing completes."
                        )
            except HTTPException:
                raise
            except Exception:
                pass

        # Sync from LightRAG to get latest status
        try:
            await service._sync_formal_doc_from_lightrag(formal_doc)
        except Exception:
            pass

        task = trigger_formal_document_deletion(
            document_id=document_id,
            lightrag_doc_id=formal_doc.lightrag_doc_id,
            storage_id=formal_doc.storage_id,
            storage_path=formal_doc.file_path,
        )

        return {
            "status": "queued",
            "message": "Formal document deletion queued (auto-detected)",
            "document_id": document_id,
            "task_id": task.id,
        }
    elif normal_doc:
        # Same logic as explicit normal doc deletion
        if normal_doc.processing_status in [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING]:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete document while it is being processed. Please wait until processing completes."
            )

        if normal_doc.status == DocumentStatus.DELETED:
            raise HTTPException(
                status_code=400, detail="Document has already been deleted"
            )

        if normal_doc.status == DocumentStatus.DELETE_PENDING:
            raise HTTPException(
                status_code=409, detail="Document deletion is already in progress."
            )

        # Check if this is a retry after previous failure
        is_retry = normal_doc.status == DocumentStatus.DELETE_FAILED
        previous_error = normal_doc.deletion_error if is_retry else None

        collection_name = f"kb_{normal_doc.storage_id}"
        updated = await service.doc_repo.set_delete_pending(document_id)

        if not updated:
            raise HTTPException(
                status_code=409, detail="Document status changed. Please retry."
            )

        await db.commit()

        task = trigger_document_deletion(
            document_id=document_id,
            collection_name=collection_name,
            storage_id=normal_doc.storage_id,
            storage_path=normal_doc.file_path,
        )

        response = {
            "status": "queued",
            "message": "Document deletion queued (auto-detected)",
            "document_id": document_id,
            "task_id": task.id,
            "current_status": "delete_pending",
        }

        if is_retry:
            response["message"] = (
                "Document deletion queued (retry after previous failure)"
            )
            response["previous_error"] = previous_error

        return response
    else:
        raise HTTPException(status_code=404, detail="Document not found")
