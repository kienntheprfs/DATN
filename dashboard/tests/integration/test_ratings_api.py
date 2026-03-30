"""Integration tests for ratings API."""

from uuid import uuid4

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_post_rating_requires_user_header(client: AsyncClient) -> None:
    payload = {
        "run_id": str(uuid4()),
        "rating": "LIKE",
        "comment": None,
        "thread_id": "thread-1",
        "agent_id": "agent-1",
    }

    response = await client.post("/ratings", json=payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_and_update_rating_upsert(client: AsyncClient) -> None:
    run_id = str(uuid4())
    headers = {"X-User-Id": "user-1", "X-User-Roles": "user"}

    create_payload = {
        "run_id": run_id,
        "rating": "LIKE",
        "comment": None,
        "thread_id": "thread-fixed",
        "agent_id": "agent-fixed",
    }
    create_response = await client.post("/ratings", json=create_payload, headers=headers)
    assert create_response.status_code == 201
    created = create_response.json()

    update_payload = {
        "run_id": run_id,
        "rating": "DISLIKE",
        "comment": "bad answer",
        "thread_id": "thread-change-attempt",
        "agent_id": "agent-change-attempt",
    }
    update_response = await client.post("/ratings", json=update_payload, headers=headers)
    assert update_response.status_code == 201
    updated = update_response.json()

    assert updated["id"] == created["id"]
    assert updated["thread_id"] == "thread-fixed"
    assert updated["agent_id"] == "agent-fixed"
    assert updated["rating"] == "DISLIKE"
    assert updated["comment"] == "bad answer"


@pytest.mark.asyncio
async def test_get_thread_ratings_visibility_and_agent_stats(client: AsyncClient) -> None:
    thread_id = "thread-2"
    agent_id = "agent-2"
    run_1 = str(uuid4())
    run_2 = str(uuid4())

    await client.post(
        "/ratings",
        json={"run_id": run_1, "rating": "LIKE", "comment": None, "thread_id": thread_id, "agent_id": agent_id},
        headers={"X-User-Id": "user-1", "X-User-Roles": "user"},
    )
    await client.post(
        "/ratings",
        json={"run_id": run_2, "rating": "DISLIKE", "comment": "wrong", "thread_id": thread_id, "agent_id": agent_id},
        headers={"X-User-Id": "user-2", "X-User-Roles": "user"},
    )

    user_response = await client.get(
        f"/ratings/thread/{thread_id}",
        headers={"X-User-Id": "user-1", "X-User-Roles": "user"},
    )
    assert user_response.status_code == 200
    user_data = user_response.json()
    assert len(user_data) == 1
    assert user_data[0]["user_id"] == "user-1"

    admin_response = await client.get(
        f"/ratings/thread/{thread_id}",
        headers={"X-User-Id": "admin-1", "X-User-Roles": "admin"},
    )
    assert admin_response.status_code == 200
    admin_data = admin_response.json()
    assert len(admin_data) == 2

    forbidden_stats = await client.get(
        f"/ratings/stats/agent/{agent_id}",
        headers={"X-User-Id": "user-1", "X-User-Roles": "user"},
    )
    assert forbidden_stats.status_code == 403

    admin_stats = await client.get(
        f"/ratings/stats/agent/{agent_id}",
        headers={"X-User-Id": "admin-1", "X-User-Roles": "admin"},
    )
    assert admin_stats.status_code == 200
    stats = admin_stats.json()
    assert stats["total"] == 2
    assert stats["like_count"] == 1
    assert stats["dislike_count"] == 1


@pytest.mark.asyncio
async def test_delete_rating_owner_and_forbidden(client: AsyncClient) -> None:
    run_id = str(uuid4())

    create_response = await client.post(
        "/ratings",
        json={
            "run_id": run_id,
            "rating": "LIKE",
            "comment": None,
            "thread_id": "thread-delete",
            "agent_id": "agent-delete",
        },
        headers={"X-User-Id": "owner", "X-User-Roles": "user"},
    )
    rating_id = create_response.json()["id"]

    forbidden_delete = await client.delete(
        f"/ratings/{rating_id}",
        headers={"X-User-Id": "other", "X-User-Roles": "user"},
    )
    assert forbidden_delete.status_code == 403

    owner_delete = await client.delete(
        f"/ratings/{rating_id}",
        headers={"X-User-Id": "owner", "X-User-Roles": "user"},
    )
    assert owner_delete.status_code == 204