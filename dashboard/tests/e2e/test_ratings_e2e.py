"""End-to-end tests for ratings API against a live dashboard server."""

from __future__ import annotations

import os
from uuid import uuid4

import pytest
from httpx import AsyncClient
from dotenv import load_dotenv

load_dotenv()  # tìm .env (có thể ở parent dir) và load biến môi trường từ đó

RUN_E2E = os.getenv("DASHBOARD_RUN_E2E", "0") == "1"
BASE_URL = os.getenv("DASHBOARD_E2E_BASE_URL", "http://localhost:8010")

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(not RUN_E2E, reason="Set DASHBOARD_RUN_E2E=1 to run e2e tests."),
]


@pytest.mark.asyncio
async def test_ratings_create_get_delete_e2e() -> None:
    """Verify create, read and delete rating flow through real HTTP endpoints."""
    run_id = str(uuid4())
    thread_id = f"e2e-thread-{uuid4().hex[:20]}"
    agent_id = "e2e-agent"
    headers = {"X-User-Id": f"e2e-user-{uuid4().hex[:20]}", "X-User-Roles": "user"}

    async with AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        create_response = await client.post(
            "/ratings",
            headers=headers,
            json={
                "run_id": run_id,
                "rating": "DISLIKE",
                "comment": "e2e-check",
                "thread_id": thread_id,
                "agent_id": agent_id,
            },
        )
        assert create_response.status_code == 201, create_response.text
        created = create_response.json()
        rating_id = created["id"]

        get_response = await client.get(f"/ratings/thread/{thread_id}", headers=headers)
        assert get_response.status_code == 200, get_response.text
        ratings = get_response.json()
        assert any(item["id"] == rating_id for item in ratings)

        delete_response = await client.delete(f"/ratings/{rating_id}", headers=headers)
        assert delete_response.status_code == 204, delete_response.text


@pytest.mark.asyncio
async def test_ratings_stats_admin_only_e2e() -> None:
    """Verify stats endpoint requires admin and returns aggregate values for admin."""
    agent_id = f"e2e-agent-{uuid4()}"
    thread_id = f"e2e-thread-{uuid4().hex[:20]}"
    user_headers = {"X-User-Id": f"e2e-user-{uuid4().hex[:20]}", "X-User-Roles": "user"}
    admin_headers = {"X-User-Id": f"e2e-admin-{uuid4().hex[:20]}", "X-User-Roles": "admin"}
    run_ids = [str(uuid4()), str(uuid4())]

    async with AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        like_response = await client.post(
            "/ratings",
            headers=user_headers,
            json={
                "run_id": run_ids[0],
                "rating": "LIKE",
                "comment": None,
                "thread_id": thread_id,
                "agent_id": agent_id,
            },
        )
        assert like_response.status_code == 201, like_response.text

        dislike_response = await client.post(
            "/ratings",
            headers={"X-User-Id": f"e2e-user-{uuid4().hex[:20]}", "X-User-Roles": "user"},
            json={
                "run_id": run_ids[1],
                "rating": "DISLIKE",
                "comment": "e2e-stats",
                "thread_id": thread_id,
                "agent_id": agent_id,
            },
        )
        assert dislike_response.status_code == 201, dislike_response.text

        forbidden_response = await client.get(
            f"/ratings/stats/agent/{agent_id}",
            headers=user_headers,
        )
        assert forbidden_response.status_code == 403, forbidden_response.text

        admin_response = await client.get(
            f"/ratings/stats/agent/{agent_id}",
            headers=admin_headers,
        )
        assert admin_response.status_code == 200, admin_response.text
        stats = admin_response.json()
        assert stats["total"] >= 2
        assert stats["like_count"] >= 1
        assert stats["dislike_count"] >= 1
