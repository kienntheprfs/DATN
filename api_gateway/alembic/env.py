"""Alembic environment configuration."""
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, text
from alembic import context
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.models import Base
from src.config import settings

# this is the Alembic Config object
config = context.config


# Override sqlalchemy.url from settings
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models for autogenerate support
target_metadata = Base.metadata
VERSION_TABLE_SCHEMA = "api_gateway"


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        include_schemas=True,
        version_table_schema=VERSION_TABLE_SCHEMA,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Commit schema/version-table housekeeping before Alembic starts its own transaction.
        with connection.begin():
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {VERSION_TABLE_SCHEMA}"))

            public_version_table = connection.execute(
                text("SELECT to_regclass('public.alembic_version')")
            ).scalar_one_or_none()
            schema_version_table = connection.execute(
                text(f"SELECT to_regclass('{VERSION_TABLE_SCHEMA}.alembic_version')")
            ).scalar_one_or_none()

            if public_version_table and not schema_version_table:
                connection.execute(
                    text(f"ALTER TABLE public.alembic_version SET SCHEMA {VERSION_TABLE_SCHEMA}")
                )

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            version_table_schema=VERSION_TABLE_SCHEMA,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
