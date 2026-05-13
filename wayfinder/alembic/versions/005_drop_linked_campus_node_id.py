"""drop linked_campus_node_id column

Revision ID: 005
Revises: 004
Create Date: 2026-05-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, Sequence[str], None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("wayfinder_node", "linked_campus_node_id", schema="wayfinder")


def downgrade() -> None:
    op.add_column(
        "wayfinder_node",
        sa.Column(
            "linked_campus_node_id", sa.INTEGER(), autoincrement=False, nullable=True
        ),
        schema="wayfinder",
    )
