from qdrant_client import AsyncQdrantClient
from src.core.config import settings

class QdrantManager:
    _client: AsyncQdrantClient = None

    @classmethod
    def get_client(cls) -> AsyncQdrantClient:
        """
        Singleton Pattern:
        Nếu client chưa có hoặc đã đóng, tạo mới.
        Nếu đã có, trả về client cũ (tận dụng connection pool).
        """
        if cls._client is None:
            # Chỉ khởi tạo 1 lần
            cls._client = AsyncQdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY,
                # Tùy chỉnh connection pool nếu cần
                timeout=20, 
            )
        return cls._client

    @classmethod
    async def close(cls):
        """Gọi hàm này khi tắt app/worker để dọn dẹp"""
        if cls._client:
            await cls._client.close()
            cls._client = None

# Hàm helper để inject
async def get_qdrant_client() -> AsyncQdrantClient:
    return QdrantManager.get_client()