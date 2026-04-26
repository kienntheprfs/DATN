from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
import sqlalchemy as sa
from alembic import context
import sys
import os

from src.core.config import settings

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from src.models.models import Base
import src.models.models
from src.core.config import settings

# this is the Alembic Config object
config = context.config

# 1. Ghi đè sqlalchemy.url bằng biến môi trường (dành cho Azure DB)
# Bạn nhớ set biến môi trường DATABASE_URL trước khi chạy lệnh migration nhé.
database_url = settings.DATABASE_URL

if database_url:
    # Nếu URL chứa asyncpg, đổi nó thành psycopg2 để Alembic chạy được
    if "asyncpg" in database_url:
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# 2. Khai báo tên schema mới
TARGET_SCHEMA = "knowledge_schema"

def include_object(object, name, type_, reflected, compare_to):
    # Đảm bảo Alembic không đụng vào các schema khác (như public)
    # if name == "alembic_version" and getattr(object, "schema", None) == TARGET_SCHEMA:
    #     return True
    
    if type_ == "table" and getattr(object, "schema", None) != TARGET_SCHEMA:
        return False

    # Bỏ qua các bảng không thuộc service này
    if type_ == "table" and (
        name.startswith("lightrag")
        or name.startswith("checkpoint")
        or name.startswith("store")
    ):
        return False
    return True

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        # 3. Cấu hình schema cho offline mode
        include_schemas=True,
        version_table_schema=TARGET_SCHEMA, 
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Tùy chọn: Set schema mặc định cho session kết nối của PostgreSQL
        # connection.dialect.default_schema_name = TARGET_SCHEMA
        connection.execute(
            sa.text(f"SET search_path TO {TARGET_SCHEMA}")
        )

        connection.commit()
        
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            include_object=include_object,
            # 4. Cấu hình schema cho online mode
            include_schemas=True,
            version_table_schema=TARGET_SCHEMA,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()