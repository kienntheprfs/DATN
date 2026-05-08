"""add topic pipeline tables (final consolidated schema)

Revision ID: 20260422_0001
Revises: 20260418_0002
Create Date: 2026-04-22 00:00:00.000000

Tables:
- dashboard_topic_pipeline_jobs: pipeline run metadata
- dashboard_topic_results: per-topic-type result (summary, keywords, sentiment, pins)
- dashboard_topic_assignments: question-to-topic mapping
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260422_0001"
down_revision: Union[str, Sequence[str], None] = "20260418_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create topic pipeline job, result, and assignment tables."""
    op.execute("CREATE SCHEMA IF NOT EXISTS dashboard")

    # ---- Jobs ----------------------------------------------------------------
    op.create_table(
        "dashboard_topic_pipeline_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("time_range", sa.String(length=10), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="'pending'"
        ),
        sa.Column(
            "stage", sa.String(length=30), nullable=False, server_default="'pending'"
        ),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.String(length=500), nullable=True),
        sa.Column("error_detail", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')",
            name="ck_dashboard_topic_pipeline_jobs_status",
        ),
        sa.CheckConstraint(
            "stage IN ('pending', 'loading_input', 'modeling', 'exporting_file', 'exporting_db', 'completed')",
            name="ck_dashboard_topic_pipeline_jobs_stage",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_topic_pipeline_jobs"),
        schema="dashboard",
    )

    op.create_index(
        "idx_dashboard_topic_pipeline_jobs_created_at",
        "dashboard_topic_pipeline_jobs",
        ["created_at"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_topic_pipeline_jobs_status",
        "dashboard_topic_pipeline_jobs",
        ["status"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "uq_dashboard_topic_pipeline_jobs_one_active",
        "dashboard_topic_pipeline_jobs",
        ["status"],
        unique=True,
        schema="dashboard",
        postgresql_where=sa.text("status IN ('pending', 'running')"),
    )

    # ---- Results -------------------------------------------------------------
    op.create_table(
        "dashboard_topic_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("topic_type", sa.String(length=50), nullable=False),
        sa.Column("time_range", sa.String(length=10), nullable=False),
        sa.Column("n_topics", sa.Integer(), nullable=False),
        sa.Column("n_documents", sa.Integer(), nullable=False),
        sa.Column("topic_summary", sa.JSON(), nullable=False),
        sa.Column(
            "topic_keywords",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "topic_sentiment",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "topic_marked",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["dashboard.dashboard_topic_pipeline_jobs.id"],
            name="fk_dashboard_topic_result_job",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_topic_results"),
        schema="dashboard",
    )

    op.create_index(
        "idx_dashboard_topic_results_topic_type_created",
        "dashboard_topic_results",
        ["topic_type", "created_at"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_topic_results_job_id",
        "dashboard_topic_results",
        ["job_id"],
        unique=False,
        schema="dashboard",
    )

    # ---- Assignments ---------------------------------------------------------
    op.create_table(
        "dashboard_topic_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("result_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.String(length=5000), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("original_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["result_id"],
            ["dashboard.dashboard_topic_results.id"],
            name="fk_dashboard_topic_assignment_result",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_topic_assignments"),
        schema="dashboard",
    )

    op.create_index(
        "idx_dashboard_topic_assignments_result_id",
        "dashboard_topic_assignments",
        ["result_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_topic_assignments_topic_id",
        "dashboard_topic_assignments",
        ["topic_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_topic_assignments_result_topic",
        "dashboard_topic_assignments",
        ["result_id", "topic_id"],
        unique=False,
        schema="dashboard",
    )
    op.create_index(
        "idx_dashboard_topic_assignments_original_created_at",
        "dashboard_topic_assignments",
        ["original_created_at"],
        unique=False,
        schema="dashboard",
    )


def downgrade() -> None:
    """Drop topic pipeline tables and indexes."""
    op.drop_index(
        "idx_dashboard_topic_assignments_original_created_at",
        table_name="dashboard_topic_assignments",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_assignments_result_topic",
        table_name="dashboard_topic_assignments",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_assignments_topic_id",
        table_name="dashboard_topic_assignments",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_assignments_result_id",
        table_name="dashboard_topic_assignments",
        schema="dashboard",
    )
    op.drop_table("dashboard_topic_assignments", schema="dashboard")

    op.drop_index(
        "idx_dashboard_topic_results_job_id",
        table_name="dashboard_topic_results",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_results_topic_type_created",
        table_name="dashboard_topic_results",
        schema="dashboard",
    )
    op.drop_table("dashboard_topic_results", schema="dashboard")

    op.drop_index(
        "uq_dashboard_topic_pipeline_jobs_one_active",
        table_name="dashboard_topic_pipeline_jobs",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_pipeline_jobs_status",
        table_name="dashboard_topic_pipeline_jobs",
        schema="dashboard",
    )
    op.drop_index(
        "idx_dashboard_topic_pipeline_jobs_created_at",
        table_name="dashboard_topic_pipeline_jobs",
        schema="dashboard",
    )
    op.drop_table("dashboard_topic_pipeline_jobs", schema="dashboard")
