import asyncio
import hashlib
import io
import logging
import math
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import contains_eager, joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.vector_db_setup import QdrantManager
from .file_storage import get_storage
from .ingestion import IngestionService
from .lightrag_service import LightRAGService
from .validator import validate_upload_file
from .vector_db import VectorDBService
from ..models.models import Document
from ..models.models import DocumentStatus, FormalDocument, ProcessingStatus
from ..repositories.document_repository import DocumentRepository
from ..repositories.formal_document_repository import FormalDocumentRepository
from ..schemas.document import (
    AdminDocumentListResponse,
    AdminDocumentListItem,
    DocumentDetailResponse,
    DocumentResponse,
    DocumentUpdate,
)
from ..schemas.formal_document import FormalDocumentUpdate, FormalDocumentResponse
from .semantic_cache_notifier import semantic_cache_notifier

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
        meta_data: Optional[dict[str, Any]] = None,
    ) -> Document:
        doc_type = validate_upload_file(file)
        filename = Path(file.filename).name
        file_path = None

        try:
            checksum = await self.compute_checksum(file)

            existing_by_title = await self.doc_repo.get_by_title_and_storage(
                title=filename,
                storage_id=storage_id,
            )
            if existing_by_title:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "reason": "duplicate_name",
                        "message": f"A document with the name '{filename}' already exists in this storage.",
                        "existing_document_id": existing_by_title.id,
                        "existing_title": existing_by_title.title,
                        "existing_created_at": existing_by_title.created_at.isoformat()
                        if existing_by_title.created_at
                        else None,
                    },
                )

            existing_by_checksum = await self.doc_repo.get_by_checksum_and_storage(
                checksum=checksum,
                storage_id=storage_id,
            )
            if existing_by_checksum:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "reason": "duplicate_content",
                        "message": "A document with identical content already exists in this storage.",
                        "existing_document_id": existing_by_checksum.id,
                        "existing_title": existing_by_checksum.title,
                        "existing_created_at": existing_by_checksum.created_at.isoformat()
                        if existing_by_checksum.created_at
                        else None,
                    },
                )

            file_size = file.size
            await file.seek(0)

            document = await self.doc_repo.create_document(
                title=filename,
                storage_id=storage_id,
                doc_type=doc_type,
                file_path="__pending__",
                file_size=file_size,
                checksum=checksum,
                meta_data=meta_data,
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

        except HTTPException:
            await self.db.rollback()
            raise
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

    async def upload_formal_document(
        self,
        file: UploadFile,
        storage_id: int,
        meta_data: Optional[dict[str, Any]] = None,
    ) -> Tuple[FormalDocument, Document, Optional[str]]:
        """Upload a formal document and index it in both LightRAG and Qdrant.

        Strategy (dual-index):
        1. Validate file and derive metadata.
        2. Read entire file content into memory (avoids closed-file issues with httpx).
        3. Send file to LightRAG → receive track_id.
        4. Upload raw file to object storage (S3/local).
        5. Create a standard ``Document`` record that drives the Qdrant ingestion
           pipeline (same flow as a normal document upload).
        6. Create a ``FormalDocument`` record linked to the ``Document`` above.
        7. Commit the transaction.
        8. Schedule two background tasks concurrently:
           - ``trigger_ingestion_pipeline`` → embed & upsert to Qdrant.
           - ``trigger_formal_doc_sync``    → poll LightRAG for the doc_id.
        9. Return (formal_doc, document, sync_task_id).

        Returns:
            Tuple of (FormalDocument, Document, sync_task_id).
            ``sync_task_id`` is None when LightRAG returned a doc_id immediately.
        """
        doc_type = validate_upload_file(file)
        filename = Path(file.filename).name
        file_path = None

        try:
            if not self.lightrag.enabled:
                raise HTTPException(
                    status_code=500, detail="LightRAG is not configured"
                )

            # ------------------------------------------------------------------ #
            # Step 0: Read entire file content once into memory                  #
            # ------------------------------------------------------------------ #
            await file.seek(0)
            raw_bytes = await file.read()
            file_size = len(raw_bytes)

            # ------------------------------------------------------------------ #
            # Step 0.5: Detect scanned PDF — pre-parse with LlamaParse           #
            # ------------------------------------------------------------------ #
            is_scanned_pdf = False
            parsed_text = None
            if doc_type == "pdf":
                import fitz

                pdf_doc = fitz.open(stream=raw_bytes, filetype="pdf")
                total_text = sum(len(page.get_text().strip()) for page in pdf_doc)
                pdf_doc.close()

                if total_text == 0:
                    is_scanned_pdf = True
                    ingestion = IngestionService()
                    parsed_text = ingestion._extract_pdf(io.BytesIO(raw_bytes))
                    if not parsed_text or not parsed_text.strip():
                        raise HTTPException(
                            status_code=422,
                            detail="Failed to extract text from scanned PDF. The file may be corrupted or unreadable.",
                        )

            # ------------------------------------------------------------------ #
            # Step 1: Send file to LightRAG                                      #
            # ------------------------------------------------------------------ #
            if is_scanned_pdf:
                txt_bytes = parsed_text.encode("utf-8")
                upload_result = await self.lightrag.upload_document(
                    filename=Path(filename).stem + "_parsed.txt",
                    file_obj=io.BytesIO(txt_bytes),
                    content_type="text/plain",
                )
            else:
                upload_result = await self.lightrag.upload_document(
                    filename=filename,
                    file_obj=io.BytesIO(raw_bytes),
                    content_type=doc_type,
                )
            track_id = upload_result.get("track_id")

            if not track_id:
                raise HTTPException(
                    status_code=502, detail="LightRAG response missing track_id"
                )

            track_id = str(track_id)

            # Idempotency guard: return existing record if already uploaded.
            existing = await self.formal_doc_repo.get_by_track_id(track_id)
            if existing:
                # Fetch linked Document (may be None for legacy records).
                linked_doc = None
                if existing.document_id:
                    linked_doc = await self.doc_repo.get_by_id(existing.document_id)
                return existing, linked_doc, None

            # ------------------------------------------------------------------ #
            # Step 2: Upload raw file to object storage                          #
            # ------------------------------------------------------------------ #
            s3_key = f"raw/formal/{track_id}/{filename}"
            file_path = await self.storage.upload(
                key=s3_key,
                file_obj=io.BytesIO(raw_bytes),
                content_type=doc_type,
            )

            # ------------------------------------------------------------------ #
            # Step 3: Create the Document record for Qdrant indexing             #
            # ------------------------------------------------------------------ #
            checksum = hashlib.sha256(raw_bytes).hexdigest()

            document = await self.doc_repo.create_document(
                title=filename,
                storage_id=storage_id,
                doc_type=doc_type,
                file_path=file_path,
                file_size=file_size,
                checksum=checksum,
                meta_data={
                    **(meta_data or {}),
                    "_parsed_text": parsed_text,
                }
                if is_scanned_pdf
                else meta_data,
            )

            # ------------------------------------------------------------------ #
            # Step 4: Create FormalDocument linked to the Document above         #
            # ------------------------------------------------------------------ #
            initial_doc_id = upload_result.get("doc_id")
            formal_doc = await self.formal_doc_repo.create(
                document_id=document.id,
                lightrag_track_id=track_id,
                lightrag_doc_id=str(initial_doc_id) if initial_doc_id else None,
            )

            # ------------------------------------------------------------------ #
            # Step 5: Persist everything                                          #
            # ------------------------------------------------------------------ #
            await self.db.commit()
            await self.db.refresh(formal_doc)
            await self.db.refresh(document)

            # ------------------------------------------------------------------ #
            # Step 6: Trigger background tasks                                   #
            # ------------------------------------------------------------------ #
            # 6a. Standard Qdrant ingestion pipeline (extract → embed → upsert)
            from ..workers.celery_tasks import (
                trigger_ingestion_pipeline,
                trigger_formal_doc_sync,
            )

            trigger_ingestion_pipeline(document.id, auto_generate_faq=False)
            logger.info(
                f"Triggered Qdrant ingestion pipeline for formal doc "
                f"formal_doc_id={formal_doc.document_id}, document_id={document.id}"
            )

            # 6b. LightRAG sync task to poll for doc_id (if not returned immediately)
            sync_task_id: Optional[str] = None
            if not initial_doc_id:
                sync_result = trigger_formal_doc_sync(formal_doc.document_id)
                sync_task_id = sync_result.id
                logger.info(
                    f"Triggered LightRAG sync task for formal_doc_id={formal_doc.document_id}, "
                    f"task_id={sync_task_id}"
                )
            else:
                logger.info(
                    f"Formal doc formal_doc_id={formal_doc.document_id} received "
                    f"lightrag_doc_id={initial_doc_id} immediately; skipping sync task"
                )

            # ------------------------------------------------------------------ #
            # Step 7: Invalidate semantic cache                                  #
            # ------------------------------------------------------------------ #
            try:
                await semantic_cache_notifier.notify_kb_changed(
                    namespace=f"kb_{storage_id}"
                )
            except Exception as e:
                logger.warning("Failed to notify semantic cache invalidation: %s", e)

            return formal_doc, document, sync_task_id

        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as e:
            await self.db.rollback()
            if file_path:
                try:
                    await self.storage.delete(file_path)
                except Exception:
                    pass
            logger.error(f"Error uploading formal document: {str(e)}")
            raise HTTPException(
                status_code=500, detail="Failed to upload formal document"
            )

    async def get_document(self, document_id: int):
        stmt = (
            select(Document)
            .outerjoin(FormalDocument, Document.id == FormalDocument.document_id)
            .options(contains_eager(Document.formal_info))
            .where(Document.id == document_id)
            .where(Document.status != DocumentStatus.DELETED)
        )
        result = await self.db.execute(stmt)
        doc = result.scalars().first()

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        response = DocumentDetailResponse.model_validate(doc)
        response.is_formal_doc = doc.formal_info is not None
        return response

    async def list_documents(
        self,
        skip: int,
        limit: int,
        storage_id: Optional[int],
    ):
        stmt = (
            select(Document)
            .options(joinedload(Document.formal_info))
            .where(Document.status != DocumentStatus.DELETED)
            .order_by(Document.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if storage_id is not None:
            stmt = stmt.where(Document.storage_id == storage_id)

        result = await self.db.execute(stmt)
        docs = result.scalars().unique().all()

        responses = []
        for doc in docs:
            resp = DocumentResponse.model_validate(doc)
            resp.is_formal_doc = doc.formal_info is not None
            responses.append(resp)
        return responses

    async def list_admin_documents(
        self,
        *,
        page: int,
        page_size: int,
        search: Optional[str],
        year: Optional[int],
        unit: Optional[str],
        document_type: Optional[str],
        is_formal_doc: Optional[bool],
        storage_id: Optional[int],
    ) -> AdminDocumentListResponse:
        skip = (page - 1) * page_size
        query_text = search.strip() if search else None
        normalized_unit = unit.strip().lower() if unit else None
        normalized_document_type = (
            document_type.strip().lower() if document_type else None
        )

        filters = [Document.status != DocumentStatus.DELETED]
        if storage_id is not None:
            filters.append(Document.storage_id == storage_id)
        if is_formal_doc is True:
            filters.append(FormalDocument.document_id.isnot(None))
        elif is_formal_doc is False:
            filters.append(FormalDocument.document_id.is_(None))

        if query_text:
            search_clause = f"%{query_text.lower()}%"
            filters.append(
                or_(
                    func.lower(Document.title).like(search_clause),
                    func.lower(cast(Document.meta_data["summary"].astext, String)).like(
                        search_clause
                    ),
                    func.lower(cast(Document.meta_data["code"].astext, String)).like(
                        search_clause
                    ),
                )
            )
        if normalized_unit:
            filters.append(
                func.lower(cast(Document.meta_data["unit"].astext, String))
                == normalized_unit
            )
        if normalized_document_type:
            filters.append(
                or_(
                    func.lower(cast(Document.meta_data["document_type"].astext, String))
                    == normalized_document_type,
                    func.lower(cast(Document.meta_data["document_kind"].astext, String))
                    == normalized_document_type,
                )
            )
        if year is not None:
            year_text = str(year)
            filters.append(
                or_(
                    cast(Document.meta_data["year"].astext, String) == year_text,
                    cast(Document.meta_data["signed_year"].astext, String) == year_text,
                    cast(func.date_part("year", Document.created_at), String)
                    == year_text,
                )
            )

        # Count total matching documents (single query)
        count_subq = (
            select(Document.id)
            .outerjoin(FormalDocument, Document.id == FormalDocument.document_id)
            .where(*filters)
            .subquery()
        )
        total_items = int(
            (
                await self.db.execute(select(func.count()).select_from(count_subq))
            ).scalar()
            or 0
        )

        if total_items == 0:
            return AdminDocumentListResponse(
                items=[],
                page=page,
                page_size=page_size,
                total_items=0,
                total_pages=0,
            )

        # Fetch current page with joined formal info
        stmt = (
            select(Document)
            .outerjoin(FormalDocument, Document.id == FormalDocument.document_id)
            .options(contains_eager(Document.formal_info))
            .where(*filters)
            .order_by(Document.updated_at.desc())
            .offset(skip)
            .limit(page_size)
        )
        rows = (await self.db.execute(stmt)).scalars().unique().all()

        # Sync LightRAG for formal docs sequentially (session safety)
        formal_doc_map: dict[int, FormalDocument] = {}
        for doc in rows:
            if doc.formal_info and doc.formal_info.lightrag_track_id:
                try:
                    synced = await self._sync_formal_doc_from_lightrag(doc.formal_info)
                    if synced is not None:
                        formal_doc_map[doc.id] = synced
                except Exception as e:
                    logger.warning(
                        "LightRAG sync failed for document_id=%s: %s",
                        doc.id,
                        e,
                    )
                    formal_doc_map[doc.id] = doc.formal_info
            elif doc.formal_info:
                formal_doc_map[doc.id] = doc.formal_info

        # Build response items
        items: list[AdminDocumentListItem] = []
        for doc in rows:
            if doc.formal_info:
                synced = formal_doc_map.get(doc.id, doc.formal_info)
                items.append(self._to_admin_formal_item(synced))
            else:
                items.append(self._to_admin_normal_item(doc))

        total_pages = max(1, math.ceil(total_items / page_size))
        return AdminDocumentListResponse(
            items=items,
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    @staticmethod
    def _resolve_status(
        *statuses: Optional[ProcessingStatus],
    ) -> Optional[ProcessingStatus]:
        priority = {
            ProcessingStatus.FAILED: 0,
            ProcessingStatus.PROCESSING: 1,
            ProcessingStatus.PENDING: 2,
            ProcessingStatus.CANCELLED: 3,
            ProcessingStatus.COMPLETED: 4,
        }
        applicable = [s for s in statuses if s is not None]
        if not applicable:
            return None
        return min(applicable, key=lambda s: priority.get(s, 99))

    def _to_admin_normal_item(self, doc: Document) -> AdminDocumentListItem:
        meta_data = doc.meta_data or {}
        return AdminDocumentListItem(
            id=doc.id,
            title=doc.title,
            status=doc.status,
            code=meta_data.get("code"),
            summary=meta_data.get("summary"),
            signed_date=meta_data.get("signed_date"),
            unit=meta_data.get("unit"),
            document_type=meta_data.get("document_type")
            or meta_data.get("document_kind"),
            tags=meta_data.get("tags") or [],
            is_formal_doc=False,
            processing_status=doc.processing_status,
            file_size=doc.file_size,
            meta_data=meta_data,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )

    def _to_admin_formal_item(self, doc: FormalDocument) -> AdminDocumentListItem:
        linked_doc = doc.document
        file_name = (linked_doc.file_path or "").split("/")[
            -1
        ] or f"formal-{doc.document_id}"
        meta_data = linked_doc.meta_data or {}
        return AdminDocumentListItem(
            id=doc.document_id,
            title=file_name,
            status=linked_doc.status,
            code=meta_data.get("code") or f"FORMAL-{doc.document_id}",
            summary=meta_data.get("summary")
            or "Tài liệu formal (đồng bộ qua LightRAG)",
            signed_date=meta_data.get("signed_date") or meta_data.get("signedDate"),
            unit=meta_data.get("unit"),
            document_type=meta_data.get("document_type") or "Formal document",
            tags=meta_data.get("tags") or ["Formal"],
            is_formal_doc=True,
            processing_status=self._resolve_status(
                linked_doc.processing_status,
                doc.sync_status,
            ),
            file_size=linked_doc.file_size,
            meta_data={
                "lightrag_track_id": doc.lightrag_track_id,
                "lightrag_doc_id": doc.lightrag_doc_id,
                **meta_data,
            },
            sync_status=str(doc.sync_status) if doc.sync_status else None,
            sync_error=doc.sync_error,
            last_synced_at=doc.last_synced_at,
            created_at=linked_doc.created_at,
            updated_at=linked_doc.updated_at,
        )

    async def resolve_document_file(
        self,
        *,
        document_id: int,
        is_formal_doc: Optional[bool],
    ) -> tuple[str, str, str, bool]:
        if is_formal_doc is True:
            formal_doc = await self.formal_doc_repo.get_by_id(document_id)
            if not formal_doc:
                raise HTTPException(status_code=404, detail="Formal document not found")
            linked_doc = formal_doc.document
            file_key = linked_doc.file_path
            file_name = (
                Path(file_key or "").name or f"formal-{formal_doc.document_id}.pdf"
            )
            media_type = (
                mimetypes.guess_type(file_name)[0] or "application/octet-stream"
            )
            return file_key, file_name, media_type, True

        if is_formal_doc is False:
            normal_doc = await self.doc_repo.get_by_id(document_id)
            if not normal_doc:
                raise HTTPException(status_code=404, detail="Document not found")
            media_map = {
                "pdf": "application/pdf",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "txt": "text/plain",
                "markdown": "text/markdown",
                "html": "text/html",
                "json": "application/json",
            }
            file_key = normal_doc.file_path
            file_name = (
                Path(file_key or "").name
                or normal_doc.title
                or f"document-{normal_doc.id}"
            )
            media_type = media_map.get(
                str(normal_doc.document_type), "application/octet-stream"
            )
            return file_key, file_name, media_type, False

        normal_doc = await self.doc_repo.get_by_id(document_id)
        formal_doc = await self.formal_doc_repo.get_by_id(document_id)

        if normal_doc and formal_doc:
            raise HTTPException(
                status_code=409,
                detail="Ambiguous document id. Please set is_formal_doc=true/false explicitly.",
            )

        if normal_doc:
            return await self.resolve_document_file(
                document_id=document_id,
                is_formal_doc=False,
            )

        if formal_doc:
            return await self.resolve_document_file(
                document_id=document_id,
                is_formal_doc=True,
            )

        raise HTTPException(status_code=404, detail="Document not found")

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

        # Invalidate semantic cache for this KB namespace based on the changed doc_id.
        try:
            await semantic_cache_notifier.notify_kb_changed(
                namespace=collection_name,
                doc_ids=[str(document_id)],
            )
        except Exception as e:
            logger.warning("Failed to notify semantic cache invalidation: %s", e)
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
            *[
                self._build_formal_response(d, include_documents=False)
                for d in result_docs
            ],
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

        # file_path và meta_data giờ nằm trên Document, redirect update
        formal_update = {}
        doc_update = {}
        for key, value in update_data.items():
            if key in ("file_path", "meta_data"):
                doc_update[key] = value
            else:
                formal_update[key] = value

        if doc_update:
            await self.doc_repo.update(current_doc.document_id, doc_update)

        if formal_update:
            await self.formal_doc_repo.update(document_id, formal_update)

        await self.db.commit()
        # Re-fetch để có document relationship loaded
        return await self.formal_doc_repo.get_by_id(document_id)

    async def delete_formal_document(self, document_id: int):
        current_doc = await self.formal_doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Formal document not found")

        current_doc = await self._sync_formal_doc_from_lightrag(current_doc)
        linked_doc = current_doc.document
        namespace = f"kb_{linked_doc.storage_id}"

        if current_doc.lightrag_doc_id and self.lightrag.enabled:
            try:
                await self.lightrag.delete_document(current_doc.lightrag_doc_id)
            except Exception as e:
                logger.warning(
                    f"Failed to delete LightRAG doc {current_doc.lightrag_doc_id}: {str(e)}"
                )

        if linked_doc.file_path:
            try:
                await self.storage.delete(linked_doc.file_path)
            except Exception as e:
                logger.warning(
                    f"Failed to delete storage file {linked_doc.file_path}: {str(e)}"
                )

        await self.formal_doc_repo.delete(document_id)
        await self.db.commit()
        # Formal document removal changes KB: bump namespace version.
        try:
            await semantic_cache_notifier.notify_kb_changed(namespace=namespace)
        except Exception as e:
            logger.warning("Failed to notify semantic cache invalidation: %s", e)
        return {"message": "Formal document deleted successfully"}

    async def sync_formal_document_by_track(self, document_id: int):
        doc = await self.formal_doc_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Formal document not found")
        doc = await self._sync_formal_doc_from_lightrag(doc)
        linked_doc = doc.document
        # Sync may surface newly ingested/updated formal docs; keep semantic cache fresh.
        try:
            await semantic_cache_notifier.notify_kb_changed(
                namespace=f"kb_{linked_doc.storage_id}"
            )
        except Exception as e:
            logger.warning("Failed to notify semantic cache invalidation: %s", e)
        return await self._build_formal_response(doc)

    async def _build_formal_response(
        self,
        doc,
        include_documents: bool = True,
        skip_remote: bool = False,
    ) -> FormalDocumentResponse:
        """Build a FormalDocumentResponse, including Qdrant indexing status.

        For the Qdrant status, we look up the linked Document row (if any)
        and surface its ``processing_status``.  This lets callers track
        dual-index progress in a single API response.
        """
        linked_doc = doc.document

        base = {
            "id": doc.document_id,
            "storage_id": linked_doc.storage_id if linked_doc else None,
            "file_path": linked_doc.file_path if linked_doc else "",
            "lightrag_track_id": doc.lightrag_track_id,
            "lightrag_doc_id": doc.lightrag_doc_id,
            "meta_data": linked_doc.meta_data if linked_doc else {},
            "created_at": linked_doc.created_at if linked_doc else doc.created_at,
            "updated_at": linked_doc.updated_at if linked_doc else doc.updated_at,
            # Qdrant / internal indexing fields
            "document_id": doc.document_id,
            "qdrant_processing_status": None,
            # LightRAG sync status
            "sync_status": doc.sync_status,
            "sync_error": doc.sync_error,
            "last_synced_at": doc.last_synced_at,
        }

        # Surface the Qdrant processing status from the linked Document row.
        if linked_doc is not None:
            base["qdrant_processing_status"] = str(linked_doc.processing_status)
        else:
            # Fallback: look up by document_id if relationship isn't loaded
            linked_doc = await self.doc_repo.get_by_id(doc.document_id)
            if linked_doc is not None:
                base["qdrant_processing_status"] = str(linked_doc.processing_status)
                base["storage_id"] = linked_doc.storage_id
                base["file_path"] = linked_doc.file_path
                base["meta_data"] = linked_doc.meta_data

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
        now = datetime.now(timezone.utc)
        update_data: dict[str, Any] = {"last_synced_at": now}

        if not isinstance(track_result, dict):
            update_data["sync_status"] = ProcessingStatus.FAILED
            update_data["sync_error"] = "Invalid response from LightRAG"
        else:
            documents = track_result.get("documents", [])
            status_summary = track_result.get("status_summary", {})

            if status_summary:
                # Make keys case-insensitive
                status_summary = {k.lower(): v for k, v in status_summary.items()}
                
                processing = status_summary.get("processing", 0)
                pending = status_summary.get("pending", 0)
                completed = (
                    status_summary.get("completed", 0)
                    or status_summary.get("success", 0)
                    or status_summary.get("processed", 0)
                )
                failed = status_summary.get("failed", 0)

                if processing > 0 or pending > 0:
                    update_data["sync_status"] = ProcessingStatus.PROCESSING
                elif completed > 0 and failed == 0:
                    update_data["sync_status"] = ProcessingStatus.COMPLETED
                    update_data["sync_error"] = None
                elif failed > 0:
                    update_data["sync_status"] = ProcessingStatus.FAILED
                    errors = [d.get("error", "") for d in documents if d.get("error")]
                    update_data["sync_error"] = (
                        "; ".join(errors[:3])
                        if errors
                        else "LightRAG processing failed"
                    )
            else:
                if documents and documents[0].get("id"):
                    update_data["sync_status"] = ProcessingStatus.COMPLETED
                    update_data["sync_error"] = None

            if documents and documents[0].get("id"):
                update_data["lightrag_doc_id"] = str(documents[0]["id"])

        await self.formal_doc_repo.update(doc.document_id, update_data)
        await self.db.commit()
        return await self.formal_doc_repo.get_by_id(doc.document_id)
