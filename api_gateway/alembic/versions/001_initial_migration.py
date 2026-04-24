"""Initial migration: create users, roles, and resource_ownerships tables

Revision ID: 001
Revises: 
Create Date: 2025-01-27 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(50), nullable=False, unique=True),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
    )
    op.create_index('ix_roles_name', 'roles', ['name'])
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=False, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow),
    )
    op.create_index('ix_users_email', 'users', ['email'])
    
    # Create user_roles junction table
    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role_id', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    )
    
    # Create resource_ownerships table
    op.create_table(
        'resource_ownerships',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('resource_type', sa.String(50), nullable=False),
        sa.Column('resource_id', sa.String(255), nullable=False),
        sa.Column('owner_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
    )
    op.create_index('ix_resource_ownerships_resource_type', 'resource_ownerships', ['resource_type'])
    op.create_index('ix_resource_ownerships_resource_id', 'resource_ownerships', ['resource_id'])
    
    # Insert default roles
    from uuid import uuid4
    op.execute(f"""
        INSERT INTO roles (id, name, description, created_at)
        VALUES 
            ('{uuid4()}', 'admin', 'Administrator with full access', '{datetime.utcnow()}'),
            ('{uuid4()}', 'user', 'Regular user with standard access', '{datetime.utcnow()}'),
            ('{uuid4()}', 'viewer', 'Read-only access', '{datetime.utcnow()}'),
            ('{uuid4()}', 'editor', 'Can create and edit content', '{datetime.utcnow()}')
    """)


def downgrade() -> None:
    op.drop_table('resource_ownerships')
    op.drop_table('user_roles')
    op.drop_table('users')
    op.drop_table('roles')
