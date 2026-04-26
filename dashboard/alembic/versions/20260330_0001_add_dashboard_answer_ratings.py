"""add dashboard answer ratings table

Revision ID: 20260330_0001
Revises: 4e9347fb3057
Create Date: 2026-03-30 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260330_0001"
down_revision: Union[str, Sequence[str], None] = "4e9347fb3057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create dashboard answer ratings table."""
    op.execute("CREATE SCHEMA IF NOT EXISTS dashboard")

    op.create_table(
        "dashboard_answer_ratings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.String(length=10), nullable=False),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("agent_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating in ('LIKE', 'DISLIKE')", name="ck_dashboard_answer_ratings_rating"),
        sa.CheckConstraint("length(comment) <= 1000", name="ck_dashboard_answer_ratings_comment_len"),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_answer_ratings"),
        sa.UniqueConstraint("user_id", "run_id", name="uq_dashboard_user_run_rating"),
        schema="dashboard",
    )

    op.create_index(
        "idx_dashboard_answer_ratings_user_id",
        "dashboard_answer_ratings",
        ["user_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_answer_ratings_run_id",
        "dashboard_answer_ratings",
        ["run_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_answer_ratings_thread_id",
        "dashboard_answer_ratings",
        ["thread_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_answer_ratings_agent_id",
        "dashboard_answer_ratings",
        ["agent_id"],
        unique=False,
        schema="dashboard",
    )


def downgrade() -> None:
    """Drop dashboard answer ratings table and indexes."""
    op.drop_index("idx_dashboard_answer_ratings_agent_id", table_name="dashboard_answer_ratings", schema="dashboard")
    op.drop_index("idx_dashboard_answer_ratings_thread_id", table_name="dashboard_answer_ratings", schema="dashboard")
    op.drop_index("idx_dashboard_answer_ratings_run_id", table_name="dashboard_answer_ratings", schema="dashboard")
    op.drop_index("idx_dashboard_answer_ratings_user_id", table_name="dashboard_answer_ratings", schema="dashboard")
    op.drop_table("dashboard_answer_ratings", schema="dashboard")