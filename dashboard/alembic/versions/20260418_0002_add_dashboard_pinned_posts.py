"""add dashboard pinned posts table

Revision ID: 20260418_0002
Revises: 20260330_0001
Create Date: 2026-04-18 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260418_0002"
down_revision: Union[str, Sequence[str], None] = "20260330_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create dashboard pinned posts table."""
    op.execute("CREATE SCHEMA IF NOT EXISTS dashboard")

    op.create_table(
        "dashboard_pinned_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("ref_id", sa.String(length=50), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("pinned_date", sa.Date(), nullable=False),
        sa.Column("summary", sa.String(length=5000), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=False),
        sa.Column("document_type", sa.String(length=150), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(title) >= 1", name="ck_dashboard_pinned_posts_title_not_blank"),
        sa.CheckConstraint("length(summary) >= 1", name="ck_dashboard_pinned_posts_summary_not_blank"),
        sa.CheckConstraint(
            "category in ('Quy chế Đào tạo', 'Sau Đại học', 'Công tác Sinh viên', 'Nghiên cứu Khoa học')",
            name="ck_dashboard_pinned_posts_category",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_pinned_posts"),
        sa.UniqueConstraint("display_order", name="uq_dashboard_pinned_posts_display_order"),
        sa.UniqueConstraint("ref_id", name="uq_dashboard_pinned_posts_ref_id"),
        schema="dashboard",
    )

    op.create_index(
        "idx_dashboard_pinned_posts_category",
        "dashboard_pinned_posts",
        ["category"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_pinned_posts_pinned_date",
        "dashboard_pinned_posts",
        ["pinned_date"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_pinned_posts_updated_at",
        "dashboard_pinned_posts",
        ["updated_at"],
        unique=False,
        schema="dashboard",
    )


def downgrade() -> None:
    """Drop dashboard pinned posts table and indexes."""
    op.drop_index("idx_dashboard_pinned_posts_updated_at", table_name="dashboard_pinned_posts", schema="dashboard")
    op.drop_index("idx_dashboard_pinned_posts_pinned_date", table_name="dashboard_pinned_posts", schema="dashboard")
    op.drop_index("idx_dashboard_pinned_posts_category", table_name="dashboard_pinned_posts", schema="dashboard")
    op.drop_table("dashboard_pinned_posts", schema="dashboard")
