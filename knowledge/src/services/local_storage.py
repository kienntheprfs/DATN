import shutil
import os
from pathlib import Path
from fastapi import UploadFile
from src.core.config import settings

class StorageService:
    def __init__(self):
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload_file(self, file: UploadFile, file_name: str) -> str:
        """Lưu file và trả về đường dẫn tuyệt đối"""
        file_path = self.upload_dir / file_name
        
        # Async read/write (nếu file lớn nên dùng aiofiles, demo dùng standard)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return str(file_path)

    def delete_file(self, file_path: str):
        if os.path.exists(file_path):
            os.remove(file_path)