"""Dashboard service entrypoint."""

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
