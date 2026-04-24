import logging
import asyncio
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import urllib.parse
import mimetypes

from service.file_storage import get_storage

logger = logging.getLogger(__name__)


class ReferenceService:
    def __init__(self):
        self.storage = get_storage()

    def _extract_filename_from_url(self, url: str) -> str:
        """
        Trích xuất filename từ URL để hiển thị.
        VD: https://hcmut.edu.vn/thong-tin-sinh-vien -> "thong-tin-sinh-vien"
        """
        try:
            parsed = urllib.parse.urlparse(url)
            path = parsed.path.strip("/")
            if path:
                return path.split("/")[-1] or url
            return parsed.netloc or url
        except Exception:
            return url

    async def resolve_citations(
        self, artifacts: List[Dict[str, Any]], db: AsyncSession
    ) -> List[Dict[str, Any]]:
        """
        Phân loại Normal/Formal/FAQ, xử lý trùng ID giữa các nguồn và trả về danh sách link S3.
        """
        normal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Normal"]
        formal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Formal"]
        faq_artifacts = [a for a in artifacts if a.get("is_faq") == True]
        faq_doc_ids = [
            str(a["doc_id"])
            for a in faq_artifacts
            if a.get("faq_source") == "document" and a.get("doc_id")
        ]

        path_mapping: dict[tuple, str] = {}

        # Query Normal documents
        if normal_ids:
            stmt_normal = text("""
                SELECT id::text, file_path 
                FROM knowledge_schema.documents 
                WHERE id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_normal, {"ids": normal_ids})
            for row in result:
                path_mapping[("Normal", row.id)] = row.file_path

        # Query Formal documents
        # formal_ids chứa chunk_ids (từ cả chunks thuần túy và entities/relationships)
        if formal_ids:
            stmt_formal = text("""
                SELECT c.id::text as chunk_id, f.file_path
                FROM public.lightrag_doc_chunks c
                JOIN knowledge_schema.formal_documents f
                ON c.full_doc_id = f.lightrag_doc_id
                WHERE c.id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_formal, {"ids": formal_ids})
            for row in result:
                path_mapping[("Formal", row.chunk_id)] = row.file_path

        # Query document-sourced FAQs (lấy file_path từ doc_id)
        if faq_doc_ids:
            stmt_faq_docs = text("""
                SELECT id::text, file_path 
                FROM knowledge_schema.documents 
                WHERE id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_faq_docs, {"ids": faq_doc_ids})
            for row in result:
                path_mapping[("FAQ", row.id)] = row.file_path

        resolved_citations: list[Dict[str, Any]] = []
        seen_assets: set[tuple] = set()

        # Xử lý Normal, Formal, và document-sourced FAQ
        for item in artifacts:
            doc_id = str(item["doc_id"])
            source_type = item.get("source_type")
            is_faq = item.get("is_faq", False)
            faq_source = item.get("faq_source")

            file_path = path_mapping.get((source_type, doc_id))

            # Skip nếu không có file_path hoặc đã cite rồi
            if not file_path or (source_type, file_path) in seen_assets:
                continue

            filename = file_path.split("/")[-1]
            content_type, _ = mimetypes.guess_type(file_path)
            if file_path.endswith(".txt"):
                content_type = "text/plain; charset=utf-8"
            elif not content_type:
                content_type = "application/octet-stream"

            safe_filename = urllib.parse.quote(filename)
            disposition = f"inline; filename*=UTF-8''{safe_filename}"

            if hasattr(self.storage, "generate_presigned_url"):
                s3_url = self.storage.generate_presigned_url(
                    file_path=file_path, content_type=content_type, disposition=disposition
                )
            else:
                s3_url = f"/static/{file_path}"

            citation: Dict[str, Any] = {
                "doc_id": doc_id,
                "source_type": source_type,
                "file_path": file_path,
                "file_name": filename,
                "s3_url": s3_url,
            }

            if is_faq:
                citation["is_faq"] = True
                citation["faq_source"] = faq_source or "unknown"

            resolved_citations.append(citation)
            seen_assets.add((source_type, file_path))

        # Xử lý manual FAQs (không có source document)
        for item in faq_artifacts:
            if item.get("faq_source") == "manual":
                faq_id = item.get("faq_id")
                if faq_id:
                    reference_url = item.get("reference_url")

                    if reference_url:
                        reference_url = reference_url.strip()
                        filename = self._extract_filename_from_url(reference_url)
                        citation = {
                            "doc_id": str(item["doc_id"]),
                            "source_type": "FAQ",
                            "is_faq": True,
                            "faq_source": "manual",
                            "faq_id": faq_id,
                            "file_path": reference_url,
                            "file_name": filename,
                            "s3_url": reference_url,
                        }
                        seen_key = ("FAQ", faq_id)
                        if seen_key not in seen_assets:
                            resolved_citations.append(citation)
                            seen_assets.add(seen_key)
                    else:
                        citation = {
                            "doc_id": str(item["doc_id"]),
                            "source_type": "FAQ",
                            "is_faq": True,
                            "faq_source": "manual",
                            "faq_id": faq_id,
                            "file_path": None,
                            "file_name": f"Hệ thống FAQ (ID: {faq_id})",
                            "s3_url": "#",
                        }
                        seen_key = ("FAQ", faq_id)
                        if seen_key not in seen_assets:
                            resolved_citations.append(citation)
                            seen_assets.add(seen_key)

        return resolved_citations


reference_service = ReferenceService()
