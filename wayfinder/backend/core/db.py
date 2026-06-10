from pathlib import Path
import os
import time
from sqlmodel import create_engine, SQLModel, text, Session
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

BASE_PKG = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_PKG / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

DB_USER = os.getenv("WAYFINDER_DB_USER", "postgres")
DB_PASSWORD = os.getenv("WAYFINDER_DB_PASSWORD", "postgres")
DB_HOST = os.getenv("WAYFINDER_DB_HOST", "localhost")
DB_PORT = os.getenv("WAYFINDER_DB_PORT", "5432")
DB_NAME = os.getenv("WAYFINDER_DB_NAME", "knowledge_db")
DB_SCHEMA = os.getenv("WAYFINDER_DB_SCHEMA", "wayfinder")

ENV_URL = os.getenv("WAYFINDER_DB_URL") or os.getenv("DATABASE_URL")

if ENV_URL:
    DB_URL = ENV_URL
    engine = create_engine(
        DB_URL,
        echo=False,
        poolclass=NullPool,
        pool_pre_ping=True,
    )
else:
    DB_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(
        DB_URL,
        echo=False,
        connect_args={"options": f"-c search_path={DB_SCHEMA}"},
        poolclass=NullPool,
        pool_pre_ping=True,
    )


def ensure_schema():
    for attempt in range(3):
        try:
            with engine.connect() as conn:
                conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {DB_SCHEMA}"))
                conn.commit()
            return
        except Exception as e:
            if attempt < 2:
                time.sleep(2**attempt)
            else:
                raise


def init_db():
    ensure_schema()
    from backend.models.entities import (
        Building,
        Map,
        Node,
        Alias,
        Edge,
        Event,
        MissingLocation,
        MissingRoute,
    )

    for table in SQLModel.metadata.tables.values():
        table.schema = DB_SCHEMA

    SQLModel.metadata.create_all(engine)

    print(
        f"Created {len(SQLModel.metadata.tables)} tables in schema '{DB_SCHEMA}': {list(SQLModel.metadata.tables.keys())}"
    )


def get_session():
    with Session(engine) as session:
        yield session
