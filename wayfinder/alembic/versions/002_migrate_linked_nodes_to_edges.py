"""migrate linked_node_ids to edges

Revision ID: 002
Revises: cb83fe539567
Create Date: 2026-05-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "cb83fe539567"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    result = conn.execute(
        text("""
        SELECT id, type, linked_node_ids 
        FROM wayfinder.wayfinder_node 
        WHERE linked_node_ids IS NOT NULL
    """)
    )

    created_pairs = set()

    existing = conn.execute(
        text("""
        SELECT start_node_id, end_node_id FROM wayfinder.wayfinder_edge
    """)
    )
    for s, e in existing.fetchall():
        created_pairs.add((s, e))
        created_pairs.add((e, s))

    for row in result.fetchall():
        node_id = row[0]
        node_type = row[1]
        linked_data = row[2]

        if not isinstance(linked_data, list):
            continue

        for linked_id in linked_data:
            if not isinstance(linked_id, int):
                continue
            if linked_id == node_id:
                continue

            pair = (node_id, linked_id)
            if pair in created_pairs:
                continue

            conn_type = "stairs"
            if node_type in ["stairs", "elevator"]:
                conn_type = node_type

            check_exists = conn.execute(
                text("""
                SELECT 1 FROM wayfinder.wayfinder_node WHERE id = :id
            """),
                {"id": linked_id},
            ).fetchone()
            if not check_exists:
                continue

            conn.execute(
                text("""
                INSERT INTO wayfinder.wayfinder_edge (
                    start_node_id, end_node_id, type, weight, bidirectional, polyline
                ) VALUES (:s, :e, :typ, 50.0, true, '[]'::jsonb)
            """),
                {"s": node_id, "e": linked_id, "typ": conn_type},
            )

            created_pairs.add(pair)
            created_pairs.add((linked_id, node_id))


def downgrade() -> None:
    pass
