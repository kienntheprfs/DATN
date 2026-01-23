import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, UploadFile
import hashlib

from .storage import StorageService
from .validator import validate_upload_file
from ..models.models import DocumentVersion
from ..repositories.document_repository import DocumentRepository # Import Repo mới

class DocumentService:
    def __init__(self, db: AsyncSession):
        # Service giữ db session để quản lý Transaction (commit/rollback)
        self.db = db 
        self.storage = StorageService()
        # Khởi tạo Repo
        self.doc_repo = DocumentRepository(db)

    async def compute_checksum(self, file: UploadFile) -> str:
        hasher = hashlib.sha256()
        await file.seek(0)

        while chunk := await file.read(8192):
            hasher.update(chunk)

        await file.seek(0)
        return hasher.hexdigest()
    
    async def upload_document(
        self,
        file: UploadFile,
        title: str,
        storage_id: int
    ) -> DocumentVersion:
        
        # 1. Validation Logic
        doc_type = validate_upload_file(file)
        filename = f"{uuid.uuid4()}_{file.filename}"
        file_path = None

        try:
            # 2. Storage Logic: Lưu file vật lý
            # (Làm việc này trước để nếu lỗi IO thì không cần đụng vào DB)
            file_path = await self.storage.save_upload_file(file, filename)

            # 3. Database Logic: Gọi qua Repository
            # Bước 3.1: Tạo Document cha
            document = await self.doc_repo.create_document(
                title=title, 
                storage_id=storage_id
            )

            # Bước 3.2: Xác định version (Logic đã ẩn trong Repo hoặc set cứng là 1 cho doc mới)
            # Nếu là upload mới hoàn toàn, version luôn là 1.
            # Nếu bạn support "update document cũ", bạn sẽ gọi self.doc_repo.get_next_version_number(id)
            initial_version = 1 

            # Bước 3.3: Tạo Document Version
            checksum = await self.compute_checksum(file)

            document_version = await self.doc_repo.create_version(
                document_id=document.id,
                doc_type=doc_type,
                file_path=file_path,
                version_number=initial_version,
                checksum=checksum
            )

            # 4. Commit Transaction
            # Service quyết định khi nào thì "chốt đơn"
            await self.db.commit()
            await self.db.refresh(document_version)

            return document_version

        except Exception as e:
            # 5. Error Handling & Rollback (Compensating Transaction)
            
            # Rollback DB nếu đã lỡ insert
            await self.db.rollback()
            
            # Xóa file rác nếu đã lỡ lưu
            if file_path:
                self.storage.delete_file(file_path)
            
            # Log error thực tế ra console/file log để debug (quan trọng)
            print(f"Error uploading document: {str(e)}")
            
            raise HTTPException(
                status_code=500,
                detail="Failed to upload document processing"
            )