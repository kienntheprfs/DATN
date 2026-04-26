from sqlalchemy import text
from fastapi import FastAPI
from src.api import documents, document_storage, faqs
from src.core.sql_db_setup import engine
from src.core.logging import setup_logging
from src.core.config import settings
from src.models.models import Base

setup_logging()

app = FastAPI(title="Knowledge Base Service")


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
