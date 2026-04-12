"""Add Google OAuth fields to users table

Revision ID: 004
Revises: 003
Create Date: 2026-02-13 12:59:44.545611+00:00

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add OAuth columns
    op.add_column(
        'users',
        sa.Column(
            'auth_provider',
            sqlmodel.sql.sqltypes.AutoString(length=20),
            nullable=False,
            server_default='local',
        ),
    )
    op.add_column(
        'users',
        sa.Column('google_id', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('avatar_url', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    )

    # Allow OAuth users without a password
    op.alter_column('users', 'hashed_password',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)

    # Enforce uniqueness for google_id
    op.create_index('ix_users_google_id', 'users', ['google_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_google_id', table_name='users')

    op.alter_column('users', 'hashed_password',
               existing_type=sa.VARCHAR(length=255),
               nullable=False)

    op.drop_column('users', 'display_name')
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'google_id')
    op.drop_column('users', 'auth_provider')
