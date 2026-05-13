from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
    Boolean,
    MetaData,
    CheckConstraint,
    Table,
    Column,
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)
from sqlalchemy.sql import func
from sqlalchemy import Enum as SAEnum

from src.core.config import settings


# --- Enums ---
class DocumentType(StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    MD = "markdown"
    HTML = "html"
    JSON = "json"


class ProcessingStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "processed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DocumentStatus(StrEnum):
    """
    Document lifecycle status.

    Flow:
        ACTIVE → DELETE_PENDING → DELETED
                            ↘ DELETE_FAILED (retry-able)
    """

    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETE_PENDING = "delete_pending"  # Deletion in progress (Celery task running)
    DELETE_FAILED = "delete_failed"  # Deletion failed, can retry
    DELETED = "deleted"  # Permanently deleted


class FAQSource(StrEnum):
    """document = generated from ingestion; manual = curated in CMS / API."""

    DOCUMENT = "document"
    MANUAL = "manual"


# --- Base & Mixins ---


class Base(DeclarativeBase):
    metadata = MetaData(schema=settings.KNOWLEDGE_SCHEMA)
    type_annotation_map = {
        dict: JSONB,
        list[str]: ARRAY(String),
    }


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

# --- Tags ---

# Association Table cho Document và Tag
document_tags = Table(
    "document_tags",
    Base.metadata,
    Column(
        "document_id",
        Integer,
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    ),
)


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    documents: Mapped[List["Document"]] = relationship(
        secondary=document_tags, back_populates="tags"
    )


# --- Documents ---


class DocumentStorage(Base, TimestampMixin):
    __tablename__ = "document_storages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    config: Mapped[Optional[dict]] = mapped_column(JSONB)

    documents: Mapped[List["Document"]] = relationship(
        back_populates="storage", cascade="all, delete-orphan"
    )


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    storage_id: Mapped[int] = mapped_column(ForeignKey("document_storages.id"))

    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus, native_enum=False, length=50),
        default=DocumentStatus.ACTIVE,
        index=True,
    )

    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType, native_enum=False, length=20)
    )
    file_path: Mapped[str] = mapped_column(String(1024))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    checksum: Mapped[str] = mapped_column(String(64), index=True)

    processing_status: Mapped[ProcessingStatus] = mapped_column(
        SAEnum(ProcessingStatus, native_enum=False, length=20),
        default=ProcessingStatus.PENDING,
        index=True,
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    processing_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    # Deletion tracking fields
    deletion_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deletion_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deletion_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    meta_data: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    storage: Mapped["DocumentStorage"] = relationship(back_populates="documents")
    tags: Mapped[List["Tag"]] = relationship(
        secondary=document_tags, back_populates="documents"
    )
    chunks: Mapped[List["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    # Quan hệ 1-1 với bảng FormalDocument
    formal_info: Mapped[Optional["FormalDocument"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        uselist=False,
    )


# --- FormalDocument (Extension của Document, dùng riêng cho formal docs) ---


class FormalDocument(Base, TimestampMixin):
    """
    Bảng mở rộng dành riêng cho tài liệu Formal (1-1 với Document).
    Lưu trữ ID tham chiếu LightRAG và trạng thái đồng bộ.
    """
    __tablename__ = "formal_documents"

    # Dùng document_id làm PK để enforce 1-1 ở DB level
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        primary_key=True,
    )

    lightrag_track_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    lightrag_doc_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)

    sync_status: Mapped[ProcessingStatus] = mapped_column(
        SAEnum(ProcessingStatus, native_enum=False, length=20),
        default=ProcessingStatus.PENDING,
        index=True,
    )
    sync_error: Mapped[Optional[str]] = mapped_column(Text)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    document: Mapped["Document"] = relationship(back_populates="formal_info")

# --- RAG Chunks ---


class Chunk(Base, TimestampMixin):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding_id: Mapped[str] = mapped_column(String(100), index=True)
    chunk_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    document: Mapped["Document"] = relationship(back_populates="chunks")

    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_document_chunk_index"),
    )


# --- FAQ & Permissions ---


class FAQ(Base, TimestampMixin):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[FAQSource] = mapped_column(
        SAEnum(
            FAQSource,
            native_enum=False,
            length=20,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        index=True,
    )
    document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    answer: Mapped[str] = mapped_column(Text)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSONB)

    questions: Mapped[List["FAQQuestionVariant"]] = relationship(
        back_populates="faq", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "(source = 'manual' AND document_id IS NULL) OR "
            "(source = 'document' AND document_id IS NOT NULL)",
            name="ck_faq_source_document_id",
        ),
        Index("idx_faq_source_document", "source", "document_id"),
    )


class FAQQuestionVariant(Base):
    __tablename__ = "faq_question_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    faq_id: Mapped[int] = mapped_column(ForeignKey("faqs.id", ondelete="CASCADE"))
    question: Mapped[str] = mapped_column(Text)
    embedding_id: Mapped[str] = mapped_column(String(100), index=True)

    faq: Mapped["FAQ"] = relationship(back_populates="questions")