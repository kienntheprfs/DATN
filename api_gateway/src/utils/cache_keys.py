"""Cache key generation utilities."""
import hashlib


def generate_jwt_cache_key(token: str) -> str:
    """Generate cache key for JWT token."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    return f"jwt:{token_hash}"


def generate_policy_cache_key(
    user_id: str,
    resource_type: str,
    resource_id: str,
    action: str
) -> str:
    """Generate cache key for OPA policy decision."""
    return f"policy:{user_id}:{resource_type}:{resource_id}:{action}"
