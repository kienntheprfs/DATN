"""knowledge_schema + single-table documents (no document_versions)

Revision ID: c4f8a1b2d3e4
Revises: 35da384788ec
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from src.models.models import Base

# revision identifiers, used by Alembic.
revision: str = "c4f8a1b2d3e4"
down_revision: Union[str, Sequence[str], None] = "35da384788ec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KNOWLEDGE_SCHEMA = "knowledge_schema"

# Legacy public tables from older revisions (safe to drop if present).
_LEGACY_PUBLIC_TABLES = (
    "faq_question_variants",
    "faqs",
    "chunks",
    "document_versions",
    "document_tags",
    "role_document_permissions",
    "documents",
    "formal_documents",
    "document_storages",
    "tags",
    "user_roles",
    "users",
    "roles",
)


def upgrade() -> None:
    op.execute(
        sa.text(f'CREATE SCHEMA IF NOT EXISTS "{KNOWLEDGE_SCHEMA}"')
    )


def downgrade() -> None:
    op.execute(
        sa.text(f'DROP SCHEMA IF EXISTS "{KNOWLEDGE_SCHEMA}" CASCADE')
    )
