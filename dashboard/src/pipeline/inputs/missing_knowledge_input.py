"""Input adapter: missing knowledge logs from agent_schema (read-only)."""

import logging
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.pipeline.inputs.base import InputAdapter

logger: logging.Logger = logging.getLogger(__name__)


class MissingKnowledgeInput(InputAdapter):
    """Fetch missing knowledge logs from agent_schema.missing_knowledge_logs (read-only).

    Returns (query, created_at) tuples so that downstream components can store the
    *actual* question timestamp for accurate trend bucketing.
    """

    async def fetch(
        self, db: AsyncSession, from_ts: datetime, to_ts: datetime
    ) -> list[tuple[str, datetime | None]]:
        """Query missing knowledge logs within time range and return (query, created_at) pairs."""
        stmt = text(
            """
            SELECT query, created_at
            FROM agent_schema.missing_knowledge_logs
            WHERE created_at >= :from_ts
              AND created_at < :to_ts
            ORDER BY created_at DESC
            """
        )
        try:
            result = await db.execute(stmt, {"from_ts": from_ts, "to_ts": to_ts})
            rows = result.fetchall()
            documents: list[tuple[str, datetime | None]] = [
                (str(row[0]), row[1]) for row in rows if row[0]
            ]
            logger.info("missing knowledge input: %d documents", len(documents))
            return documents
        except Exception:
            logger.exception("failed to fetch missing knowledge input")
            raise
