import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ---------------------------------------------------------
# 1. IMPORT SETTINGS VÀ MODELS TỪ PROJECT CỦA BẠN
# ---------------------------------------------------------
from core.settings import settings
# BẮT BUỘC: Import tất cả các model bạn có ở đây để Alembic có thể quét được
from schema.conversation import Base, Conversation
from schema.missing_knowledge import MissingKnowledgeLog

# 2. Xây dựng DATABASE_URL động từ settings
DATABASE_URL = (
    f"postgresql+asyncpg://{settings.POSTGRES_USER}:"
    f"{settings.POSTGRES_PASSWORD.get_secret_value()}@"
    f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/"
    f"{settings.POSTGRES_DB}"
)

# ---------------------------------------------------------

config = context.config

# 3. Ghi đè URL trong file alembic.ini bằng URL vừa tạo
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 4. Trỏ target_metadata tới Base của project
target_metadata = Base.metadata

def include_object(object, name, type_, reflected, compare_to):
    """Hàm lọc: Bỏ qua tất cả các bảng không thuộc schema của service này"""
    if type_ == "table" and object.schema != "agent_schema":
        return False
    return True

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, 
        target_metadata=target_metadata,
        include_schemas=True,           # <-- BẬT TÍNH NĂNG ĐỌC SCHEMA
        include_object=include_object,
        version_table_schema="agent_schema",
        )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()