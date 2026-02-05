from sqlalchemy import select, func, update, desc, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional, Sequence

from ..models.models import Document, DocumentVersion, ProcessingStatus, DocumentStatus, Chunk

class DocumentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_document(self, title: str, storage_id: int) -> Document:
        """Tạo mới một Document cha"""
        document = Document(title=title, storage_id=storage_id)
        self.db.add(document)
        # Flush để lấy ID ngay lập tức mà chưa cần commit transaction
        await self.db.flush() 
        return document

    async def create_version(
        self, 
        document_id: int, 
        doc_type: str, 
        file_path: str,
        version_number: int,
        checksum: str
    ) -> DocumentVersion:
        """Tạo một bản ghi version mới"""
        doc_version = DocumentVersion(
            document_id=document_id,
            version=version_number,
            document_type=doc_type,
            file_path=file_path,
            checksum=checksum,
            processing_status=ProcessingStatus.PENDING
        )
        self.db.add(doc_version)
        await self.db.flush()
        return doc_version

    async def get_next_version_number(self, document_id: int) -> int:
        """Logic tìm version tiếp theo: Max(version) + 1"""
        # Query lấy version lớn nhất hiện tại của document_id
        query = select(func.max(DocumentVersion.version)).where(
            DocumentVersion.document_id == document_id
        )
        result = await self.db.execute(query)
        max_version = result.scalar() or 0
        return max_version + 1
    
    async def get_version_with_details(
        self,
        version_id: int
    ) -> DocumentVersion | None:
        """
        Lấy DocumentVersion + preload Document
        Dùng cho background indexing (production-safe)
        """
        stmt = (
            select(DocumentVersion)
            .options(joinedload(DocumentVersion.document))
            .where(DocumentVersion.id == version_id)
        )

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_by_id(self, document_id: int) -> Optional[Document]:
        """
        Lấy document kèm theo danh sách versions (Eager Load)
        """
        query = (
            select(Document)
            .options(selectinload(Document.versions)) # Load relation để tránh N+1
            .where(Document.id == document_id)
            .where(Document.status != DocumentStatus.DELETED) # Không lấy bản ghi đã xóa
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        storage_id: Optional[int] = None
    ) -> Sequence[Document]:
        """
        Lấy danh sách documents, sắp xếp theo ngày cập nhật mới nhất.
        Preload versions để lấy info version mới nhất hiển thị ra list.
        """
        query = (
            select(Document)
            .options(selectinload(Document.versions))
            .where(Document.status != DocumentStatus.DELETED)
        )

        if storage_id:
            query = query.where(Document.storage_id == storage_id)

        # Sort: Update mới nhất lên đầu
        query = query.order_by(desc(Document.updated_at)).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()

    async def update(self, document_id: int, update_data: dict) -> Optional[Document]:
        """
        Update thông tin meta của Document (Title, Status)
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .values(**update_data)
            .returning(Document)
        )
        result = await self.db.execute(query)
        await self.db.flush()
        
        # Cần fetch lại để load relationships nếu cần return full model, 
        # hoặc return object vừa update (nhưng thiếu relations)
        return result.scalar_one_or_none()

    async def soft_delete(self, document_id: int) -> bool:
        """
        Soft delete: Chỉ đổi status sang DELETED
        """
        query = (
            update(Document)
            .where(Document.id == document_id)
            .values(status=DocumentStatus.DELETED)
        )
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    # CHECK
    async def update_version_status(
        self, 
        version_id: int, 
        status: ProcessingStatus, 
        error_msg: Optional[str] = None
    ) -> None:
        """
        Cập nhật trạng thái xử lý cho DocumentVersion kèm Timestamp.
        """
        values = {"processing_status": status}
        
        if status == ProcessingStatus.PROCESSING:
            values["processing_started_at"] = func.now()
        elif status in [ProcessingStatus.COMPLETED, ProcessingStatus.FAILED]:
            values["processing_completed_at"] = func.now()

        if error_msg:
            values["processing_error"] = error_msg

        stmt = (
            update(DocumentVersion)
            .where(DocumentVersion.id == version_id)
            .values(**values)
        )
        await self.db.execute(stmt)
        await self.db.flush()

    # CHECK
    async def bulk_create_chunks(self, chunks_data: List[dict]) -> None:
        """
        Bulk Insert danh sách Chunks với cơ chế 'Idempotent' (Chống trùng lặp).
        Nếu trùng (document_version_id + chunk_index) -> Bỏ qua hoặc Update.
        """
        if not chunks_data:
            return

        # 1. Tạo câu lệnh INSERT đặc thù của PostgreSQL
        stmt = pg_insert(Chunk).values(chunks_data)

        # 2. Xử lý xung đột (Conflict Handling)
        # Cách 1: DO NOTHING (Chuẩn nhất cho Logs/History data)
        # Nếu chunk index đó đã tồn tại cho version này rồi thì thôi, không báo lỗi.
        # Điều này giúp Celery Task có thể Retry thoải mái mà không sợ crash.
        
        stmt = stmt.on_conflict_do_nothing(
            # Chỉ định rõ ràng constraint nào đang được check
            # Tên 'uq_version_chunk_index' lấy từ file models.py của bạn
            constraint='uq_version_chunk_index' 
        )

        # --- (Mở rộng) Cách 2: DO UPDATE (UPSERT) ---
        # Nếu bạn muốn worker chạy sau đè dữ liệu lên worker chạy trước (ví dụ sửa lại embedding):
        # stmt = stmt.on_conflict_do_update(
        #     constraint='uq_version_chunk_index',
        #     set_={
        #         "content": stmt.excluded.content,
        #         "embedding_id": stmt.excluded.embedding_id,
        #         "chunk_metadata": stmt.excluded.chunk_metadata,
        #         "updated_at": func.now()
        #     }
        # )

        # 3. Thực thi
        await self.db.execute(stmt)
        await self.db.flush()

    # CHECK
    async def cleanup_failed_version(self, version_id: int):
        """
        ROLLBACK STRATEGY:
        Xóa toàn bộ Chunk thuộc về version_id này.
        Giữ lại row DocumentVersion nhưng Chunk data sẽ sạch sẽ.
        """
        stmt = delete(Chunk).where(Chunk.document_version_id == version_id)
        await self.db.execute(stmt)
        await self.db.flush()