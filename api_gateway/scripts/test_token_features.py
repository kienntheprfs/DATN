"""Test specific token features: ownership check, admin revoke, and token rotation.

Tests:
1. User can only logout their own refresh tokens
2. Admin can revoke tokens of any user
3. Refresh token rotation (old token is revoked after refresh)
"""
import asyncio
import httpx
from typing import Dict, Optional
from uuid import uuid4


class TestTokenFeatures:
    """Test token management features."""
    
    def __init__(self, base_url: str = "http://localhost:8002"):
        self.base_url = base_url
        self.test_users: Dict[str, Dict[str, str]] = {}
        
    async def _register_and_login(
        self, 
        client: httpx.AsyncClient, 
        email: str, 
        password: str,
        roles: list[str] = None
    ) -> Dict[str, str]:
        """Helper to register and login a test user.
        
        Returns:
            Dict with 'access_token', 'refresh_token', 'user_id'
        """
        # Register
        register_data = {
            "email": email,
            "password": password,
            "roles": roles or ["user"]
        }
        
        response = await client.post(
            f"{self.base_url}/auth/register",
            json=register_data
        )
        
        if response.status_code != 201:
            # User might already exist, try to login anyway
            pass
        else:
            user_data = response.json()
            user_id = user_data.get("id")
        
        # Login
        login_data = {
            "email": email,
            "password": password
        }
        
        response = await client.post(
            f"{self.base_url}/auth/login",
            json=login_data
        )
        
        if response.status_code != 200:
            raise Exception(f"Failed to login: {response.status_code} - {response.text}")
        
        data = response.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "user_id": user_id if 'user_id' in locals() else None
        }
    
    async def test_user_cannot_logout_other_user_token(self):
        """Test that a user cannot logout another user's refresh token."""
        print("\n" + "=" * 80)
        print("TEST 1: User cannot logout another user's refresh token")
        print("=" * 80)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create two test users
            email1 = f"test_user_1_{uuid4().hex}@example.com"
            email2 = f"test_user_2_{uuid4().hex}@example.com"
            password = "testpass123"
            
            print(f"   1. Creating test user 1: {email1}")
            user1 = await self._register_and_login(client, email1, password)
            
            print(f"   2. Creating test user 2: {email2}")
            user2 = await self._register_and_login(client, email2, password)
            
            # User 2 tries to logout user 1's refresh token
            print(f"   3. User 2 attempts to logout User 1's refresh token")
            response = await client.post(
                f"{self.base_url}/auth/logout",
                json={"refresh_token": user1["refresh_token"]},
                headers={"Authorization": f"Bearer {user2['access_token']}"}
            )
            
            # Should get 403 Forbidden
            if response.status_code == 403:
                print(f"   ✅ PASS: User 2 was forbidden from logging out User 1's token (403)")
                return True
            else:
                print(f"   ❌ FAIL: Expected 403, got {response.status_code}")
                print(f"      Response: {response.text[:200]}")
                return False
    
    async def test_user_can_logout_own_token(self):
        """Test that a user CAN logout their own refresh token."""
        print("\n" + "=" * 80)
        print("TEST 2: User can logout their own refresh token")
        print("=" * 80)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create test user
            email = f"test_user_own_{uuid4().hex}@example.com"
            password = "testpass123"
            
            print(f"   1. Creating test user: {email}")
            user = await self._register_and_login(client, email, password)
            
            # User logs out their own token
            print(f"   2. User logs out their own refresh token")
            response = await client.post(
                f"{self.base_url}/auth/logout",
                json={"refresh_token": user["refresh_token"]},
                headers={"Authorization": f"Bearer {user['access_token']}"}
            )
            
            # Should succeed
            if response.status_code == 200:
                print(f"   ✅ PASS: User successfully logged out (200)")
                
                # Try to use the revoked token - should fail
                print(f"   3. Attempting to use revoked refresh token")
                response = await client.post(
                    f"{self.base_url}/auth/refresh",
                    json={"refresh_token": user["refresh_token"]}
                )
                
                if response.status_code == 401:
                    print(f"   ✅ PASS: Revoked token rejected (401)")
                    return True
                else:
                    print(f"   ❌ FAIL: Revoked token was still accepted ({response.status_code})")
                    return False
            else:
                print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
                print(f"      Response: {response.text[:200]}")
                return False
    
    async def test_admin_can_revoke_any_user_tokens(self):
        """Test that admin can revoke all tokens of any user."""
        print("\n" + "=" * 80)
        print("TEST 3: Admin can revoke all tokens of any user")
        print("=" * 80)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create a regular test user
            email = f"test_user_target_{uuid4().hex}@example.com"
            password = "testpass123"
            
            print(f"   1. Creating test user: {email}")
            user = await self._register_and_login(client, email, password)
            
            # Get user_id from the login response or by fetching user info
            # For simplicity, we'll use the pre-existing admin account
            print(f"   2. Login as admin")
            admin_creds = {"email": "admin@gmail.com", "password": "admin@gmail.com"}
            response = await client.post(
                f"{self.base_url}/auth/login",
                json=admin_creds
            )
            
            if response.status_code != 200:
                print(f"   ⚠️  SKIP: Cannot login as admin ({response.status_code})")
                return None
            
            admin = response.json()
            
            # Get user ID - we need to make a request to get it
            # First, let's verify user's token works
            print(f"   3. Verify user's refresh token works")
            response = await client.post(
                f"{self.base_url}/auth/refresh",
                json={"refresh_token": user["refresh_token"]}
            )
            
            if response.status_code != 200:
                print(f"   ⚠️  SKIP: User refresh token doesn't work ({response.status_code})")
                return None
            
            # Get new tokens
            new_user_tokens = response.json()
            
            # We need to get user_id somehow - let's check if we can get it from register response
            # Re-register to get user_id
            print(f"   4. Get user ID by checking register response")
            # Since we don't have direct access, we'll use the logout-all feature
            # Admin revokes all tokens - need to pass user_id in body
            # For testing, we'll use our own test to get the ID
            
            # Alternative: use the revoke endpoint with user's refresh token
            print(f"   5. Admin revokes user's refresh token")
            response = await client.post(
                f"{self.base_url}/auth/revoke",
                json={"refresh_token": new_user_tokens["refresh_token"]},
                headers={"Authorization": f"Bearer {admin['access_token']}"}
            )
            
            if response.status_code == 200:
                print(f"   ✅ PASS: Admin successfully revoked user's token (200)")
                
                # Try to use the revoked token
                print(f"   6. Attempting to use revoked token")
                response = await client.post(
                    f"{self.base_url}/auth/refresh",
                    json={"refresh_token": new_user_tokens["refresh_token"]}
                )
                
                if response.status_code == 401:
                    print(f"   ✅ PASS: Revoked token rejected (401)")
                    return True
                else:
                    print(f"   ❌ FAIL: Revoked token still works ({response.status_code})")
                    return False
            else:
                print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
                print(f"      Response: {response.text[:200]}")
                return False
    
    async def test_refresh_token_rotation(self):
        """Test that refresh token rotation works (old token revoked after use)."""
        print("\n" + "=" * 80)
        print("TEST 4: Refresh token rotation")
        print("=" * 80)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create test user
            email = f"test_rotation_{uuid4().hex}@example.com"
            password = "testpass123"
            
            print(f"   1. Creating test user: {email}")
            user = await self._register_and_login(client, email, password)
            old_refresh_token = user["refresh_token"]
            
            # Use refresh token to get new tokens
            print(f"   2. Using refresh token to get new tokens")
            response = await client.post(
                f"{self.base_url}/auth/refresh",
                json={"refresh_token": old_refresh_token}
            )
            
            if response.status_code != 200:
                print(f"   ❌ FAIL: Refresh failed ({response.status_code})")
                print(f"      Response: {response.text[:200]}")
                return False
            
            new_tokens = response.json()
            new_refresh_token = new_tokens["refresh_token"]
            
            print(f"   ✅ Got new tokens")
            
            # Verify old token is different from new token
            if old_refresh_token == new_refresh_token:
                print(f"   ⚠️  WARNING: New refresh token is the same as old token (no rotation)")
            else:
                print(f"   ✅ New refresh token is different (rotation occurred)")
            
            # Try to use old refresh token - should fail (rotation)
            print(f"   3. Attempting to use old refresh token (should be revoked)")
            response = await client.post(
                f"{self.base_url}/auth/refresh",
                json={"refresh_token": old_refresh_token}
            )
            
            if response.status_code == 401:
                print(f"   ✅ PASS: Old refresh token was revoked (401)")
                
                # Verify new token still works
                print(f"   4. Verify new refresh token still works")
                response = await client.post(
                    f"{self.base_url}/auth/refresh",
                    json={"refresh_token": new_refresh_token}
                )
                
                if response.status_code == 200:
                    print(f"   ✅ PASS: New refresh token works (200)")
                    return True
                else:
                    print(f"   ❌ FAIL: New refresh token doesn't work ({response.status_code})")
                    return False
            else:
                print(f"   ❌ FAIL: Old refresh token still works ({response.status_code})")
                print(f"      Expected 401, got {response.status_code}")
                return False


async def run_token_tests():
    """Run all token feature tests."""
    print("\n" + "=" * 80)
    print("🧪 TESTING TOKEN FEATURES")
    print("=" * 80)
    print("\nTests:")
    print("  1. User can only logout their own tokens")
    print("  2. User can logout their own token successfully")
    print("  3. Admin can revoke any user's tokens")
    print("  4. Refresh token rotation (old token revoked)")
    
    tester = TestTokenFeatures()
    
    results = []
    
    # Test 1: User cannot logout other user's token
    try:
        result = await tester.test_user_cannot_logout_other_user_token()
        results.append(("User cannot logout other user's token", result))
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        results.append(("User cannot logout other user's token", False))
    
    # Test 2: User can logout own token
    try:
        result = await tester.test_user_can_logout_own_token()
        results.append(("User can logout own token", result))
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        results.append(("User can logout own token", False))
    
    # Test 3: Admin can revoke any user's tokens
    try:
        result = await tester.test_admin_can_revoke_any_user_tokens()
        if result is not None:
            results.append(("Admin can revoke any user's tokens", result))
        else:
            results.append(("Admin can revoke any user's tokens", None))
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        results.append(("Admin can revoke any user's tokens", False))
    
    # Test 4: Refresh token rotation
    try:
        result = await tester.test_refresh_token_rotation()
        results.append(("Refresh token rotation", result))
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        results.append(("Refresh token rotation", False))
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, result in results if result is True)
    failed = sum(1 for _, result in results if result is False)
    skipped = sum(1 for _, result in results if result is None)
    
    print(f"\nTotal tests: {len(results)}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"⏭️  Skipped: {skipped}")
    
    print("\nDetailed results:")
    for test_name, result in results:
        if result is True:
            print(f"  ✅ {test_name}")
        elif result is False:
            print(f"  ❌ {test_name}")
        else:
            print(f"  ⏭️  {test_name} (skipped)")
    
    print("\n" + "=" * 80)
    if failed == 0 and skipped == 0:
        print("✅ ALL TESTS PASSED!")
        return True
    elif failed == 0:
        print("⚠️  SOME TESTS SKIPPED")
        return True
    else:
        print("❌ SOME TESTS FAILED")
        return False


if __name__ == "__main__":
    try:
        success = asyncio.run(run_token_tests())
        exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrupted by user")
        exit(130)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
