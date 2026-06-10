"""Dashboard service entrypoint."""

import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    _orig_set_policy = asyncio.set_event_loop_policy
    def _patched_set_policy(policy):
        if isinstance(policy, asyncio.WindowsProactorEventLoopPolicy):
            return
        _orig_set_policy(policy)
    asyncio.set_event_loop_policy = _patched_set_policy

from fastapi import FastAPI

from src.routes.pinned_posts import router as pinned_posts_router
from src.routes.ratings import router as ratings_router
from src.routes.topics import router as topics_router


app: FastAPI = FastAPI(
    title="Dashboard Service",
    version="0.1.0",
)


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Return service health status."""
    return {"status": "healthy"}


app.include_router(ratings_router)
app.include_router(pinned_posts_router)
app.include_router(topics_router)


