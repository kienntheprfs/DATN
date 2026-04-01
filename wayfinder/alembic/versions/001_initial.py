"""initial migration

Revision ID: 001
Revises:
Create Date: 2026-04-01 23:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS wayfinder")

    op.create_table(
        "wayfinder_building",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_map",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("image_url", sa.String(), nullable=False),
        sa.Column("floor_level", sa.Integer(), nullable=True),
        sa.Column("scale_ratio", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column(
            "building_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_building.id"),
            nullable=True,
        ),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_node",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("type", sa.String(), nullable=False, server_default="path"),
        sa.Column(
            "map_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_map.id"),
            nullable=False,
        ),
        sa.Column(
            "building_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_building.id"),
            nullable=True,
        ),
        sa.Column("linked_node_ids", postgresql.JSONB(), nullable=True),
        sa.Column(
            "linked_campus_node_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_node.id"),
            nullable=True,
        ),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_alias",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column(
            "node_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_node.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        schema="wayfinder",
    )
    op.create_index(
        "ix_wayfinder_alias_node_id",
        "wayfinder_alias",
        ["node_id"],
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_edge",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column(
            "start_node_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_node.id"),
            nullable=False,
        ),
        sa.Column(
            "end_node_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_node.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("bidirectional", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("polyline", postgresql.JSONB(), nullable=True),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_event",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("start_date", sa.String(), nullable=False),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column("start_time", sa.String(), nullable=True),
        sa.Column("end_time", sa.String(), nullable=True),
        sa.Column("location_name", sa.String(), nullable=True),
        sa.Column(
            "node_id",
            sa.Integer(),
            sa.ForeignKey("wayfinder.wayfinder_node.id"),
            nullable=True,
        ),
        sa.Column("organizer", sa.String(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.String(), nullable=True),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_missing_location",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("building_name", sa.String(), nullable=True),
        sa.Column("floor_level", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("requested_by", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("resolved_node_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.String(), nullable=True),
        sa.Column("resolved_by", sa.String(), nullable=True),
        sa.Column("admin_note", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=True),
        schema="wayfinder",
    )

    op.create_table(
        "wayfinder_missing_route",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("start_node_id", sa.Integer(), nullable=True),
        sa.Column("start_name", sa.String(), nullable=False),
        sa.Column("start_building", sa.String(), nullable=True),
        sa.Column("start_floor", sa.Integer(), nullable=True),
        sa.Column("end_node_id", sa.Integer(), nullable=True),
        sa.Column("end_name", sa.String(), nullable=False),
        sa.Column("end_building", sa.String(), nullable=True),
        sa.Column("end_floor", sa.Integer(), nullable=True),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("resolved_note", sa.String(), nullable=True),
        sa.Column("resolved_at", sa.String(), nullable=True),
        sa.Column("resolved_by", sa.String(), nullable=True),
        sa.Column("reported_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=True),
        schema="wayfinder",
    )


def downgrade() -> None:
    op.drop_table("wayfinder_missing_route", schema="wayfinder")
    op.drop_table("wayfinder_missing_location", schema="wayfinder")
    op.drop_table("wayfinder_event", schema="wayfinder")
    op.drop_table("wayfinder_edge", schema="wayfinder")
    op.drop_index(
        "ix_wayfinder_alias_node_id", table_name="wayfinder_alias", schema="wayfinder"
    )
    op.drop_table("wayfinder_alias", schema="wayfinder")
    op.drop_table("wayfinder_node", schema="wayfinder")
    op.drop_table("wayfinder_map", schema="wayfinder")
    op.drop_table("wayfinder_building", schema="wayfinder")
    op.execute("DROP SCHEMA IF EXISTS wayfinder")
