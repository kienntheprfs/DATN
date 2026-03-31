from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from core.settings import settings
from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Sử dụng lại đúng các biến cấu hình mà postgres.py đang dùng
# Lưu ý: Cần cài đặt asyncpg bằng lệnh `pip install asyncpg` nếu chưa có
DATABASE_URL = (
    f"postgresql+asyncpg://{settings.POSTGRES_USER}:"
    f"{settings.POSTGRES_PASSWORD.get_secret_value()}@"
    f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/"
    f"{settings.POSTGRES_DB}"
)

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db():
    """Dependency cung cấp session database cho các API."""
    async with AsyncSessionLocal() as session:
        yield session