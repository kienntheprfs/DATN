from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from .config import settings
import ssl

connect_args = {}

if getattr(settings, "POSTGRES_SSL_MODE", "disable") == "require":
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False  # Bỏ qua check hostname (tương đương rejectUnauthorized: false)
    ssl_context.verify_mode = ssl.CERT_NONE  # Bỏ qua check chứng chỉ
    connect_args["ssl"] = ssl_context

# Azure/gateway often closes idle connections; recycle + pre-ping avoids stale pool conns.
engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=280,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Dependency Injection cho FastAPI
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session