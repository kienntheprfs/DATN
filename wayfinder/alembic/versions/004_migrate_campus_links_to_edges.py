"""migrate linked_campus_node_id to edges (type='entrance')

Revision ID: 004
Revises: 003
Create Date: 2026-05-11

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision: str = "004"
down_revision: Union[str, Sequence[str], None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    result = conn.execute(
        text("""
        SELECT id, linked_campus_node_id 
        FROM wayfinder.wayfinder_node 
        WHERE linked_campus_node_id IS NOT NULL
    """)
    )

    created_pairs = set()

    existing = conn.execute(
        text("""
        SELECT start_node_id, end_node_id 
        FROM wayfinder.wayfinder_edge
        WHERE type = 'entrance'
    """)
    )
    for s, e in existing.fetchall():
        created_pairs.add((s, e))
        created_pairs.add((e, s))

    for row in result.fetchall():
        node_id = row[0]
        campus_id = row[1]

        if campus_id is None:
            continue
        if campus_id == node_id:
            continue

        pair = (node_id, campus_id)
        if pair in created_pairs:
            continue

        check_exists = conn.execute(
            text("""
            SELECT 1 FROM wayfinder.wayfinder_node WHERE id = :id
        """),
            {"id": campus_id},
        ).fetchone()
        if not check_exists:
            continue

        conn.execute(
            text("""
            INSERT INTO wayfinder.wayfinder_edge (
                start_node_id, end_node_id, type, weight, bidirectional, polyline
            ) VALUES (:s, :e, 'entrance', 10.0, true, '[]'::jsonb)
        """),
            {"s": node_id, "e": campus_id},
        )

        created_pairs.add(pair)
        created_pairs.add((campus_id, node_id))


def downgrade() -> None:
    pass
