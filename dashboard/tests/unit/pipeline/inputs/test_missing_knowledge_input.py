"""Tests for missing knowledge input adapter."""

from datetime import datetime, timezone

import pytest

from src.pipeline.inputs.missing_knowledge_input import MissingKnowledgeInput


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _FakeSession:
    async def execute(self, stmt, params):
        assert "from_ts" in params
        assert "to_ts" in params
        return _FakeResult([
            ("Cau hoi 1", datetime.now()),
            ("Cau hoi 2", datetime.now()),
            (None, None),
        ])


@pytest.mark.asyncio
async def test_fetch_returns_queries_only() -> None:
    adapter = MissingKnowledgeInput()
    docs = await adapter.fetch(
        _FakeSession(),
        datetime.now(timezone.utc),
        datetime.now(timezone.utc),
    )
    assert len(docs) == 2
    assert docs[0][0] == "Cau hoi 1"
    assert docs[1][0] == "Cau hoi 2"
