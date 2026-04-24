"""Script for cleaning up expired refresh tokens.

This script should be run periodically (e.g., via cron job or background task)
to remove expired refresh tokens from the database.

Usage:
    python -m scripts.cleanup_expired_tokens
    
Or with uv:
    uv run python -m scripts.cleanup_expired_tokens
"""
import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from src.dependencies import AsyncSessionLocal
from src.services.token_service import token_service


async def cleanup_expired_tokens():
    """Clean up expired refresh tokens from the database."""
    print("Starting cleanup of expired refresh tokens...")
    
    async with AsyncSessionLocal() as db:
        try:
            count = await token_service.cleanup_expired_tokens(db)
            print(f"✓ Successfully deleted {count} expired token(s)")
            return count
        except Exception as e:
            print(f"✗ Error during cleanup: {str(e)}")
            raise


if __name__ == "__main__":
    asyncio.run(cleanup_expired_tokens())
