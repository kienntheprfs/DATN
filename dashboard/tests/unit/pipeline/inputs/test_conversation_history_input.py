"""Tests for conversation history input adapter."""

from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import HumanMessage

from src.pipeline.inputs.conversation_history_input import ConversationHistoryInput

class _MockCheckpointTuple:
    def __init__(self, thread_id, messages):
        self.config = {"configurable": {"thread_id": thread_id}}
        self.checkpoint = {"channel_values": {"messages": messages}}

@pytest.mark.asyncio
async def test_fetch_filters_by_time_and_deduplicates(monkeypatch) -> None:
    # Mock langgraph components
    mock_saver = MagicMock()
    mock_saver_instance = AsyncMock()
    mock_saver.from_conn_string.return_value.__aenter__.return_value = mock_saver_instance
    
    # Mock data
    now = datetime.now(timezone.utc)
    from_ts = now - timedelta(days=1)
    to_ts = now + timedelta(days=1)
    
    msg_in_range = HumanMessage(
        content="Question in range", 
        additional_kwargs={"timestamp": now.isoformat()}
    )
    msg_out_range = HumanMessage(
        content="Question out of range", 
        additional_kwargs={"timestamp": (now - timedelta(days=2)).isoformat()}
    )
    msg_duplicate = HumanMessage(
        content="Question in range", 
        additional_kwargs={"timestamp": now.isoformat()}
    )
    
    checkpoint_1 = _MockCheckpointTuple("thread1", [msg_in_range, msg_out_range])
    checkpoint_2 = _MockCheckpointTuple("thread1", [msg_duplicate]) # Duplicate in same thread

    async def mock_alist(*args, **kwargs):
        yield checkpoint_1
        yield checkpoint_2

    mock_saver_instance.alist = mock_alist
    
    # Patch AsyncPostgresSaver in the module where it's used
    import langgraph.checkpoint.postgres.aio
    monkeypatch.setattr(langgraph.checkpoint.postgres.aio, "AsyncPostgresSaver", mock_saver)

    # Run adapter
    adapter = ConversationHistoryInput()
    results = await adapter.fetch(db=None, from_ts=from_ts, to_ts=to_ts)
    
    # Assertions
    # Should only have "Question in range" once (deduplicated by content in same thread)
    assert len(results) == 1
    content, ts = results[0]
    assert content == "Question in range"
    assert ts is not None
    assert ts.year == now.year
