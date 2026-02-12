"""Create threads table

Revision ID: 002
Revises: 001
Create Date: 2026-02-12 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create threads table for conversation tracking."""
    op.create_table(
        'threads',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('agent_id', sa.String(100), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow),
    )
    
    # Create index on user_id for efficient ownership queries
    op.create_index('ix_threads_user_id', 'threads', ['user_id'])
    
    # Create composite index for user + created_at (for pagination)
    op.create_index('ix_threads_user_id_created_at', 'threads', ['user_id', 'created_at'])


def downgrade() -> None:
    """Drop threads table."""
    op.drop_index('ix_threads_user_id_created_at', 'threads')
    op.drop_index('ix_threads_user_id', 'threads')
    op.drop_table('threads')
