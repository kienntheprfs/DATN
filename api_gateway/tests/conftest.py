"""Test fixtures for API Gateway non-functional tests (real API)."""

import pytest
import pytest_asyncio
import httpx
from typing import AsyncGenerator

from src.shared.auth.jwt_handler import jwt_handler
from src.shared.auth.password import password_handler

BASE_URL = "http://localhost:8008"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
TEST_USER_EMAIL = "nfr-testuser@example.com"
TEST_USER_PASSWORD = "TestUser123!"


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def admin_token(client: httpx.AsyncClient) -> str:
    resp = await client.post(
        "/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def test_user_data(client: httpx.AsyncClient) -> dict:
    """Ensure test user exists, return user info."""
    import uuid

    unique_email = f"nfr-testuser-{uuid.uuid4().hex[:8]}@example.com"
    resp = await client.post(
        "/auth/register",
        json={"email": unique_email, "password": TEST_USER_PASSWORD, "roles": ["user"]},
    )
    assert resp.status_code in (201, 400)
    login_resp = await client.post(
        "/auth/login",
        json={"email": unique_email, "password": TEST_USER_PASSWORD},
    )
    assert login_resp.status_code == 200, f"Test user login failed: {login_resp.text}"
    tokens = login_resp.json()
    return {
        "email": unique_email,
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
    }
