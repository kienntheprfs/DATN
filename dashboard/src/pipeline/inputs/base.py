"""Input adapters for topic pipeline."""

from abc import abstractmethod
from datetime import datetime
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


class InputAdapter(Protocol):
    """Protocol for input adapters.

    Each adapter returns a list of (document_text, original_created_at) tuples.
    `original_created_at` is the source-system timestamp of the question (e.g.
    `missing_knowledge_logs.created_at`), or None when unavailable.
    """

    @abstractmethod
    async def fetch(
        self,
        db: AsyncSession,
        from_ts: datetime,
        to_ts: datetime,
    ) -> list[tuple[str, datetime | None]]:
        """Fetch and return (document, original_created_at) pairs."""
        ...
