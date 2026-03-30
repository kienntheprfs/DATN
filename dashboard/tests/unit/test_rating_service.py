"""Unit tests for rating service."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.models import AnswerRating, RatingValue
from src.schemas.rating import RatingCreate
from src.services.rating_service import RatingService


@pytest.mark.asyncio
async def test_create_or_update_creates_new_rating(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()

    async def fake_get_by_user_run(*args, **kwargs):
        return None

    async def fake_create(_db, rating):
        return rating

    monkeypatch.setattr("src.services.rating_service.RatingRepository.get_by_user_run", fake_get_by_user_run)
    monkeypatch.setattr("src.services.rating_service.RatingRepository.create", fake_create)

    payload = RatingCreate(
        run_id=uuid4(),
        rating=RatingValue.LIKE,
        comment=None,
        thread_id="thread-1",
        agent_id="agent-1",
    )

    response = await RatingService.create_or_update(db, user_id="user-1", rating_data=payload)

    assert response.user_id == "user-1"
    assert response.rating == RatingValue.LIKE
    assert response.comment is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_keeps_thread_and_agent_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    existing = AnswerRating(
        user_id="user-1",
        run_id=str(uuid4()),
        rating=RatingValue.LIKE,
        comment=None,
        thread_id="thread-fixed",
        agent_id="agent-fixed",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_get_by_user_run(*args, **kwargs):
        return existing

    async def fake_update(_db, rating):
        return rating

    monkeypatch.setattr("src.services.rating_service.RatingRepository.get_by_user_run", fake_get_by_user_run)
    monkeypatch.setattr("src.services.rating_service.RatingRepository.update", fake_update)

    payload = RatingCreate(
        run_id=uuid4(),
        rating=RatingValue.DISLIKE,
        comment="not good",
        thread_id="thread-change-attempt",
        agent_id="agent-change-attempt",
    )

    response = await RatingService.create_or_update(db, user_id="user-1", rating_data=payload)

    assert response.thread_id == "thread-fixed"
    assert response.agent_id == "agent-fixed"
    assert response.rating == RatingValue.DISLIKE
    assert response.comment == "not good"


@pytest.mark.asyncio
async def test_delete_forbidden_for_non_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    db = AsyncMock()
    existing = AnswerRating(
        user_id="owner",
        run_id=str(uuid4()),
        rating=RatingValue.LIKE,
        thread_id="thread-1",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    async def fake_get_by_id(*args, **kwargs):
        return existing

    monkeypatch.setattr("src.services.rating_service.RatingRepository.get_by_id", fake_get_by_id)

    with pytest.raises(HTTPException) as exc_info:
        await RatingService.delete(db, rating_id=existing.id, user_id="other", is_admin=False)

    assert exc_info.value.status_code == 403