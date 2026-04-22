"""Integration tests for pinned posts admin API."""

import pytest
from httpx import AsyncClient


ADMIN_HEADERS = {"X-User-Id": "admin-1", "X-User-Roles": "admin"}
USER_HEADERS = {"X-User-Id": "user-1", "X-User-Roles": "user"}


def _create_payload(title: str, category: str = "Quy chế Đào tạo") -> dict:
    return {
        "title": title,
        "summary": f"Tóm tắt cho {title}",
        "document_type": "Quy chế / Quyết định",
        "source_url": "https://hcmut.edu.vn/dao-tao/quy-dinh-2024",
        "category": category,
        "tags": ["DAOTAO", "PINNED"],
    }


@pytest.mark.asyncio
async def test_pinned_post_endpoints_require_auth(client: AsyncClient) -> None:
    response = await client.get("/pinned-posts/admin")
    assert response.status_code == 401

    create_response = await client.post("/pinned-posts", json=_create_payload("Test"))
    assert create_response.status_code == 401


@pytest.mark.asyncio
async def test_pinned_post_endpoints_require_admin_role(client: AsyncClient) -> None:
    response = await client.get("/pinned-posts/admin", headers=USER_HEADERS)
    assert response.status_code == 403

    create_response = await client.post(
        "/pinned-posts",
        json=_create_payload("Không đủ quyền"),
        headers=USER_HEADERS,
    )
    assert create_response.status_code == 403


@pytest.mark.asyncio
async def test_create_list_update_delete_pinned_post(client: AsyncClient) -> None:
    create_response = await client.post(
        "/pinned-posts",
        json=_create_payload("Quy định đào tạo mới"),
        headers=ADMIN_HEADERS,
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["order"] == 1
    assert created["ref_id"].startswith("REG-")

    second_response = await client.post(
        "/pinned-posts",
        json=_create_payload("Hướng dẫn cao học", category="Sau Đại học"),
        headers=ADMIN_HEADERS,
    )
    assert second_response.status_code == 201

    list_response = await client.get(
        "/pinned-posts/admin",
        params={"page": 1, "page_size": 4, "search": "đào tạo", "sort_by": "latest"},
        headers=ADMIN_HEADERS,
    )
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 4
    assert payload["total_items"] == 1
    assert len(payload["items"]) == 1
    assert payload["stats"]["total_pins"] == 2
    assert payload["stats"]["active_slots"] == 2

    post_id = created["id"]
    update_response = await client.put(
        f"/pinned-posts/{post_id}",
        json=_create_payload("Quy định đào tạo đã cập nhật", category="Công tác Sinh viên"),
        headers=ADMIN_HEADERS,
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["title"] == "Quy định đào tạo đã cập nhật"
    assert updated["category"] == "Công tác Sinh viên"

    delete_response = await client.delete(f"/pinned-posts/{post_id}", headers=ADMIN_HEADERS)
    assert delete_response.status_code == 204

    after_delete = await client.get("/pinned-posts/admin", headers=ADMIN_HEADERS)
    assert after_delete.status_code == 200
    data = after_delete.json()
    assert data["total_items"] == 1


@pytest.mark.asyncio
async def test_delete_missing_pinned_post_returns_404(client: AsyncClient) -> None:
    response = await client.delete(
        "/pinned-posts/00000000-0000-0000-0000-000000000001",
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reorder_pinned_posts(client: AsyncClient) -> None:
    await client.post(
        "/pinned-posts",
        json=_create_payload("Bài 1"),
        headers=ADMIN_HEADERS,
    )
    await client.post(
        "/pinned-posts",
        json=_create_payload("Bài 2", category="Sau Đại học"),
        headers=ADMIN_HEADERS,
    )
    await client.post(
        "/pinned-posts",
        json=_create_payload("Bài 3", category="Nghiên cứu Khoa học"),
        headers=ADMIN_HEADERS,
    )

    all_response = await client.get(
        "/pinned-posts/admin",
        params={"page": 1, "page_size": 100, "sort_by": "manual"},
        headers=ADMIN_HEADERS,
    )
    assert all_response.status_code == 200
    all_items = all_response.json()["items"]
    assert len(all_items) >= 3

    ordered_ids = [item["id"] for item in all_items]
    reordered_ids = [ordered_ids[-1], *ordered_ids[:-1]]

    reorder_response = await client.put(
        "/pinned-posts/reorder",
        json={"ordered_post_ids": reordered_ids},
        headers=ADMIN_HEADERS,
    )

    assert reorder_response.status_code == 200
    reordered = reorder_response.json()["items"]
    assert [item["id"] for item in reordered] == reordered_ids
    assert [item["order"] for item in reordered] == list(range(1, len(reordered_ids) + 1))
