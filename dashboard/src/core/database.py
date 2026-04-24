"""Database setup and session dependency for dashboard service."""

from collections.abc import AsyncGenerator
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.core.settings import settings


logger: logging.Logger = logging.getLogger(__name__)


async_engine = create_async_engine(
	settings.database_url_async,
	pool_pre_ping=True,
	pool_size=settings.db_pool_size,
	max_overflow=settings.db_max_overflow,
	pool_timeout=settings.db_pool_timeout,
	pool_recycle=settings.db_pool_recycle,
)

AsyncSessionLocal = async_sessionmaker(
	async_engine,
	class_=AsyncSession,
	expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
	"""Yield an async DB session with rollback on exception."""
	async with AsyncSessionLocal() as session:
		try:
			yield session
		except Exception:
			await session.rollback()
			logger.exception("Database session failed.")
			raise
		finally:
			await session.close()
