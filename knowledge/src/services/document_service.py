import asyncio
import hashlib
import logging
import math
import mimetypes
from pathlib import Path
from typing import Any, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.vector_db_setup import QdrantManager
from .file_storage import get_storage
from .lightrag_service import LightRAGService
from .validator import validate_upload_file
from .vector_db import VectorDBService
from ..models.models import Document
from ..models.models import DocumentStatus, FormalDocument, ProcessingStatus
from ..repositories.document_repository import DocumentRepository
from ..repositories.formal_document_repository import FormalDocumentRepository
from ..schemas.document import AdminDocumentListResponse, AdminDocumentListItem
from ..schemas.document import DocumentUpdate
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
    ) -> Tuple[FormalDocument, Optional[str]]:
        doc_type = validate_upload_file(file)
        filename = Path(file.filename).name
        file_path = None

        try:
            if not self.lightrag.enabled:
                raise HTTPException(
                    status_code=500, detail="LightRAG is not configured"
                )

            await file.seek(0)
            upload_result = await self.lightrag.upload_document(
                filename=filename,
                file_obj=file.file,
                content_type=doc_type,
            )
            track_id = upload_result.get("track_id")

            if not track_id:
                raise HTTPException(
                    status_code=502, detail="LightRAG response missing track_id"
                )

            track_id = str(track_id)

            existing = await self.formal_doc_repo.get_by_track_id(track_id)
            if existing:
                return existing, None

            s3_key = f"raw/formal/{track_id}/{filename}"
            file.file.seek(0)
            file_path = await self.storage.upload(
                key=s3_key,
                file_obj=file.file,
                content_type=doc_type,
            )

            initial_doc_id = upload_result.get("doc_id")
            formal_doc = await self.formal_doc_repo.create(
                storage_id=storage_id,
                file_path=file_path,
                lightrag_track_id=track_id,
                lightrag_doc_id=str(initial_doc_id) if initial_doc_id else None,
                meta_data=meta_data,
            )
            await self.db.commit()
            await self.db.refresh(formal_doc)

            sync_task_id = None
            if not initial_doc_id:
                from ..workers.celery_tasks import trigger_formal_doc_sync

                sync_result = trigger_formal_doc_sync(formal_doc.id)
                sync_task_id = sync_result.id
                logger.info(
                    f"Triggered formal doc sync task for doc {formal_doc.id}, task_id={sync_task_id}"
                )
            else:
                logger.info(
                    f"Formal doc {formal_doc.id} received doc_id={initial_doc_id} immediately"
                )

            try:
                await semantic_cache_notifier.notify_kb_changed(
                    namespace=f"kb_{storage_id}"
                )
            except Exception as e:
                logger.warning("Failed to notify semantic cache invalidation: %s", e)

            return formal_doc, sync_task_id

        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as e:
            await self.db.rollback()
            if file_path:
                await self.storage.delete(file_path)
            logger.error(f"Error uploading formal document: {str(e)}")
            raise HTTPException(
                status_code=500, detail="Failed to upload formal document"
            )

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
        include_normal = is_formal_doc is not True
        include_formal = is_formal_doc is not False

        normal_filters = [Document.status != DocumentStatus.DELETED]
        if storage_id is not None:
            normal_filters.append(Document.storage_id == storage_id)
        if query_text:
            search_clause = f"%{query_text.lower()}%"
            normal_filters.append(
                or_(
                    func.lower(Document.title).like(search_clause),
                    func.lower(cast(Document.meta_data["summary"].astext, String)).like(search_clause),
                    func.lower(cast(Document.meta_data["code"].astext, String)).like(search_clause),
                )
            )
        if normalized_unit:
            normal_filters.append(
                func.lower(cast(Document.meta_data["unit"].astext, String)) == normalized_unit
            )
        if normalized_document_type:
            normal_filters.append(
                or_(
                    func.lower(cast(Document.meta_data["document_type"].astext, String))
                    == normalized_document_type,
                    func.lower(cast(Document.meta_data["document_kind"].astext, String))
                    == normalized_document_type,
                )
            )
        if year is not None:
            normal_filters.append(
                or_(
                    cast(Document.meta_data["year"].astext, String) == str(year),
                    cast(Document.meta_data["signed_year"].astext, String) == str(year),
                    cast(func.date_part("year", Document.created_at), String) == str(year),
                )
            )

        normal_total = 0
        normal_items: list[AdminDocumentListItem] = []
        if include_normal:
            normal_total_stmt = select(func.count(Document.id)).where(*normal_filters)
            normal_total = int((await self.db.execute(normal_total_stmt)).scalar_one() or 0)
            normal_limit = page_size if not include_formal else page * page_size
            normal_offset = skip if not include_formal else 0
            normal_stmt = (
                select(Document)
                .where(*normal_filters)
                .order_by(Document.updated_at.desc())
                .offset(normal_offset)
                .limit(normal_limit)
            )
            normal_docs = (await self.db.execute(normal_stmt)).scalars().all()
            normal_items = [self._to_admin_normal_item(doc) for doc in normal_docs]

        formal_total = 0
        formal_items: list[AdminDocumentListItem] = []
        if include_formal:
            formal_filters = []
            if storage_id is not None:
                formal_filters.append(FormalDocument.storage_id == storage_id)
            if query_text:
                search_clause = f"%{query_text.lower()}%"
                formal_filters.append(
                    or_(
                        func.lower(cast(FormalDocument.file_path, String)).like(search_clause),
                        func.lower(
                            cast(FormalDocument.meta_data["summary"].astext, String)
                        ).like(search_clause),
                        func.lower(
                            cast(FormalDocument.meta_data["code"].astext, String)
                        ).like(search_clause),
                    )
                )

            if normalized_unit:
                formal_filters.append(
                    func.lower(cast(FormalDocument.meta_data["unit"].astext, String))
                    == normalized_unit
                )

            if normalized_document_type:
                formal_filters.append(
                    or_(
                        func.lower(
                            cast(
                                FormalDocument.meta_data["document_type"].astext,
                                String,
                            )
                        )
                        == normalized_document_type,
                        func.lower(
                            cast(
                                FormalDocument.meta_data["document_kind"].astext,
                                String,
                            )
                        )
                        == normalized_document_type,
                    )
                )

            if year is not None:
                year_text = str(year)
                formal_filters.append(
                    or_(
                        cast(FormalDocument.meta_data["year"].astext, String)
                        == year_text,
                        cast(FormalDocument.meta_data["signed_year"].astext, String)
                        == year_text,
                        func.substring(
                            cast(
                                FormalDocument.meta_data["signed_date"].astext,
                                String,
                            ),
                            1,
                            4,
                        )
                        == year_text,
                        cast(func.date_part("year", FormalDocument.created_at), String)
                        == year_text,
                    )
                )

            formal_total_stmt = select(func.count(FormalDocument.id)).where(*formal_filters)
            formal_total = int((await self.db.execute(formal_total_stmt)).scalar_one() or 0)
            formal_limit = page_size if not include_normal else page * page_size
            formal_offset = skip if not include_normal else 0
            formal_stmt = (
                select(FormalDocument)
                .where(*formal_filters)
                .order_by(FormalDocument.updated_at.desc())
                .offset(formal_offset)
                .limit(formal_limit)
            )
            formal_docs = (await self.db.execute(formal_stmt)).scalars().all()
            formal_items = [self._to_admin_formal_item(doc) for doc in formal_docs]

        if include_normal and include_formal:
            total_items = normal_total + formal_total
            merged = sorted(
                [*normal_items, *formal_items],
                key=lambda item: item.updated_at,
                reverse=True,
            )
            page_items = merged[skip : skip + page_size]
        elif include_normal:
            total_items = normal_total
            page_items = normal_items
        else:
            total_items = formal_total
            page_items = formal_items

        total_pages = max(1, math.ceil(total_items / page_size))
        return AdminDocumentListResponse(
            items=page_items,
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

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
            document_type=meta_data.get("document_type") or meta_data.get("document_kind"),
            tags=meta_data.get("tags") or [],
            is_formal_doc=False,
            processing_status=doc.processing_status,
            file_size=doc.file_size,
            meta_data=meta_data,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )

    def _to_admin_formal_item(self, doc: FormalDocument) -> AdminDocumentListItem:
        file_name = (doc.file_path or "").split("/")[-1] or f"formal-{doc.id}"
        meta_data = doc.meta_data or {}
        return AdminDocumentListItem(
            id=doc.id,
            title=file_name,
            code=meta_data.get("code") or f"FORMAL-{doc.id}",
            summary=meta_data.get("summary") or "Tài liệu formal (đồng bộ qua LightRAG)",
            signed_date=meta_data.get("signed_date") or meta_data.get("signedDate"),
            unit=meta_data.get("unit"),
            document_type=meta_data.get("document_type") or "Formal document",
            tags=meta_data.get("tags") or ["Formal"],
            is_formal_doc=True,
            processing_status=ProcessingStatus.PROCESSING,
            file_size=None,
            meta_data={
                "lightrag_track_id": doc.lightrag_track_id,
                "lightrag_doc_id": doc.lightrag_doc_id,
                **meta_data,
            },
            created_at=doc.created_at,
            updated_at=doc.updated_at,
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
            file_key = formal_doc.file_path
            file_name = Path(file_key or "").name or f"formal-{formal_doc.id}.pdf"
            media_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
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
            file_name = Path(file_key or "").name or normal_doc.title or f"document-{normal_doc.id}"
            media_type = media_map.get(str(normal_doc.document_type), "application/octet-stream")
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

        updated_doc = await self.formal_doc_repo.update(document_id, update_data)
        await self.db.commit()
        await self.db.refresh(updated_doc)
        return updated_doc

    async def delete_formal_document(self, document_id: int):
        current_doc = await self.formal_doc_repo.get_by_id(document_id)
        if not current_doc:
            raise HTTPException(status_code=404, detail="Formal document not found")

        current_doc = await self._sync_formal_doc_from_lightrag(current_doc)
        namespace = f"kb_{current_doc.storage_id}"

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
        # Sync may surface newly ingested/updated formal docs; keep semantic cache fresh.
        try:
            await semantic_cache_notifier.notify_kb_changed(
                namespace=f"kb_{doc.storage_id}"
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
        base = {
            "id": doc.id,
            "storage_id": doc.storage_id,
            "file_path": doc.file_path,
            "lightrag_track_id": doc.lightrag_track_id,
            "lightrag_doc_id": doc.lightrag_doc_id,
            "meta_data": doc.meta_data,
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
