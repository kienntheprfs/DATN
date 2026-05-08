from sqlalchemy import text
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from src.api import documents, document_storage, faqs
from src.core.sql_db_setup import engine
from src.core.logging import setup_logging
from src.core.config import settings
from src.models.models import Base

setup_logging()


# Middleware: Chỉ cho phép request từ API Gateway (có header bí mật hợp lệ)
class InternalSecretMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Bỏ qua các endpoint công khai (nếu có)
        public_paths = {"/docs", "/redoc", "/openapi.json", "/health"}
        if request.url.path in public_paths:
            return await call_next(request)

        internal_secret = request.headers.get("X-INTERNAL_SCRET")
        if not internal_secret or internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(
                status_code=403, detail="Forbidden: Invalid internal secret"
            )
        return await call_next(request)


app = FastAPI(title="Knowledge Base Service")
# app.add_middleware(InternalSecretMiddleware)


# Create schema + tables (dev); production should prefer Alembic.
@app.on_event("startup")
async def init_tables():
    async with engine.begin() as conn:
        await conn.execute(
            text(f'CREATE SCHEMA IF NOT EXISTS "{settings.KNOWLEDGE_SCHEMA}"')
        )
        await conn.run_sync(Base.metadata.create_all)


app.include_router(documents.router)
app.include_router(document_storage.router)
app.include_router(faqs.router)
app.include_router(faqs.manual_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
