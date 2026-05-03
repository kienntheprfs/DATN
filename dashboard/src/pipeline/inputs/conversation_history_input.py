"""Input adapter: conversation history via LangGraph checkpointer.

Fetches HumanMessage content + timestamps from the LangGraph PostgreSQL
checkpointer for the POPULAR_QUESTIONS topic type.

Reuses the proven approach from agent-service-toolkit/src/export_official_history.py
but adapted for the dashboard pipeline input protocol.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.pipeline.inputs.base import InputAdapter

logger: logging.Logger = logging.getLogger(__name__)


def _build_agent_db_uri() -> str:
    """Build a psycopg-compatible connection string for the agent database.

    The dashboard database_url typically points to the same Postgres instance.
    The agent service stores its LangGraph checkpoints in the same DB, so we
    reuse the same connection coordinates but with the plain ``postgresql://``
    scheme that ``AsyncPostgresSaver.from_conn_string`` expects.
    """
    url = settings.database_url
    # Normalise scheme — AsyncPostgresSaver needs plain ``postgresql://``
    for prefix in ("postgresql+asyncpg://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql://" + url[len(prefix):]
            break
    return url


class ConversationHistoryInput(InputAdapter):
    """Fetch human messages from LangGraph checkpoints for topic analysis.

    Uses ``AsyncPostgresSaver.alist()`` to iterate all checkpoint tuples,
    extracts HumanMessage content and timestamp, and filters by the requested
    time window.

    De-duplicates messages by content hash to avoid counting the same user
    question multiple times (LangGraph stores checkpoint snapshots so the
    same message appears in every snapshot of a thread).
    """

    async def fetch(
        self,
        db: AsyncSession,          # unused — we connect directly via psycopg
        from_ts: datetime,
        to_ts: datetime,
    ) -> list[tuple[str, datetime | None]]:
        """Fetch human messages from LangGraph checkpointer within time range."""
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            from langchain_core.messages import HumanMessage
        except ImportError as exc:
            logger.error(
                "langgraph / langchain_core not installed; "
                "cannot fetch conversation history: %s", exc,
            )
            return []

        db_uri = _build_agent_db_uri()
        logger.info("Connecting to agent DB for conversation history...")

        # Normalise from/to to UTC-aware for comparison
        from_utc = from_ts.astimezone(timezone.utc) if from_ts.tzinfo else from_ts.replace(tzinfo=timezone.utc)
        to_utc = to_ts.astimezone(timezone.utc) if to_ts.tzinfo else to_ts.replace(tzinfo=timezone.utc)

        # Track seen messages to avoid duplicates from checkpoint snapshots.
        # Key = (thread_id, content_hash) to deduplicate per-thread.
        seen: set[tuple[str, str]] = set()
        documents: list[tuple[str, datetime | None]] = []

        try:
            async with AsyncPostgresSaver.from_conn_string(db_uri) as checkpointer:
                async for checkpoint_tuple in checkpointer.alist(config=None):
                    thread_id = checkpoint_tuple.config.get("configurable", {}).get(
                        "thread_id", "unknown"
                    )
                    state_values = checkpoint_tuple.checkpoint.get("channel_values", {})
                    messages = state_values.get("messages", [])

                    if not messages:
                        continue

                    for msg in messages:
                        if not isinstance(msg, HumanMessage):
                            continue

                        # Extract content
                        content = self._extract_content(msg)
                        if not content or len(content.strip()) < 3:
                            continue

                        # Deduplicate: same user message in same thread
                        dedup_key = (thread_id, content.strip())
                        if dedup_key in seen:
                            continue
                        seen.add(dedup_key)

                        # Extract timestamp from additional_kwargs
                        ts = self._extract_timestamp(msg)

                        # Normalise timestamp to UTC-aware
                        if ts is not None:
                            if ts.tzinfo is None:
                                ts = ts.replace(tzinfo=timezone.utc)
                            else:
                                ts = ts.astimezone(timezone.utc)

                            # Time-range filter
                            if ts < from_utc or ts >= to_utc:
                                continue

                        documents.append((content, ts))

            logger.info("conversation history input: %d documents", len(documents))
            return documents

        except Exception:
            logger.exception("failed to fetch conversation history input")
            raise

    @staticmethod
    def _extract_content(msg) -> str:
        """Extract text content from a LangChain message."""
        content = msg.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict) and item.get("type") == "text":
                    parts.append(item.get("text", ""))
            return "".join(parts)
        return str(content)

    @staticmethod
    def _extract_timestamp(msg) -> datetime | None:
        """Extract the original timestamp from a LangChain message."""
        raw_ts = None
        if hasattr(msg, "additional_kwargs"):
            raw_ts = msg.additional_kwargs.get("timestamp")
        if raw_ts is None:
            return None
        try:
            return datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
