from pathlib import Path
import os
from sqlmodel import create_engine, SQLModel, text
from dotenv import load_dotenv

BASE_PKG = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BASE_PKG / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

DB_USER = os.getenv("WAYFINDER_DB_USER", "postgres")
DB_PASSWORD = os.getenv("WAYFINDER_DB_PASSWORD", "postgres")
DB_HOST = os.getenv("WAYFINDER_DB_HOST", "localhost")
DB_PORT = os.getenv("WAYFINDER_DB_PORT", "5432")
DB_NAME = os.getenv("WAYFINDER_DB_NAME", "wayfinder")
DB_SCHEMA = os.getenv("WAYFINDER_DB_SCHEMA", "wayfinder")

ENV_URL = os.getenv("WAYFINDER_DB_URL") or os.getenv("DATABASE_URL")

if ENV_URL:
    DB_URL = ENV_URL
    engine = create_engine(DB_URL, echo=False)
else:
    DB_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    engine = create_engine(DB_URL, echo=False)

    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {DB_SCHEMA}"))
        conn.commit()


def init_db():
    SQLModel.metadata.create_all(engine)
