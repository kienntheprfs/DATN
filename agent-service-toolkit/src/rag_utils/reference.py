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
        Nhận vào mảng artifacts từ Agent, phân loại Normal/Formal,
        query lấy S3 path và trả về list chứa các link truy cập trực tiếp.
        """
        # 1. Phân loại ID theo nguồn
        normal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Normal"]
        formal_ids = [str(a["doc_id"]) for a in artifacts if a.get("source_type") == "Formal"]

        # Dictionary để map { "id_từ_artifact" : "s3_file_path" }
        path_mapping = {}

        # 2. Query bảng Normal (knowledge_schema.documents)
        if normal_ids:
            # Dùng toán tử ANY(:ids) hoặc IN để lấy batch
            stmt_normal = text("""
                SELECT id::text, file_path 
                FROM knowledge_schema.documents 
                WHERE id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_normal, {"ids": normal_ids})
            for row in result:
                path_mapping[row.id] = row.file_path

        # 3. Query bảng Formal (Join public.lightrag_doc_chunks và knowledge_schema.formal_documents)
        if formal_ids:
            # Điều kiện Join: full_doc_id = lightrag_doc_id
            stmt_formal = text("""
                SELECT c.id::text as chunk_id, f.file_path 
                FROM public.lightrag_doc_chunks c
                JOIN knowledge_schema.formal_documents f 
                  ON c.full_doc_id = f.lightrag_doc_id
                WHERE c.id::text = ANY(:ids)
            """)
            result = await db.execute(stmt_formal, {"ids": formal_ids})
            for row in result:
                path_mapping[row.chunk_id] = row.file_path

        # 4. Map kết quả ngược lại cho artifacts và sinh S3 url
        resolved_citations = []
        seen_docs = set()

        for item in artifacts:
            doc_id = str(item["doc_id"])
            file_path = path_mapping.get(doc_id)

            if not file_path:
                continue

            if file_path in seen_docs:
                continue

            s3_url = ""
            filename = "undefined"
            
            filename = file_path.split('/')[-1]
            
            # 1. Xác định Content-Type chuẩn
            content_type, _ = mimetypes.guess_type(file_path)
            if file_path.endswith('.txt'):
                content_type = 'text/plain; charset=utf-8' # Ép cứng UTF-8 để không bị lỗi font
            elif not content_type:
                content_type = 'application/octet-stream'

            # 2. Xử lý tên file tiếng Việt cho Content-Disposition (giúp trình duyệt đọc/tải đúng tên)
            safe_filename = urllib.parse.quote(filename)
            disposition = f"inline; filename*=UTF-8''{safe_filename}"

            if hasattr(self.storage, 'generate_presigned_url'):
                # Truyền thêm các tham số xuống storage engine
                s3_url = self.storage.generate_presigned_url(
                    file_path=file_path,
                    content_type=content_type,
                    disposition=disposition
                )
            else:
                s3_url = f"/static/{file_path}"

            resolved_citations.append({
                "doc_id": doc_id,                # ID dùng để mapping trên UI
                "source_type": item.get("source_type"),
                "file_path": file_path,            # Raw path (tùy chọn để debug)
                "file_name": filename,
                "s3_url": s3_url,                  # Link để UI mở
            })
            seen_docs.add(file_path)

        return resolved_citations

# Khởi tạo Singleton để tái sử dụng
reference_service = ReferenceService()