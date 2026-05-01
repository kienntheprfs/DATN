"""Add real_image_url and description to building and node

Revision ID: cb83fe539567
Revises: 001
Create Date: 2026-04-30 21:52:37.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb83fe539567'
down_revision: Union[str, Sequence[str], None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add real_image_url to wayfinder_building
    op.add_column('wayfinder_building', sa.Column('real_image_url', sa.String(), nullable=True), schema='wayfinder')
    
    # Add description and real_image_url to wayfinder_node
    op.add_column('wayfinder_node', sa.Column('description', sa.String(), nullable=True), schema='wayfinder')
    op.add_column('wayfinder_node', sa.Column('real_image_url', sa.String(), nullable=True), schema='wayfinder')


def downgrade() -> None:
    op.drop_column('wayfinder_node', 'real_image_url', schema='wayfinder')
    op.drop_column('wayfinder_node', 'description', schema='wayfinder')
    op.drop_column('wayfinder_building', 'real_image_url', schema='wayfinder')
