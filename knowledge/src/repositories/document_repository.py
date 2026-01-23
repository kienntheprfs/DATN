from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from ..models.models import Document, DocumentVersion, ProcessingStatus

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