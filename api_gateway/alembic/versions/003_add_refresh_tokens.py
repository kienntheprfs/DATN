"""Add refresh_tokens table for token storage and revocation

Revision ID: 003
Revises: 002
Create Date: 2026-02-12

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create refresh_tokens table."""
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('token', sa.String(length=500), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['user_id'], 
            ['users.id'], 
            name='fk_refresh_tokens_user_id_users',
            ondelete='CASCADE'
        ),
    )
    
    # Create indexes for better query performance
    op.create_index(
        'ix_refresh_tokens_token', 
        'refresh_tokens', 
        ['token'], 
        unique=True
    )
    op.create_index(
        'ix_refresh_tokens_user_id', 
        'refresh_tokens', 
        ['user_id']
    )
    op.create_index(
        'ix_refresh_tokens_is_revoked', 
        'refresh_tokens', 
        ['is_revoked']
    )
    op.create_index(
        'ix_refresh_tokens_expires_at', 
        'refresh_tokens', 
        ['expires_at']
    )


def downgrade() -> None:
    """Drop refresh_tokens table and indexes."""
    op.drop_index('ix_refresh_tokens_expires_at', table_name='refresh_tokens')
    op.drop_index('ix_refresh_tokens_is_revoked', table_name='refresh_tokens')
    op.drop_index('ix_refresh_tokens_user_id', table_name='refresh_tokens')
    op.drop_index('ix_refresh_tokens_token', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
