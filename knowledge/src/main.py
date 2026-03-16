from fastapi import FastAPI
from src.api import documents, document_storage
from src.core.sql_db_setup import engine
from src.core.logging import setup_logging
from .models.models import Base

setup_logging()

app = FastAPI(title="Knowledge Base Service")

# Create tables (Dev only - Production nên dùng Alembic)
@app.on_event("startup")
async def init_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.include_router(documents.router)
app.include_router(document_storage.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)