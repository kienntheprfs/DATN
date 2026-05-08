"""Tests for PinnedPostService."""

from datetime import date, datetime
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, ANY

import pytest
from fastapi import HTTPException

from src.models import DashboardPinnedPost
from src.services.pinned_post_service import PinnedPostService
from src.schemas.pinned_post import (
    PinnedPostAdminListParams,
    PinnedPostCreate,
    PinnedPostUpdate,
    PinnedPostCategory,
    PinnedPostReorderPayload,
)

@pytest.fixture
def mock_repo(monkeypatch):
    mock = MagicMock()
    # Mocking the PinnedPostRepository static methods
    monkeypatch.setattr("src.services.pinned_post_service.PinnedPostRepository", mock)
    return mock

@pytest.mark.asyncio
async def test_list_admin(mock_repo) -> None:
    # Setup mock returns
    post = DashboardPinnedPost(
        id=uuid4(),
        title="Test",
        ref_id="REG-2024-TEST",
        display_order=1,
        category="Quy chế Đào tạo",
        pinned_date=date.today(),
        summary="Summary",
        source_url="http://example.com",
        document_type="PDF",
        created_at=datetime.utcnow()
    )
    mock_repo.list_admin = AsyncMock(return_value=([post], 1))
    mock_repo.count_all = AsyncMock(return_value=1)
    mock_repo.get_top_category = AsyncMock(return_value="Quy chế Đào tạo")
    mock_repo.get_last_updated_date = AsyncMock(return_value=datetime.utcnow().date())

    params = PinnedPostAdminListParams(page=1, page_size=10)
    response = await PinnedPostService.list_admin(AsyncMock(), params=params)

    assert len(response.items) == 1
    assert response.total_items == 1
    assert response.stats.total_pins == 1

@pytest.mark.asyncio
async def test_create_shifts_orders(mock_repo) -> None:
    # Setup existing items
    existing_post = DashboardPinnedPost(id=uuid4(), display_order=1)
    mock_repo.list_all_manual = AsyncMock(return_value=[existing_post])
    mock_repo.update = AsyncMock()
    mock_repo.create = AsyncMock()

    payload = PinnedPostCreate(
        title="New Post",
        category=PinnedPostCategory.ACADEMIC_REGULATION,
        summary="Summary",
        source_url="http://example.com",
        document_type="PDF",
        tags=["Tag1"]
    )

    db = AsyncMock()
    response = await PinnedPostService.create(db, payload=payload, user_id="user1")

    # Verify final shift to 2
    assert existing_post.display_order == 2
    
    assert response.title == "New Post"
    assert response.order == 1
    mock_repo.create.assert_called_once()

@pytest.mark.asyncio
async def test_update_not_found(mock_repo) -> None:
    mock_repo.get_by_id = AsyncMock(return_value=None)
    
    with pytest.raises(HTTPException) as exc:
        await PinnedPostService.update(AsyncMock(), post_id=uuid4(), payload=MagicMock())
    assert exc.value.status_code == 404

@pytest.mark.asyncio
async def test_delete_success(mock_repo) -> None:
    post = DashboardPinnedPost(id=uuid4())
    mock_repo.get_by_id = AsyncMock(return_value=post)
    mock_repo.delete = AsyncMock()
    mock_repo.normalize_display_order = AsyncMock()

    await PinnedPostService.delete(AsyncMock(), post_id=post.id)

    mock_repo.delete.assert_called_once_with(ANY, post)
    mock_repo.normalize_display_order.assert_called_once()

@pytest.mark.asyncio
async def test_reorder_success(mock_repo) -> None:
    # Setup 3 existing posts with all required fields for Pydantic validation
    id1, id2, id3 = uuid4(), uuid4(), uuid4()
    common_args = {
        "title": "Title",
        "ref_id": "REF",
        "category": "Quy chế Đào tạo",
        "pinned_date": date.today(),
        "summary": "Summary",
        "source_url": "http://example.com",
        "document_type": "PDF",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    posts = [
        DashboardPinnedPost(id=id1, display_order=1, **common_args),
        DashboardPinnedPost(id=id2, display_order=2, **common_args),
        DashboardPinnedPost(id=id3, display_order=3, **common_args),
    ]
    mock_repo.list_all_manual = AsyncMock(return_value=posts)
    mock_repo.update = AsyncMock()

    # Reorder payload: move id3 to top, then id1, then id2
    payload = PinnedPostReorderPayload(ordered_post_ids=[id3, id1, id2])
    
    response = await PinnedPostService.reorder(AsyncMock(), payload=payload)

    # Verify orders
    # id3 (first in list) -> 1
    # id1 (second in list) -> 2
    # id2 (third in list) -> 3
    assert next(p for p in posts if p.id == id3).display_order == 1
    assert next(p for p in posts if p.id == id1).display_order == 2
    assert next(p for p in posts if p.id == id2).display_order == 3
    assert len(response.items) == 3

@pytest.mark.asyncio
async def test_reorder_duplicate_ids(mock_repo) -> None:
    mock_repo.list_all_manual = AsyncMock(return_value=[])
    id1 = uuid4()
    payload = PinnedPostReorderPayload(ordered_post_ids=[id1, id1])
    
    with pytest.raises(HTTPException) as exc:
        await PinnedPostService.reorder(AsyncMock(), payload=payload)
    assert exc.value.status_code == 400
    assert "duplicate" in exc.value.detail.lower()

@pytest.mark.asyncio
async def test_reorder_missing_ids(mock_repo) -> None:
    id1, id2 = uuid4(), uuid4()
    # Repository returns 2 items
    common_args = {
        "title": "Title",
        "ref_id": "REF",
        "category": "Quy chế Đào tạo",
        "pinned_date": date.today(),
        "summary": "Summary",
        "source_url": "http://example.com",
        "document_type": "PDF",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    mock_repo.list_all_manual = AsyncMock(return_value=[
        DashboardPinnedPost(id=id1, display_order=1, **common_args),
        DashboardPinnedPost(id=id2, display_order=2, **common_args),
    ])
    
    # Payload only includes 1 item
    payload = PinnedPostReorderPayload(ordered_post_ids=[id1])
    
    with pytest.raises(HTTPException) as exc:
        await PinnedPostService.reorder(AsyncMock(), payload=payload)
    assert exc.value.status_code == 400
    assert "must include all" in exc.value.detail.lower()
