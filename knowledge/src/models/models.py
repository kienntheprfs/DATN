from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import List, Optional, Any

from sqlalchemy import (
    DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Index, Boolean
)
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)
from sqlalchemy.sql import func
from sqlalchemy import Enum as SAEnum


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
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class DocumentStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"  # Soft delete is better than hard delete

# --- Base & Mixins ---

class Base(DeclarativeBase):
    type_annotation_map = {
        dict: JSONB,  # Map Python dict to Postgres JSONB automatically
        list[str]: ARRAY(String)
    }

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

# --- Users & RBAC ---

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)

    # 2.0 Style Relationship Typing
    roles: Mapped[List["Role"]] = relationship(
        secondary="user_roles", back_populates="users"
    )

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(255))

    users: Mapped[List["User"]] = relationship(
        secondary="user_roles", back_populates="roles"
    )
    
    # Link permissions explicitly
    permissions: Mapped[List["RoleDocumentPermission"]] = relationship(back_populates="role")

class UserRole(Base):
    __tablename__ = "user_roles"
    
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)

# --- Tags ---

class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)

    # Relationship back to documents
    documents: Mapped[List["Document"]] = relationship(
        secondary="document_tags", back_populates="tags"
    )

class DocumentTag(Base):
    __tablename__ = "document_tags"

    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

# --- Documents Core ---

class DocumentStorage(Base, TimestampMixin):
    """Logical grouping like a Folder or a Dataset (Knowledge Base)"""
    __tablename__ = "document_storages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    # Owner/Config metadata
    config: Mapped[Optional[dict]] = mapped_column(JSONB) # e.g., default chunk_size for this storage

    documents: Mapped[List["Document"]] = relationship(back_populates="storage", cascade="all, delete-orphan")

class Document(Base, TimestampMixin):
    """The logical document container (invariant across versions)"""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    storage_id: Mapped[int] = mapped_column(ForeignKey("document_storages.id"))
    
    title: Mapped[str] = mapped_column(String(500))
    # Native Enum in Postgres is safer
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus, native_enum=False, length=50), 
        default=DocumentStatus.ACTIVE,
        index=True
    )

    storage: Mapped["DocumentStorage"] = relationship(back_populates="documents")
    tags: Mapped[List["Tag"]] = relationship(secondary="document_tags", back_populates="documents")
    
    # History of processing
    versions: Mapped[List["DocumentVersion"]] = relationship(
        back_populates="document", order_by="desc(DocumentVersion.version)", cascade="all, delete-orphan"
    )
    
    # Permissions
    role_permissions: Mapped[List["RoleDocumentPermission"]] = relationship(back_populates="document", cascade="all, delete-orphan")

class DocumentVersion(Base, TimestampMixin):
    """Snapshot of a document file and its processing state"""
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))

    version: Mapped[int] = mapped_column(default=1)
    
    # File info
    document_type: Mapped[DocumentType] = mapped_column(SAEnum(DocumentType, native_enum=False, length=20))
    file_path: Mapped[str] = mapped_column(String(1024)) # S3 key or local path
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    checksum: Mapped[str] = mapped_column(String(64), index=True) # SHA256 for duplicate detection

    # Processing State
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        SAEnum(ProcessingStatus, native_enum=False, length=20),
        default=ProcessingStatus.PENDING,
        index=True
    )
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    processing_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Extended Metadata (Critical for RAG filtering)
    # e.g. {"author": "Dat", "year": 2024, "citation_style": "APA"}
    meta_data: Mapped[Optional[dict]] = mapped_column(JSONB, default={})

    is_active: Mapped[bool] = mapped_column(default=True) # Only one version should be active typically

    document: Mapped["Document"] = relationship(back_populates="versions")
    chunks: Mapped[List["Chunk"]] = relationship(back_populates="document_version", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("document_id", "version", name="uq_document_version"),
        Index("idx_doc_ver_status", "processing_status"),
    )

# --- RAG Chunks ---

class Chunk(Base, TimestampMixin):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Denormalization: Store document_id allows faster query without double join
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    document_version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"), index=True)

    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text) # Main text content
    
    # Vector DB Mapping
    embedding_id: Mapped[str] = mapped_column(String(100), index=True) # UUID in Qdrant
    
    # Chunk Metadata (Golden for Citations)
    # e.g. {"page_number": 5, "start_char": 100, "end_char": 500, "section": "Introduction"}
    chunk_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, default={})

    document_version: Mapped["DocumentVersion"] = relationship(back_populates="chunks")

    __table_args__ = (
        # Unique constraint to prevent duplicate chunks for same version
        UniqueConstraint("document_version_id", "chunk_index", name="uq_version_chunk_index"),
    )

# --- FAQ & Permissions ---

class FAQ(Base, TimestampMixin):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    
    answer: Mapped[str] = mapped_column(Text)
    
    # Metadata for FAQ (e.g., "category": "Pricing")
    meta_data: Mapped[Optional[dict]] = mapped_column(JSONB)

    questions: Mapped[List["FAQQuestionVariant"]] = relationship(back_populates="faq", cascade="all, delete-orphan")

class FAQQuestionVariant(Base):
    __tablename__ = "faq_question_variants"

    id: Mapped[int] = mapped_column(primary_key=True)
    faq_id: Mapped[int] = mapped_column(ForeignKey("faqs.id", ondelete="CASCADE"))
    
    question: Mapped[str] = mapped_column(Text)
    embedding_id: Mapped[str] = mapped_column(String(100), index=True) # Qdrant ID

    faq: Mapped["FAQ"] = relationship(back_populates="questions")

class RoleDocumentPermission(Base, TimestampMixin):
    __tablename__ = "role_document_permissions"

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)

    can_read: Mapped[bool] = mapped_column(default=True)
    can_edit: Mapped[bool] = mapped_column(default=False)
    
    role: Mapped["Role"] = relationship(back_populates="permissions")
    document: Mapped["Document"] = relationship(back_populates="role_permissions")