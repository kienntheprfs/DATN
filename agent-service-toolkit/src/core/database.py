from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from core.settings import settings
from sqlalchemy.orm import declarative_base
import ssl

Base = declarative_base()

# Sử dụng lại đúng các biến cấu hình mà postgres.py đang dùng
# Lưu ý: Cần cài đặt asyncpg bằng lệnh `pip install asyncpg` nếu chưa có
DATABASE_URL = (
    f"postgresql+asyncpg://{settings.POSTGRES_USER}:"
    f"{settings.POSTGRES_PASSWORD.get_secret_value()}@"
    f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/"
    f"{settings.POSTGRES_DB}"
)

connect_args = {}

if getattr(settings, "POSTGRES_SSL_MODE", "disable") == "require":
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False  # Bỏ qua check hostname (tương đương rejectUnauthorized: false)
    ssl_context.verify_mode = ssl.CERT_NONE  # Bỏ qua check chứng chỉ
    connect_args["ssl"] = ssl_context

engine = create_async_engine(DATABASE_URL, connect_args=connect_args, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

async def get_db():
    """Dependency cung cấp session database cho các API."""
    async with AsyncSessionLocal() as session:
        yield session