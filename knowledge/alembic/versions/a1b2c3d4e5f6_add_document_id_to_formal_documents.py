"""Add document_id FK to formal_documents for dual-index strategy

Revision ID: a1b2c3d4e5f6
Revises: e9b0cf6059ac
Create Date: 2026-05-09 16:35:00.000000

This migration adds a nullable FK column ``document_id`` to the
``formal_documents`` table, linking each formal document to the
``documents`` row that drives its Qdrant ingestion pipeline.

Existing rows are left with NULL (legacy / LightRAG-only records).
Only documents uploaded after this migration will have a non-NULL value.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "e9b0cf6059ac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "knowledge_schema"


def upgrade() -> None:
    """Add document_id FK column to formal_documents."""
    op.add_column(
        "formal_documents",
        sa.Column(
            "document_id",
            sa.Integer(),
            nullable=True,
            comment=(
                "FK to documents.id — the Document row used for Qdrant indexing "
                "(dual-index strategy). NULL for legacy LightRAG-only records."
            ),
        ),
        schema=SCHEMA,
    )

    op.create_foreign_key(
        "fk_formal_documents_document_id",
        source_table="formal_documents",
        referent_table="documents",
        local_cols=["document_id"],
        remote_cols=["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_knowledge_schema_formal_documents_document_id",
        "formal_documents",
        ["document_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    """Remove document_id FK column from formal_documents."""
    op.drop_index(
        "ix_knowledge_schema_formal_documents_document_id",
        table_name="formal_documents",
        schema=SCHEMA,
    )

    op.drop_constraint(
        "fk_formal_documents_document_id",
        table_name="formal_documents",
        schema=SCHEMA,
        type_="foreignkey",
    )

    op.drop_column("formal_documents", "document_id", schema=SCHEMA)
