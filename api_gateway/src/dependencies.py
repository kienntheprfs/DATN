from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
import httpx

from src.config import settings

# Database Engine
engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.debug,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()




async def get_http_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Dependency for HTTP client (for proxying requests).
    
    follow_redirects=True: Auto-follow 307/308 redirects from backend services
    This handles trailing slash redirects from knowledge/wayfinder services
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        yield client
