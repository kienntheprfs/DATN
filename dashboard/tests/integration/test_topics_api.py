"""Integration tests for topic APIs."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_latest_result_returns_404_when_empty(client: AsyncClient) -> None:
    response = await client.get("/topics/results/latest", params={"topic_type": "missing_knowledge"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_latest_questions_returns_404_when_empty(client: AsyncClient) -> None:
    response = await client.get(
        "/topics/results/latest/questions",
        params={"topic_type": "popular_questions"},
    )
    assert response.status_code == 404
