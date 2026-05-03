"""Tests for popular questions input adapter."""

from datetime import datetime, timezone

import pytest

from src.pipeline.inputs.popular_questions_input import PopularQuestionsInput


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def get(self, endpoint, params=None, headers=None):
        page = params.get("page", 1)
        if page == 1:
            return _FakeResponse(
                {
                    "messages": [
                        {"type": "human", "content": "Q1"},
                        {"type": "ai", "content": "A1"},
                    ],
                    "has_more": True,
                }
            )
        return _FakeResponse(
            {
                "messages": [
                    {"type": "human", "content": "Q2"},
                ],
                "has_more": False,
            }
        )


@pytest.mark.asyncio
async def test_fetch_paginates_and_filters_human_messages(monkeypatch) -> None:
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", lambda timeout=None: _FakeClient())

    adapter = PopularQuestionsInput()
    docs = await adapter.fetch(
        db=None,
        from_ts=datetime.now(timezone.utc),
        to_ts=datetime.now(timezone.utc),
    )

    assert docs == ["Q1", "Q2"]
