"""Cache service for Redis operations."""
import json
from typing import Optional, Any
from redis.asyncio import Redis

from src.config import settings


class CacheService:
    """Redis cache operations."""
    
    @staticmethod
    async def get(redis: Redis, key: str) -> Optional[Any]:
        """Get value from cache."""
        value = await redis.get(key)
        if value:
            return json.loads(value)
        return None
    
    @staticmethod
    async def set(
        redis: Redis,
        key: str,
        value: Any,
        ttl: int = settings.redis_cache_ttl
    ) -> None:
        """Set value in cache with TTL."""
        await redis.setex(
            key,
            ttl,
            json.dumps(value)
        )
    
    @staticmethod
    async def delete(redis: Redis, key: str) -> None:
        """Delete key from cache."""
        await redis.delete(key)
    
    @staticmethod
    async def exists(redis: Redis, key: str) -> bool:
        """Check if key exists in cache."""
        return await redis.exists(key) > 0


# Global instance
cache_service = CacheService()
