import logging
import asyncio
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import urllib.parse
import mimetypes

# Import storage engine của bạn
from service.file_storage import get_storage

logger = logging.getLogger(__name__)

class ReferenceService:
    def __init__(self):
        # Lấy instance của S3 (hoặc Local)
        self.storage = get_storage()

    async def resolve_citations(self, artifacts: List[Dict[str, Any]], db: AsyncSession) -> List[Dict[str, Any]]:
        """
        Phân loại Normal/Formal, xử lý trùng ID giữa 2 nguồn và trả về danh sách link S3.
        """
        # 1. Phân loại ID theo nguồn
        normal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Normal"]
        formal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Formal"]

        # Mapping sử dụng tuple (source_type, id) làm key để tránh xung đột
        path_mapping = {}

        # 2. Query bảng Normal
        if normal_ids:
            stmt_normal = text("""
                SELECT id::text, file_path 
                FROM knowledge_schema.documents 
                WHERE id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_normal, {"ids": normal_ids})
            for row in result:
                path_mapping[("Normal", row.id)] = row.file_path

        # 3. Query bảng Formal
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

        # 4. Map kết quả ngược lại cho artifacts
        resolved_citations = []
        # Dùng set chứa tuple (source_type, file_path) để tránh cite trùng 1 file nhiều lần
        seen_assets = set()

        for item in artifacts:
            doc_id = str(item["doc_id"])
            source_type = item.get("source_type")
            
            # Lấy file_path dựa trên cặp (Loại, ID)
            file_path = path_mapping.get((source_type, doc_id))

            if not file_path or (source_type, file_path) in seen_assets:
                continue

            # --- Xử lý thông tin file ---
            filename = file_path.split('/')[-1]
            
            # Xác định Content-Type và xử lý UTF-8 cho file .txt
            content_type, _ = mimetypes.guess_type(file_path)
            if file_path.endswith('.txt'):
                content_type = 'text/plain; charset=utf-8'
            elif not content_type:
                content_type = 'application/octet-stream'

            # Encode tên file tiếng Việt
            safe_filename = urllib.parse.quote(filename)
            disposition = f"inline; filename*=UTF-8''{safe_filename}"

            # --- Sinh URL ---
            if hasattr(self.storage, 'generate_presigned_url'):
                s3_url = self.storage.generate_presigned_url(
                    file_path=file_path,
                    content_type=content_type,
                    disposition=disposition
                )
            else:
                s3_url = f"/static/{file_path}"

            resolved_citations.append({
                "doc_id": doc_id,
                "source_type": source_type,
                "file_path": file_path,
                "file_name": filename,
                "s3_url": s3_url,
            })
            
            seen_assets.add((source_type, file_path))

        return resolved_citations
# Khởi tạo Singleton để tái sử dụng
reference_service = ReferenceService()