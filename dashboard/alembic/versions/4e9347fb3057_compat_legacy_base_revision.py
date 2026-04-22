"""compatibility shim for legacy dashboard alembic revision

Revision ID: 4e9347fb3057
Revises:
Create Date: 2026-04-18 17:20:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "4e9347fb3057"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op migration kept for backward compatibility."""


def downgrade() -> None:
    """No-op downgrade kept for backward compatibility."""
