from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class FAQQuestionVariantResponse(BaseModel):
    id: int
    question: str
    embedding_id: str

    model_config = ConfigDict(from_attributes=True)


class FAQResponse(BaseModel):
    id: int
    source: str
    document_id: Optional[int] = None
    answer: str
    meta_data: Optional[dict] = None
    questions: List[FAQQuestionVariantResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManualFAQCreate(BaseModel):
    """Curated FAQ: one answer, multiple question phrasings for retrieval."""

    answer: str = Field(..., min_length=1)
    questions: List[str] = Field(
        ...,
        min_length=1,
        description="At least one surface form; additional entries are variants for embedding.",
    )
    meta_data: Optional[dict] = None


class ManualFAQUpdate(BaseModel):
    answer: Optional[str] = Field(None, min_length=1)
    questions: Optional[List[str]] = Field(
        None,
        description="If set, replaces all question variants and re-embeds.",
    )
    meta_data: Optional[dict] = None


class FAQCreate(BaseModel):
    """Unified FAQ creation - supports manual FAQs only (document FAQs are auto-generated)."""

    answer: str = Field(..., min_length=1)
    questions: List[str] = Field(
        ...,
        min_length=1,
        description="At least one surface form; additional entries are variants for embedding.",
    )
    meta_data: Optional[dict] = None


class FAQUpdate(BaseModel):
    """Unified FAQ update - answer and metadata only (document FAQs follow source documents)."""

    answer: Optional[str] = Field(None, min_length=1)
    meta_data: Optional[dict] = None
