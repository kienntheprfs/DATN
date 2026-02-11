# src/services/file_storage/local_storage.py
import shutil
import asyncio
from pathlib import Path
from typing import BinaryIO, AsyncGenerator
from contextlib import asynccontextmanager
from .base import FileStorage
from src.core.config import settings

class LocalStorage(FileStorage):
    def __init__(self, base_dir=settings.UPLOAD_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def upload(self, key: str, file_obj: BinaryIO, content_type: str) -> str:
        path = self.base_dir / key
        
        # Tạo thư mục cha nếu chưa có (Non-blocking)
        if not path.parent.exists():
            await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)

        # Helper function để chạy blocking I/O
        def _save_file():
            with open(path, "wb") as buffer:
                # copyfileobj đọc/ghi theo chunk (default 64KB), an toàn cho file lớn
                shutil.copyfileobj(file_obj, buffer)

        # Chạy trong ThreadPool để không block FastAPI Event Loop
        await asyncio.to_thread(_save_file)
        return str(path)

    async def delete(self, key: str):
        path = self.base_dir / key
        if await asyncio.to_thread(path.exists):
            await asyncio.to_thread(path.unlink)

    async def exists(self, key: str) -> bool:
        path = self.base_dir / key
        return await asyncio.to_thread(path.exists)

    @asynccontextmanager
    async def download_stream(self, key: str) -> AsyncGenerator[BinaryIO, None]:
        path = self.base_dir / key
        if not path.exists():
            raise FileNotFoundError(f"File not found: {key}")
        
        # Mở file và yield ra ngoài. Khi caller thoát `with`, file tự đóng.
        f = open(path, "rb")
        try:
            yield f
        finally:
            f.close()