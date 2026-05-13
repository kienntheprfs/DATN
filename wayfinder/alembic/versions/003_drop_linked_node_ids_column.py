"""drop linked_node_ids column

Revision ID: 003
Revises: 002
Create Date: 2026-05-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "003"
down_revision: Union[str, Sequence[str], None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("wayfinder_node", "linked_node_ids", schema="wayfinder")


def downgrade() -> None:
    op.add_column(
        "wayfinder_node",
        sa.Column("linked_node_ids", postgresql.JSONB(), nullable=True),
        schema="wayfinder",
    )
