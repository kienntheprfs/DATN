# src/services/file_storage/base.py
from abc import ABC, abstractmethod
from typing import BinaryIO, AsyncGenerator
from contextlib import asynccontextmanager

class FileStorage(ABC):
    @abstractmethod
    async def upload(self, key: str, file_obj: BinaryIO, content_type: str) -> str:
        """Upload file object (dạng stream) lên storage"""
        pass

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Xóa file"""
        pass
    
    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Kiểm tra file tồn tại"""
        pass

    # CHECK: asynccontextmanager
    @abstractmethod
    @asynccontextmanager
    async def download_stream(self, key: str) -> AsyncGenerator[BinaryIO, None]:
        """
        Trả về một file-like object để đọc.
        Dùng context manager để tự động đóng/xóa file tạm sau khi dùng xong.
        """
        yield