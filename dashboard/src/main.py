"""Dashboard service entrypoint."""

from fastapi import FastAPI

from src.routes.ratings import router as ratings_router


app: FastAPI = FastAPI(
	title="Dashboard Service",
	version="0.1.0",
)


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
	"""Return service health status."""
	return {"status": "healthy"}


app.include_router(ratings_router)
