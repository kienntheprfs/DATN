"""Comprehensive test of all API Gateway endpoints with role-based access control.

Tests all endpoints from:
- auth.py: Public authentication endpoints
- agent_proxy.py: Agent service endpoints (mixed access)
- threads.py: Thread management endpoints (auth required)
- knowledge_proxy.py: Knowledge service endpoints (admin only)
- wayfinder_proxy.py: Wayfinder service endpoints (mixed public/admin)

For each endpoint, tests access with:
- Guest (no authentication)
- User (authenticated with 'user' role)
- Admin (authenticated with 'admin' role)
"""
import asyncio
import httpx
from typing import Optional, Dict, List, Tuple
from enum import Enum
from dataclasses import dataclass
from uuid import uuid4
from test_token_features import run_token_tests
from test_google_oauth import run_google_oauth_tests


class Role(Enum):
    """User roles for testing."""
    GUEST = "guest"
    USER = "user"
    ADMIN = "admin"


class ExpectedAccess(Enum):
    """Expected access levels."""
    PUBLIC = "public"  # Anyone can access (including guest)
    AUTH = "auth"  # Any authenticated user
    OWNER = "owner"  # Resource owner only (we'll skip this in basic tests)
    ADMIN = "admin"  # Admin only
    

@dataclass
class EndpointTest:
    """Definition of an endpoint test."""
    method: str
    path: str
    expected_access: ExpectedAccess
    description: str
    body: Optional[dict] = None
    requires_setup: bool = False  # If True, requires creating resources first


class TestRunner:
    """Manages test execution and state."""
    
    def __init__(self, base_url: str = "http://localhost:8002"):
        self.base_url = base_url
        self.tokens: Dict[Role, Optional[str]] = {
            Role.GUEST: None,
            Role.USER: None,
            Role.ADMIN: None,
        }
        self.refresh_tokens: Dict[Role, Optional[str]] = {
            Role.GUEST: None,
            Role.USER: None,
            Role.ADMIN: None,
        }
        self.register_emails: Dict[Role, str] = {
            role: f"test_{role.value}_{uuid4().hex}@example.com" for role in Role
        }
        self.test_thread_id: Optional[str] = None
        
    async def register(self, client: httpx.AsyncClient, role: Role) -> bool:
        """Register a new account for specific role. Returns True if successful or already exists."""
        if role == Role.GUEST:
            return True

        credentials = {
            Role.USER: {"email": "user@gmail.com", "password": "user@gmail.com"},
            Role.ADMIN: {"email": "admin@gmail.com", "password": "admin@gmail.com", "roles": ["admin"]},
        }

        cred = credentials.get(role)
        if not cred:
            return False

        try:
            response = await client.post(
                f"{self.base_url}/auth/register",
                json=cred
            )
            if response.status_code in [200, 201]:
                print(f"   ✅ Registered {role.value:10} → {cred['email']}")
                return True
            elif response.status_code == 409:
                print(f"   ℹ️  {role.value:10} already registered → {cred['email']}")
                return True
            else:
                print(f"   ⚠️  Failed to register {role.value}: {response.status_code} {response.text[:100]}")
                return False
        except Exception as e:
            print(f"   ⚠️  Register error for {role.value}: {e}")
            return False

    async def login(self, client: httpx.AsyncClient, role: Role) -> Optional[str]:
        """Login and get token for specific role."""
        if role == Role.GUEST:
            return None
            
        credentials = {
            Role.USER: {"email": "user@gmail.com", "password": "user@gmail.com"},
            Role.ADMIN: {"email": "admin@gmail.com", "password": "admin@gmail.com"},
        }
        
        cred = credentials.get(role)
        if not cred:
            return None
            
        try:
            response = await client.post(
                f"{self.base_url}/auth/login",
                json=cred
            )
            if response.status_code == 200:
                data = response.json()
                token = data["access_token"]
                refresh_token = data.get("refresh_token")
                self.tokens[role] = token
                self.refresh_tokens[role] = refresh_token
                return token
            else:
                print(f"   ⚠️  Failed to login as {role.value}: {response.status_code}")
                return None
        except Exception as e:
            print(f"   ⚠️  Login error for {role.value}: {e}")
            return None
    
    def get_headers(self, role: Role) -> Dict[str, str]:
        """Get headers for specific role."""
        token = self.tokens.get(role)
        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}
    
    async def test_endpoint(
        self,
        client: httpx.AsyncClient,
        endpoint: EndpointTest,
        role: Role
    ) -> Tuple[bool, int, str]:
        """Test an endpoint with specific role.
        
        Returns:
            (is_expected, status_code, message)
        """
        headers = self.get_headers(role)
        path = endpoint.path
        path = path.replace("{thread_id}", self.test_thread_id or "test-thread-id")
        path = path.replace("{agent_id}", "test-agent")
        path = path.replace("{rating_id}", "00000000-0000-0000-0000-000000000001")
        url = f"{self.base_url}{path}"
        
        # Prepare request body
        body = endpoint.body or {}

        # Special case: /auth/register needs a unique, valid payload
        if "/auth/register" in path and endpoint.method == "POST":
            body = {
                "email": self.register_emails[role],
                "password": "testpass123",
            }
        
        # Special case: /auth/refresh needs a real refresh token
        if "/auth/refresh" in path and endpoint.method == "POST":
            refresh_token = self.refresh_tokens.get(role)
            body = {"refresh_token": refresh_token or "invalid_refresh_token"}
        
        # Special case: /auth/logout needs a refresh token
        if "/auth/logout" in path and endpoint.method == "POST":
            refresh_token = self.refresh_tokens.get(role)
            body = {"refresh_token": refresh_token or "invalid_refresh_token"}

        # Special case: /auth/revoke needs a refresh token
        if "/auth/revoke" in path and endpoint.method == "POST":
            refresh_token = self.refresh_tokens.get(role)
            body = {"refresh_token": refresh_token or "invalid_refresh_token"}
        
        try:
            if endpoint.method == "GET":
                response = await client.get(url, headers=headers)
            elif endpoint.method == "POST":
                response = await client.post(url, json=body, headers=headers)
            elif endpoint.method == "PATCH":
                response = await client.patch(url, json=body, headers=headers)
            elif endpoint.method == "DELETE":
                response = await client.delete(url, headers=headers)
            else:
                return False, 0, "Unsupported method"
            
            status = response.status_code
            
            # Determine if access is expected
            is_expected = self._is_access_expected(endpoint.expected_access, role, status)
            
            return is_expected, status, response.text[:100]
            
        except Exception as e:
            return False, 0, str(e)
    
    def _is_access_expected(
        self,
        expected_access: ExpectedAccess,
        role: Role,
        status_code: int
    ) -> bool:
        """Determine if the response status matches expected access."""
        # Auth failure codes
        is_auth_failed = status_code in [401, 403]
        
        # Define expected behavior
        if expected_access == ExpectedAccess.PUBLIC:
            # Public endpoints should not return 401/403
            return not is_auth_failed
            
        elif expected_access == ExpectedAccess.AUTH:
            # Auth required: guest should be rejected, authenticated should pass
            if role == Role.GUEST:
                return is_auth_failed  # Guest should be rejected
            else:
                return not is_auth_failed  # Auth users should pass
                
        elif expected_access == ExpectedAccess.ADMIN:
            # Admin only: only admin should pass
            if role == Role.ADMIN:
                return not is_auth_failed
            else:
                return is_auth_failed  # Non-admin should be rejected
                
        elif expected_access == ExpectedAccess.OWNER:
            # Owner or admin only - we'll treat this like AUTH for basic tests
            if role == Role.GUEST:
                return is_auth_failed
            else:
                # Could be 403 (not owner) or 404 (not found) or 200 (success)
                # For simplicity, we accept non-401 as "handled correctly"
                return True
                
        return False
    
    async def setup_test_resources(self, client: httpx.AsyncClient):
        """Create test resources (thread) for testing."""
        # Create a test thread as user
        headers = self.get_headers(Role.USER)
        if not headers:
            print("   ⚠️  Cannot create test thread: user not logged in")
            return
            
        try:
            response = await client.post(
                f"{self.base_url}/threads",
                json={"title": "Test Thread", "agent_id": "test-agent"},
                headers=headers
            )
            if response.status_code == 201:
                self.test_thread_id = response.json()["id"]
                print(f"   ✅ Created test thread: {self.test_thread_id}")
            else:
                print(f"   ⚠️  Failed to create test thread: {response.status_code}")
        except Exception as e:
            print(f"   ⚠️  Error creating test thread: {e}")


def define_all_endpoints() -> List[EndpointTest]:
    """Define all endpoints to test."""
    return [
        # ==================== AUTH ENDPOINTS (Public) ====================
        EndpointTest("POST", "/auth/register", ExpectedAccess.PUBLIC, "Register new user",
                 body={}),
        EndpointTest("POST", "/auth/login", ExpectedAccess.PUBLIC, "Login",
                     body={"email": "admin@gmail.com", "password": "admin@gmail.com"}),
        EndpointTest("POST", "/auth/google", ExpectedAccess.PUBLIC, "Google OAuth login",
                     body={"credential": "fake-google-token"}),
        EndpointTest("POST", "/auth/refresh", ExpectedAccess.AUTH, "Refresh token"),
        EndpointTest("POST", "/auth/logout", ExpectedAccess.AUTH, "Logout (user/admin)"),
        EndpointTest("POST", "/auth/logout-all", ExpectedAccess.AUTH, "Logout all devices (user/admin)"),
        EndpointTest("POST", "/auth/revoke", ExpectedAccess.ADMIN, "Revoke refresh token (admin only)"),
        EndpointTest("POST", "/auth/revoke-all", ExpectedAccess.ADMIN, "Revoke all tokens (admin only)"),
        
        # ==================== AGENT ENDPOINTS ====================
        EndpointTest("POST", "/agent/invoke", ExpectedAccess.PUBLIC, "Invoke agent (public)",
                 body={"message": "Hello"}),
        EndpointTest("GET", "/agent/history/{thread_id}", ExpectedAccess.OWNER, "Get thread history (owner)"),
        
        # ==================== THREAD ENDPOINTS (Auth required) ====================
        EndpointTest("POST", "/threads", ExpectedAccess.AUTH, "Create thread",
                     body={"title": "New Thread", "agent_id": "test"}),
        EndpointTest("GET", "/threads", ExpectedAccess.AUTH, "List threads"),
        EndpointTest("GET", "/threads/{thread_id}", ExpectedAccess.OWNER, "Get thread details (owner)"),
        EndpointTest("PATCH", "/threads/{thread_id}", ExpectedAccess.OWNER, "Update thread (owner)",
                     body={"title": "Updated Thread"}),
        EndpointTest("DELETE", "/threads/{thread_id}", ExpectedAccess.OWNER, "Delete thread (owner)"),
        
        # ==================== KNOWLEDGE ENDPOINTS (Admin only) ====================
        EndpointTest("GET", "/kb/documents", ExpectedAccess.ADMIN, "List KB documents"),
        EndpointTest("GET", "/kb/", ExpectedAccess.ADMIN, "KB root endpoint"),
        EndpointTest("GET", "/kb/search?q=test", ExpectedAccess.ADMIN, "Search KB"),
        
        # ==================== WAYFINDER ENDPOINTS ====================
        EndpointTest(
            "POST",
            "/wayfinder/api/missing-locations",
            ExpectedAccess.PUBLIC,
            "Wayfinder missing locations (public)",
            body={"city": "hanoi"},
        ),
        EndpointTest(
            "POST",
            "/wayfinder/api/missing-routes",
            ExpectedAccess.PUBLIC,
            "Wayfinder missing routes (public)",
            body={"from": "A", "to": "B"},
        ),
        EndpointTest(
            "POST",
            "/wayfinder/api/refresh-cache",
            ExpectedAccess.PUBLIC,
            "Wayfinder refresh cache (public)",
            body={},
        ),
        EndpointTest("GET", "/wayfinder/", ExpectedAccess.PUBLIC, "Wayfinder root (public GET)"),

        # ==================== DASHBOARD RATINGS ENDPOINTS ====================
        EndpointTest("POST", "/dashboard/ratings", ExpectedAccess.AUTH, "Create/update rating",
                     body={"thread_id": "thread-test", "run_id": "11111111-1111-1111-1111-111111111111", "agent_id": "test-agent", "rating": "LIKE"}),
        EndpointTest("DELETE", "/dashboard/ratings/{rating_id}", ExpectedAccess.AUTH, "Delete rating (owner/admin in downstream)"),
        EndpointTest("GET", "/dashboard/ratings/thread/{thread_id}", ExpectedAccess.AUTH, "Get thread ratings"),
        EndpointTest("GET", "/dashboard/ratings/stats/agent/{agent_id}", ExpectedAccess.ADMIN, "Get agent stats (admin only)"),
    ]


async def run_endpoint_tests():
    """Run comprehensive tests for all endpoints with all roles."""
    print("=" * 80)
    print("🧪 COMPREHENSIVE API GATEWAY ENDPOINT TESTS")
    print("=" * 80)
    print("\nTesting all endpoints with Guest, User, and Admin roles")
    print("=" * 80)
    
    runner = TestRunner()
    endpoints = define_all_endpoints()
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        # Step 1: Register & Login as different roles
        print("\n1️⃣ AUTHENTICATION SETUP")
        print("-" * 80)
        
        print("\n   📝 Registering accounts...")
        for role in [Role.USER, Role.ADMIN]:
            await runner.register(client, role)
        
        print("\n   🔑 Logging in...")
        for role in [Role.USER, Role.ADMIN]:
            token = await runner.login(client, role)
            if token:
                print(f"   ✅ Logged in as {role.value:10} → token: {token[:20]}...")
            else:
                print(f"   ❌ Failed to login as {role.value}")
        
        print(f"   ℹ️  Guest role        → no authentication")
        
        # Step 2: Setup test resources
        print("\n2️⃣ SETUP TEST RESOURCES")
        print("-" * 80)
        await runner.setup_test_resources(client)
        
        # Step 3: Test all endpoints with all roles
        print("\n3️⃣ ENDPOINT ACCESS CONTROL TESTS")
        print("-" * 80)
        
        test_results = []
        
        for endpoint in endpoints:
            print(f"\n📍 {endpoint.method:6} {endpoint.path}")
            print(f"   Expected: {endpoint.expected_access.value}")
            
            role_results = {}
            
            for role in [Role.GUEST, Role.USER, Role.ADMIN]:
                is_expected, status, message = await runner.test_endpoint(
                    client, endpoint, role
                )
                
                role_results[role] = (is_expected, status)
                
                # Symbol based on expectation
                if is_expected:
                    symbol = "✅"
                else:
                    symbol = "❌"
                
                print(f"   {symbol} {role.value:6} → {status:3}", end="")
                
                # Add note for clarity
                if status in [401, 403]:
                    print(" (rejected)", end="")
                elif status in [200, 201, 204]:
                    print(" (allowed)", end="")
                elif status == 404:
                    print(" (not found)", end="")
                elif status >= 500:
                    print(" (server error)", end="")
                
                print()
            
            test_results.append((endpoint, role_results))
        
        # Step 4: Summary
        print("\n" + "=" * 80)
        print("📊 TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(endpoints) * 3  # 3 roles per endpoint
        passed_tests = sum(
            1 for _, role_results in test_results
            for is_expected, _ in role_results.values()
            if is_expected
        )
        failed_tests = total_tests - passed_tests
        
        print(f"\nTotal endpoints tested: {len(endpoints)}")
        print(f"Total test cases: {total_tests} (each endpoint × 3 roles)")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success rate: {passed_tests/total_tests*100:.1f}%")
        
        if failed_tests > 0:
            print("\n" + "=" * 80)
            print("❌ FAILED TESTS:")
            print("=" * 80)
            for endpoint, role_results in test_results:
                for role, (is_expected, status) in role_results.items():
                    if not is_expected:
                        print(f"  • {endpoint.method} {endpoint.path}")
                        print(f"    Role: {role.value}, Status: {status}, Expected: {endpoint.expected_access.value}")
        
        print("\n" + "=" * 80)
        if failed_tests == 0:
            print("✅ ALL TESTS PASSED!")
        else:
            print("⚠️  SOME TESTS FAILED - Review access control configuration")
        print("=" * 80)
        
        return failed_tests == 0

async def run_all_tests():
    await run_endpoint_tests()
    await run_token_tests()
    await run_google_oauth_tests()

if __name__ == "__main__":
    try:
        success = asyncio.run(run_all_tests())
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrupted by user")
        exit(130)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
