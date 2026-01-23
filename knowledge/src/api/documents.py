from fastapi import APIRouter, UploadFile, File, Form, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.sql_db_setup import get_db
from src.services.storage import StorageService
from src.services.document_service import DocumentService
from src.workers.tasks import background_index_document
from ..models.models import Document, DocumentVersion, DocumentType, ProcessingStatus
import uuid
router = APIRouter(prefix="/documents", tags=["Documents"])

# CHECK for good practices
@router.post("/upload", status_code=202)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    storage_id: int = Form(...),
    db: AsyncSession = Depends(get_db)
):
    service = DocumentService(db)

    version = await service.upload_document(
        file=file,
        title=title,
        storage_id=storage_id
    )

    background_tasks.add_task(
        background_index_document,
        version.id
    )

    return {
        "status": "queued",
        "document_id": version.document_id,
        "version_id": version.id
    }