"""Move existing auth tables to api_gateway schema

Revision ID: 005
Revises: 004
Create Date: 2026-03-30

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


TABLES_TO_MOVE = (
    "roles",
    "users",
    "user_roles",
    "resource_ownerships",
    "threads",
    "refresh_tokens",
)


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS api_gateway")

    for table_name in TABLES_TO_MOVE:
        op.execute(f"ALTER TABLE IF EXISTS public.{table_name} SET SCHEMA api_gateway")


def downgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS public")

    for table_name in TABLES_TO_MOVE:
        op.execute(f"ALTER TABLE IF EXISTS api_gateway.{table_name} SET SCHEMA public")
