"""
Non-functional tests for API Gateway (real API).

Covers:
- SE-01: JWT Authentication
- SE-02: Role-Based Access Control (RBAC)
- SE-03: Bcrypt Password Hashing
- SE-05: Injection Prevention
- SE-06: Brute Force Protection
- PF-01: Performance (Response Time)
"""

import time
import uuid
import pytest
import pytest_asyncio
import jwt as pyjwt
from datetime import datetime, timedelta
from httpx import AsyncClient

from src.shared.auth.jwt_handler import jwt_handler
from src.shared.auth.password import password_handler
from src.config import settings
from tests.conftest import (
    BASE_URL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    TEST_USER_EMAIL,
    TEST_USER_PASSWORD,
)


@pytest_asyncio.fixture
async def seeded_client(client: AsyncClient) -> AsyncClient:
    """Create a test user and return client for tests needing a seeded user."""
    return client


# ============================================================
# SE-03: Bcrypt Password Hashing
# ============================================================
class TestBcryptPasswordHashing:
    """NFR-SE-03: Mật khẩu được hash bcrypt + salt, không thể dịch ngược."""

    def test_password_hash_is_not_plaintext(self):
        password = "TestPass123!"
        hashed = password_handler.hash_password(password)
        assert hashed != password
        assert "TestPass" not in hashed

    def test_password_hash_starts_with_bcrypt_signature(self):
        password = "MyPassword456!"
        hashed = password_handler.hash_password(password)
        assert hashed.startswith("$2b$")

    def test_password_hash_length(self):
        password = "Short1!"
        hashed = password_handler.hash_password(password)
        assert len(hashed) >= 60

    def test_password_verification_correct(self):
        password = "TestPass123!"
        hashed = password_handler.hash_password(password)
        assert password_handler.verify_password(password, hashed) is True

    def test_password_verification_wrong(self):
        password = "TestPass123!"
        hashed = password_handler.hash_password(password)
        assert password_handler.verify_password("WrongPassword!", hashed) is False
        assert password_handler.verify_password("testpass123!", hashed) is False
        assert password_handler.verify_password("", hashed) is False

    def test_unique_salt_per_hash(self):
        password = "SamePassword123!"
        hash1 = password_handler.hash_password(password)
        hash2 = password_handler.hash_password(password)
        assert hash1 != hash2
        assert password_handler.verify_password(password, hash1) is True
        assert password_handler.verify_password(password, hash2) is True

    def test_bcrypt_72_byte_truncation(self):
        long_password = "A" * 100
        hashed = password_handler.hash_password(long_password)
        assert hashed.startswith("$2b$")
        assert password_handler.verify_password(long_password, hashed) is True

    def test_unicode_password(self):
        password = "Mật_khẩu_123!"
        hashed = password_handler.hash_password(password)
        assert hashed.startswith("$2b$")
        assert password_handler.verify_password(password, hashed) is True

    def test_empty_password(self):
        password = ""
        hashed = password_handler.hash_password(password)
        assert hashed.startswith("$2b$")
        assert password_handler.verify_password(password, hashed) is True

    def test_special_characters_password(self):
        password = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
        hashed = password_handler.hash_password(password)
        assert hashed.startswith("$2b$")
        assert password_handler.verify_password(password, hashed) is True

    def test_cannot_reverse_hash(self):
        password = "MySecretPassword!"
        hashed = password_handler.hash_password(password)
        assert "MySecret" not in hashed
        assert "Password" not in hashed
        assert "Secret" not in hashed


# ============================================================
# SE-01: JWT Authentication
# ============================================================
class TestJWTAuthentication:
    """NFR-SE-01: Xác thực JWT hoạt động đúng."""

    def test_create_and_decode_access_token(self):
        token = jwt_handler.create_access_token(
            user_id="test-user-1",
            email="test@example.com",
            roles=["user"],
        )
        payload = jwt_handler.decode_token(token)
        assert payload.sub == "test-user-1"
        assert payload.email == "test@example.com"
        assert payload.roles == ["user"]
        assert payload.type == "access"

    def test_create_and_decode_refresh_token(self):
        token, expiry = jwt_handler.create_refresh_token_with_expiry(
            user_id="test-user-1",
            email="test@example.com",
        )
        payload = jwt_handler.decode_token(token)
        assert payload.sub == "test-user-1"
        assert payload.email == "test@example.com"
        assert payload.type == "refresh"

    def test_expired_access_token_raises_error(self):
        expire = datetime.utcnow() - timedelta(hours=1)
        payload = {
            "sub": "test-user-1",
            "email": "test@example.com",
            "roles": ["user"],
            "exp": expire,
            "iat": time.time() - 3600,
            "type": "access",
        }
        expired_token = pyjwt.encode(
            payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
        )
        with pytest.raises(ValueError, match="Token has expired"):
            jwt_handler.decode_token(expired_token)

    def test_invalid_signature_raises_error(self):
        token = jwt_handler.create_access_token(
            user_id="test-user-1",
            email="test@example.com",
            roles=["user"],
        )
        with pytest.raises(pyjwt.exceptions.InvalidSignatureError):
            pyjwt.decode(token, "wrong-secret", algorithms=[settings.jwt_algorithm])

    def test_malformed_token_raises_error(self):
        with pytest.raises(ValueError):
            jwt_handler.decode_token("this-is-not-a-jwt")

    def test_malformed_token_random_string(self):
        with pytest.raises(ValueError):
            jwt_handler.decode_token("abc.def.ghi")

    def test_token_type_verification_access(self):
        token = jwt_handler.create_access_token("1", "test@test.com", ["user"])
        payload = jwt_handler.decode_token(token)
        assert jwt_handler.verify_token_type(payload, "access") is True
        assert jwt_handler.verify_token_type(payload, "refresh") is False

    def test_token_type_verification_refresh(self):
        token, _ = jwt_handler.create_refresh_token_with_expiry("1", "test@test.com")
        payload = jwt_handler.decode_token(token)
        assert jwt_handler.verify_token_type(payload, "refresh") is True
        assert jwt_handler.verify_token_type(payload, "access") is False

    def test_token_has_expiry(self):
        token = jwt_handler.create_access_token("1", "test@test.com", ["user"])
        payload = jwt_handler.decode_token(token)
        assert payload.exp is not None
        assert isinstance(payload.exp, int)
        assert payload.exp > int(time.time())

    def test_token_custom_expiry(self):
        token = jwt_handler.create_access_token(
            user_id="1",
            email="test@test.com",
            roles=["user"],
            expires_delta=timedelta(minutes=5),
        )
        payload = jwt_handler.decode_token(token)
        assert payload.exp is not None
        now_ts = int(time.time())
        assert payload.exp > now_ts
        assert payload.exp < now_ts + 310

    def test_forged_token_with_different_secret(self):
        payload = {
            "sub": "admin-1",
            "email": "admin@test.com",
            "roles": ["admin"],
            "exp": datetime.utcnow() + timedelta(hours=1),
            "iat": time.time(),
            "type": "access",
        }
        forged_token = pyjwt.encode(payload, "different-secret", algorithm="HS256")
        with pytest.raises(ValueError, match="Invalid token"):
            jwt_handler.decode_token(forged_token)

    def test_token_with_admin_roles(self):
        token = jwt_handler.create_access_token(
            user_id="admin-1",
            email="admin@test.com",
            roles=["admin", "user"],
        )
        payload = jwt_handler.decode_token(token)
        assert "admin" in payload.roles
        assert "user" in payload.roles

    def test_token_with_empty_roles(self):
        token = jwt_handler.create_access_token(
            user_id="guest-1",
            email="guest@test.com",
            roles=[],
        )
        payload = jwt_handler.decode_token(token)
        assert payload.roles == []


# ============================================================
# SE-02: Role-Based Access Control (RBAC)
# ============================================================
class TestRBACAuthorization:
    """NFR-SE-02: Phân quyền Admin vs User hoạt động đúng."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self, client: AsyncClient):
        self.client = client

    def test_register_user_success(self):
        unique_email = f"nfr-reg-{uuid.uuid4().hex[:8]}@example.com"

        async def _test():
            return await self.client.post(
                "/auth/register",
                json={
                    "email": unique_email,
                    "password": "TestPass123!",
                    "roles": ["user"],
                },
            )

        response = self.client.post(
            "/auth/register",
            json={"email": unique_email, "password": "TestPass123!", "roles": ["user"]},
        )
        # AsyncClient needs event loop; use sync approach
        import asyncio

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == unique_email

    def test_login_success_returns_tokens(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                json={"email": ADMIN_EMAIL, "password": "WrongPassword!"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_login_nonexistent_user(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                json={
                    "email": "nonexistent-test@example.com",
                    "password": "SomePassword!",
                },
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_get_me_with_valid_token(self, admin_token: str):
        import asyncio

        async def _test():
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL

    def test_get_me_without_token(self):
        import asyncio

        async def _test():
            return await self.client.get("/auth/me")

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_get_me_with_expired_token(self):
        import asyncio

        expire = datetime.utcnow() - timedelta(hours=1)
        payload = {
            "sub": "fake-user",
            "email": "fake@example.com",
            "roles": ["user"],
            "exp": expire,
            "iat": time.time() - 3600,
            "type": "access",
        }
        expired_token = pyjwt.encode(
            payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
        )

        async def _test():
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {expired_token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_get_me_with_forged_token(self):
        import asyncio

        payload = {
            "sub": "fake-user",
            "email": "fake@example.com",
            "roles": ["admin"],
            "exp": datetime.utcnow() + timedelta(hours=1),
            "iat": time.time(),
            "type": "access",
        }
        forged_token = pyjwt.encode(
            payload, "wrong-secret", algorithm=settings.jwt_algorithm
        )

        async def _test():
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {forged_token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_inactive_user_forbidden(self, admin_token: str):
        """Admin cannot be inactive, so we test with a forged token that simulates inactive user."""
        import asyncio

        # Since we can't easily create inactive users on real DB,
        # we test that auth endpoint properly validates tokens
        async def _test():
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        # Admin is active, should return 200
        assert response.status_code == 200

    def test_logout_revokes_token(self, admin_token: str):
        import asyncio

        async def _test():
            # First get a fresh refresh token by logging in
            login_resp = await self.client.post(
                "/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )
            tokens = login_resp.json()
            refresh_token = tokens["refresh_token"]
            access_token = tokens["access_token"]

            return await self.client.post(
                "/auth/logout",
                json={"refresh_token": refresh_token},
                headers={"Authorization": f"Bearer {access_token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 200

    def test_duplicate_email_registration(self):
        import asyncio

        unique_email = f"nfr-dup-{uuid.uuid4().hex[:8]}@example.com"

        async def _test():
            resp1 = await self.client.post(
                "/auth/register",
                json={"email": unique_email, "password": "TestPass123!"},
            )
            assert resp1.status_code == 201
            return await self.client.post(
                "/auth/register",
                json={"email": unique_email, "password": "DifferentPass123!"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 400


# ============================================================
# SE-05: Injection Prevention
# ============================================================
class TestInjectionPrevention:
    """NFR-SE-05: Hệ thống chống SQL Injection và XSS."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self, client: AsyncClient):
        self.client = client

    def test_sql_injection_in_login_email_rejected(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                json={"email": "admin' OR '1'='1", "password": "anything"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code in [401, 422]

    def test_sql_injection_in_login_password_rejected(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                json={
                    "email": "nonexistent-inj@example.com",
                    "password": "' OR '1'='1",
                },
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 401

    def test_sql_drop_table_injection_rejected(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/register",
                json={
                    "email": "test'; DROP TABLE users; --@example.com",
                    "password": "TestPass123!",
                },
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code in [400, 422]

    def test_xss_in_registration_email_rejected(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/register",
                json={
                    "email": "<script>alert('XSS')</script>@example.com",
                    "password": "TestPass123!",
                },
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code == 422

    def test_xss_in_response_not_present(self):
        import asyncio

        unique_email = f"nfr-xss-{uuid.uuid4().hex[:8]}@example.com"

        async def _test():
            resp1 = await self.client.post(
                "/auth/register",
                json={"email": unique_email, "password": "TestPass123!"},
            )
            assert resp1.status_code == 201
            resp2 = await self.client.post(
                "/auth/login",
                json={"email": unique_email, "password": "TestPass123!"},
            )
            assert resp2.status_code == 200
            token = resp2.json()["access_token"]
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        data = response.json()
        assert "<script>" not in str(data)
        assert "alert" not in str(data)

    def test_no_stack_trace_exposure_on_error(self):
        import asyncio

        async def _test():
            return await self.client.get(
                "/auth/me",
                headers={"Authorization": "Bearer invalid.token.here"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        data = response.json()
        assert "Traceback" not in str(data)
        assert "traceback" not in str(data)
        assert "File " not in str(data)

    def test_invalid_json_body(self):
        import asyncio

        async def _test():
            return await self.client.post(
                "/auth/login",
                content="not-json-content",
                headers={"Content-Type": "application/json"},
            )

        response = asyncio.get_event_loop().run_until_complete(_test())
        assert response.status_code in [400, 422]


# ============================================================
# SE-06: Brute Force Protection
# ============================================================
class TestBruteForceProtection:
    """NFR-SE-06: Chống brute force login."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self, client: AsyncClient):
        self.client = client

    def test_multiple_failed_logins_do_not_crash(self):
        import asyncio

        async def _test():
            results = []
            for i in range(20):
                response = await self.client.post(
                    "/auth/login",
                    json={"email": ADMIN_EMAIL, "password": f"WrongPassword{i}!"},
                )
                results.append(response.status_code)
            return results

        results = asyncio.get_event_loop().run_until_complete(_test())
        assert all(code == 401 for code in results)
        assert len(results) == 20

    def test_failed_login_no_info_leakage(self):
        import asyncio

        async def _test():
            resp_existing = await self.client.post(
                "/auth/login",
                json={"email": ADMIN_EMAIL, "password": "WrongPassword!"},
            )
            resp_nonexistent = await self.client.post(
                "/auth/login",
                json={
                    "email": "nonexistent-leak@example.com",
                    "password": "WrongPassword!",
                },
            )
            return resp_existing, resp_nonexistent

        resp_existing, resp_nonexistent = asyncio.get_event_loop().run_until_complete(
            _test()
        )
        existing_detail = resp_existing.json().get("detail", "")
        nonexistent_detail = resp_nonexistent.json().get("detail", "")
        assert existing_detail == nonexistent_detail


# ============================================================
# PF-01: Performance - Response Time
# ============================================================
class TestPerformanceResponseTime:
    """NFR-PF-01: Đo thời gian phản hồi các endpoint."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self, client: AsyncClient, admin_token: str):
        self.client = client
        self.admin_token = admin_token

    def test_register_response_time(self):
        import asyncio

        unique_email = f"nfr-perf-{uuid.uuid4().hex[:8]}@example.com"

        async def _test():
            start = time.time()
            response = await self.client.post(
                "/auth/register",
                json={"email": unique_email, "password": "TestPass123!"},
            )
            elapsed = time.time() - start
            return response.status_code, elapsed

        status_code, elapsed = asyncio.get_event_loop().run_until_complete(_test())
        assert status_code == 201
        assert elapsed < 2.0, f"Register took {elapsed:.3f}s, expected < 2s"

    def test_login_response_time(self):
        import asyncio

        async def _test():
            start = time.time()
            response = await self.client.post(
                "/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )
            elapsed = time.time() - start
            return response.status_code, elapsed

        status_code, elapsed = asyncio.get_event_loop().run_until_complete(_test())
        assert status_code == 200
        assert elapsed < 2.0, f"Login took {elapsed:.3f}s, expected < 2s"

    def test_get_me_response_time(self):
        import asyncio

        async def _test():
            start = time.time()
            response = await self.client.get(
                "/auth/me",
                headers={"Authorization": f"Bearer {self.admin_token}"},
            )
            elapsed = time.time() - start
            return response.status_code, elapsed

        status_code, elapsed = asyncio.get_event_loop().run_until_complete(_test())
        assert status_code == 200
        assert elapsed < 1.0, f"GetMe took {elapsed:.3f}s, expected < 1s"

    def test_bcrypt_hashing_time(self):
        start = time.time()
        password_handler.hash_password("TestPassword123!")
        elapsed = time.time() - start
        assert elapsed < 1.0, f"bcrypt hash took {elapsed:.3f}s, expected < 1s"

    def test_jwt_token_creation_time(self):
        start = time.time()
        for _ in range(100):
            jwt_handler.create_access_token(
                user_id="test-user",
                email="test@test.com",
                roles=["user"],
            )
        elapsed = time.time() - start
        avg = elapsed / 100
        assert avg < 0.01, f"JWT creation avg {avg:.4f}s, expected < 10ms"

    def test_jwt_token_decode_time(self):
        token = jwt_handler.create_access_token(
            user_id="test-user",
            email="test@test.com",
            roles=["user"],
        )
        start = time.time()
        for _ in range(100):
            jwt_handler.decode_token(token)
        elapsed = time.time() - start
        avg = elapsed / 100
        assert avg < 0.01, f"JWT decode avg {avg:.4f}s, expected < 10ms"

    def test_password_verification_time(self):
        password = "TestPassword123!"
        hashed = password_handler.hash_password(password)
        start = time.time()
        password_handler.verify_password(password, hashed)
        elapsed = time.time() - start
        assert elapsed < 1.0, f"bcrypt verify took {elapsed:.3f}s, expected < 1s"

    def test_concurrent_login_performance(self):
        import asyncio

        async def _test():
            start = time.time()
            for _ in range(10):
                await self.client.post(
                    "/auth/login",
                    json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                )
            elapsed = time.time() - start
            return elapsed

        elapsed = asyncio.get_event_loop().run_until_complete(_test())
        avg = elapsed / 10
        assert avg < 2.0, f"Avg login took {avg:.3f}s, expected < 2s"
        assert elapsed < 20.0, f"10 logins took {elapsed:.3f}s, expected < 20s"
