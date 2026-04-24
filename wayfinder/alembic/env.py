from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import create_engine

from alembic import context

import sys
import os
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

BASE_PKG = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=BASE_PKG / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

DB_USER = os.getenv("WAYFINDER_DB_USER", "postgres")
DB_PASSWORD = os.getenv("WAYFINDER_DB_PASSWORD", "postgres")
DB_HOST = os.getenv("WAYFINDER_DB_HOST", "localhost")
DB_PORT = os.getenv("WAYFINDER_DB_PORT", "5432")
DB_NAME = os.getenv("WAYFINDER_DB_NAME", "knowledge_db")
DB_SCHEMA = os.getenv("WAYFINDER_DB_SCHEMA", "wayfinder")

ENV_URL = os.getenv("WAYFINDER_DB_URL") or os.getenv("DATABASE_URL")

if ENV_URL:
    DB_URL = ENV_URL
else:
    DB_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

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
from sqlmodel import SQLModel

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DB_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DB_URL, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
