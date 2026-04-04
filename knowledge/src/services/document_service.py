import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.vector_db_setup import QdrantManager
from .file_storage import get_storage
from .lightrag_service import LightRAGService
from .validator import validate_upload_file
from .vector_db import VectorDBService
from ..models.models import Document
from ..repositories.document_repository import DocumentRepository
from ..repositories.formal_document_repository import FormalDocumentRepository
from ..schemas.document import DocumentUpdate
from ..schemas.formal_document import FormalDocumentUpdate, FormalDocumentResponse

logger = logging.getLogger(__name__)


class DocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = get_storage()
        self.doc_repo = DocumentRepository(db)
        self.formal_doc_repo = FormalDocumentRepository(db)
        self.lightrag = LightRAGService()

    async def store_raw_document(
        self,
        document_id: int,
        file,
        content_type: str,
        filename: str,
    ) -> str:
        key = f"raw/documents/{document_id}/{filename}"
        file.seek(0)
        return await self.storage.upload(
            key=key,
            file_obj=file,
            content_type=content_type,
        )

    async def compute_checksum(self, file: UploadFile) -> str:
        hasher = hashlib.sha256()
        await file.seek(0)
        while chunk := await file.read(8192):
            hasher.update(chunk)
        await file.seek(0)
        return hasher.hexdigest()

    async def upload_normal_document(
        self,
        file: UploadFile,
        storage_id: int,
    ) -> Document:
        doc_type = validate_upload_file(file)
        filename = Path(file.filename).name
        file_path = None

        try:
            checksum = await self.compute_checksum(file)
            
            file_size = file.size
            await file.seek(0)

            document = await self.doc_repo.create_document(
                title=filename,
                storage_id=storage_id,
                doc_type=doc_type,
                file_path="__pending__",
                file_size=file_size,
                checksum=checksum,
            )

            file_path = await self.store_raw_document(
                document_id=document.id,
                file=file.file,
                content_type=doc_type,
                filename=filename,
            )

            await self.doc_repo.update(
                document.id,
                {"file_path": file_path, "file_size": file_size},
            )
            await self.db.commit()
            await self.db.refresh(document)
            document.file_path = file_path
            return document

        except Exception as e:
            await self.db.rollback()
            if file_path:
                try:
                    await self.storage.delete(file_path)
                except Exception:
                    pass
            logger.error(f"Error uploading document: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to upload document processing",
            )

    async def upload_formal_document(self, file: UploadFile, storage_id: int):
        doc_type = validate_upload_file(file)
        filename = Path(file.filename).name
        file_path = None

        try:
            if not self.lightrag.enabled:
                raise HTTPException(status_code=500, detail="LightRAG is not configured")

            await file.seek(0)
            upload_result = await self.lightrag.upload_document(
                filename=filename,
                file_obj=file.file,
                content_type=doc_type,
            )
            track_id = upload_result.get("track_id")

            if not track_id:
                raise HTTPException(status_code=502, detail="LightRAG response missing track_id")

            track_id = str(track_id)

            existing = await self.formal_doc_repo.get_by_track_id(track_id)
            if existing:
                return existing

            s3_key = f"raw/formal/{track_id}/{filename}"
            file.file.seek(0)
            file_path = await self.storage.upload(
                key=s3_key,
                file_obj=file.file,
                content_type=doc_type,
            )

            formal_doc = await self.formal_doc_repo.create(
                storage_id=storage_id,
                file_path=file_path,
                lightrag_track_id=track_id,
                lightrag_doc_id=str(upload_result.get("doc_id"))
                if upload_result.get("doc_id")
                else None,
            )
            await self.db.commit()
            await self.db.refresh(formal_doc)
            return formal_doc
        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as e:
            await self.db.rollback()
            if file_path:
                await self.storage.delete(file_path)
            logger.error(f"Error uploading formal document: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to upload formal document")

    async def get_document(self, document_id: int):
        doc = await self.doc_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        return doc

    async def list_documents(
        self,
        skip: int,
        limit: int,
        storage_id: Optional[int],
    ):
        return await self.doc_repo.get_list(skip, limit, storage_id)

    async def update_document(self, document_id: int, data: DocumentUpdate):
        current_doc = await self.doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Document not found")

        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return current_doc

        updated_doc = await self.doc_repo.update(document_id, update_data)
        await self.db.commit()
        await self.db.refresh(updated_doc)
        return updated_doc

    async def delete_document(self, document_id: int):
        current_doc = await self.doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Document not found")

        collection_name = f"kb_{current_doc.storage_id}"
        vector_db = VectorDBService(QdrantManager.get_client(), collection_name)
        try:
            if await vector_db.collection_exists():
                await vector_db.delete_vectors_by_document(document_id)
        except Exception as e:
            logger.warning(
                "Failed to delete Qdrant vectors for document %s in %s: %s",
                document_id,
                collection_name,
                e,
            )

        await self.doc_repo.delete_chunks_for_document(document_id)
        await self.doc_repo.soft_delete(document_id)
        await self.db.commit()
        return {"message": "Document deleted successfully"}

    async def get_formal_document(self, document_id: int):
        doc = await self.formal_doc_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Formal document not found")
        doc = await self._sync_formal_doc_from_lightrag(doc)
        return await self._build_formal_response(doc)

    async def list_formal_documents(
        self, skip: int, limit: int, storage_id: Optional[int]
    ):
        docs = await self.formal_doc_repo.get_list(
            skip=skip, limit=limit, storage_id=storage_id
        )
        if not docs:
            return docs

        synced_docs = await asyncio.gather(
            *[self._sync_formal_doc_from_lightrag(doc) for doc in docs],
            return_exceptions=True,
        )

        result_docs = []
        for idx, item in enumerate(synced_docs):
            if isinstance(item, Exception):
                result_docs.append(docs[idx])
            else:
                result_docs.append(item)

        responses = await asyncio.gather(
            *[self._build_formal_response(d, include_documents=False) for d in result_docs],
            return_exceptions=True,
        )
        final: list[FormalDocumentResponse] = []
        for idx, item in enumerate(responses):
            if isinstance(item, Exception):
                final.append(
                    await self._build_formal_response(
                        result_docs[idx], include_documents=False, skip_remote=True
                    )
                )
            else:
                final.append(item)
        return final

    async def update_formal_document(
        self, document_id: int, data: FormalDocumentUpdate
    ):
        current_doc = await self.formal_doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Formal document not found")

        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return current_doc

        updated_doc = await self.formal_doc_repo.update(document_id, update_data)
        await self.db.commit()
        await self.db.refresh(updated_doc)
        return updated_doc

    async def delete_formal_document(self, document_id: int):
        current_doc = await self.formal_doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Formal document not found")

        current_doc = await self._sync_formal_doc_from_lightrag(current_doc)

        if current_doc.lightrag_doc_id and self.lightrag.enabled:
            try:
                await self.lightrag.delete_document(current_doc.lightrag_doc_id)
            except Exception as e:
                logger.warning(
                    f"Failed to delete LightRAG doc {current_doc.lightrag_doc_id}: {str(e)}"
                )

        if current_doc.file_path:
            try:
                await self.storage.delete(current_doc.file_path)
            except Exception as e:
                logger.warning(
                    f"Failed to delete storage file {current_doc.file_path}: {str(e)}"
                )

        await self.formal_doc_repo.delete(document_id)
        await self.db.commit()
        return {"message": "Formal document deleted successfully"}

    async def sync_formal_document_by_track(self, document_id: int):
        doc = await self.formal_doc_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Formal document not found")
        doc = await self._sync_formal_doc_from_lightrag(doc)
        return await self._build_formal_response(doc)

    async def _build_formal_response(
        self,
        doc,
        include_documents: bool = True,
        skip_remote: bool = False,
    ) -> FormalDocumentResponse:
        base = {
            "id": doc.id,
            "storage_id": doc.storage_id,
            "file_path": doc.file_path,
            "lightrag_track_id": doc.lightrag_track_id,
            "lightrag_doc_id": doc.lightrag_doc_id,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
        }
        if skip_remote or not self.lightrag.enabled:
            return FormalDocumentResponse.model_validate(base)

        track_result = await self.lightrag.get_track_result(doc.lightrag_track_id)
        if isinstance(track_result, dict):
            base["lightrag_status_summary"] = track_result.get("status_summary")
            base["lightrag_total_count"] = track_result.get("total_count")
            if include_documents:
                base["lightrag_documents"] = track_result.get("documents")
        return FormalDocumentResponse.model_validate(base)

    async def _sync_formal_doc_from_lightrag(self, doc):
        if not doc.lightrag_track_id:
            return doc
        if not self.lightrag.enabled:
            raise HTTPException(status_code=500, detail="LightRAG is not configured")

        track_result = await self.lightrag.get_track_result(doc.lightrag_track_id)
        documents = (
            track_result.get("documents", []) if isinstance(track_result, dict) else []
        )
        inferred_doc_id = None
        if documents:
            first_doc = documents[0]
            inferred_doc_id = first_doc.get("id")
        update_data = {}
        if inferred_doc_id:
            update_data["lightrag_doc_id"] = str(inferred_doc_id)

        if not update_data:
            return doc
        updated_doc = await self.formal_doc_repo.update(doc.id, update_data)
        await self.db.commit()
        await self.db.refresh(updated_doc)
        return updated_doc
