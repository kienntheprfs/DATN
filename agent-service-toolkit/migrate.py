#!/usr/bin/env python3
"""
CLI script for managing knowledge management database migrations.
"""
import asyncio
import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from alembic.config import Config
from alembic import command
from knowledge_management.database import get_database_url, create_tables, check_database_connection
from core.settings import settings


def get_alembic_config():
    """Get Alembic configuration."""
    config_path = Path(__file__).parent / "src" / "knowledge_management" / "alembic.ini"
    config = Config(str(config_path))
    
    # Set database URL from settings
    config.set_main_option("sqlalchemy.url", get_database_url())
    
    return config


async def init_db():
    """Initialize database tables without migrations."""
    print("Initializing database tables...")
    
    if not await check_database_connection():
        print("❌ Cannot connect to database")
        return False
    
    try:
        await create_tables()
        print("✅ Database tables created successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to create tables: {e}")
        return False


def revision(message: str = None, autogenerate: bool = False):
    """Create a new migration."""
    print(f"Creating migration{' (autogenerate)' if autogenerate else ''}...")
    
    config = get_alembic_config()
    
    try:
        command.revision(
            config,
            message=message or "Auto-generated migration",
            autogenerate=autogenerate
        )
        print("✅ Migration created successfully")
    except Exception as e:
        print(f"❌ Failed to create migration: {e}")


def upgrade(revision: str = "head"):
    """Run database upgrades."""
    print(f"Upgrading database to {revision}...")
    
    config = get_alembic_config()
    
    try:
        command.upgrade(config, revision)
        print("✅ Database upgraded successfully")
    except Exception as e:
        print(f"❌ Failed to upgrade database: {e}")


def downgrade(revision: str = "-1"):
    """Run database downgrades."""
    print(f"Downgrading database to {revision}...")
    
    config = get_alembic_config()
    
    try:
        command.downgrade(config, revision)
        print("✅ Database downgraded successfully")
    except Exception as e:
        print(f"❌ Failed to downgrade database: {e}")


def history():
    """Show migration history."""
    print("Migration history:")
    
    config = get_alembic_config()
    
    try:
        command.history(config)
    except Exception as e:
        print(f"❌ Failed to show history: {e}")


def current():
    """Show current revision."""
    print("Current database revision:")
    
    config = get_alembic_config()
    
    try:
        command.current(config)
    except Exception as e:
        print(f"❌ Failed to get current revision: {e}")


def show_help():
    """Show help information."""
    help_text = """
Knowledge Management Database Migration Tool

Usage:
    python migrate.py <command> [options]

Commands:
    init                    Initialize database tables (no migrations)
    revision [message]      Create a new migration
    revision --autogenerate Create migration with auto-detection
    upgrade [revision]      Upgrade database (default: head)
    downgrade [revision]    Downgrade database (default: -1)
    history                 Show migration history
    current                 Show current revision
    help                    Show this help

Examples:
    python migrate.py init
    python migrate.py revision "Add users table"
    python migrate.py revision --autogenerate
    python migrate.py upgrade
    python migrate.py downgrade
    python migrate.py history

Note: Make sure PostgreSQL is running and environment variables are set.
"""
    print(help_text)


def main():
    """Main CLI entry point."""
    if len(sys.argv) < 2:
        show_help()
        return
    
    command_arg = sys.argv[1]
    
    # Check if database type is PostgreSQL
    if settings.DATABASE_TYPE != "postgres":
        print("❌ Knowledge management service requires PostgreSQL")
        print("Please set DATABASE_TYPE=postgres in your environment")
        sys.exit(1)
    
    try:
        if command_arg == "init":
            asyncio.run(init_db())
        elif command_arg == "revision":
            message = None
            autogenerate = False
            
            if "--autogenerate" in sys.argv:
                autogenerate = True
            elif len(sys.argv) > 2:
                message = sys.argv[2]
            
            revision(message=message, autogenerate=autogenerate)
        elif command_arg == "upgrade":
            revision = "head"
            if len(sys.argv) > 2:
                revision = sys.argv[2]
            upgrade(revision)
        elif command_arg == "downgrade":
            revision = "-1"
            if len(sys.argv) > 2:
                revision = sys.argv[2]
            downgrade(revision)
        elif command_arg == "history":
            history()
        elif command_arg == "current":
            current()
        elif command_arg == "help":
            show_help()
        else:
            print(f"❌ Unknown command: {command_arg}")
            show_help()
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n❌ Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()