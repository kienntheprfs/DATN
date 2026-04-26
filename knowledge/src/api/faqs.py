from typing import List

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.sql_db_setup import get_db
from src.schemas.faq import (
    FAQResponse,
    ManualFAQCreate,
    ManualFAQUpdate,
    FAQCreate,
    FAQUpdate,
)
from src.services.faq_service import FAQService

router = APIRouter(prefix="/faqs", tags=["FAQs"])
manual_router = APIRouter(prefix="/faqs/manual", tags=["Manual FAQs"])


# --- Unified FAQ Endpoints (manual + document) ---


@router.get("", response_model=List[FAQResponse])
async def list_faqs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all FAQs (manual + document)."""
    service = FAQService(db)
    return await service.list_all(skip=skip, limit=limit)


@router.post("", response_model=FAQResponse, status_code=status.HTTP_201_CREATED)
async def create_faq(
    payload: FAQCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new manual FAQ."""
    service = FAQService(db)
    return await service.create(payload)


@router.get("/{faq_id}", response_model=FAQResponse)
async def get_faq(
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Get FAQ by ID."""
    service = FAQService(db)
    return await service.get(faq_id)


@router.patch("/{faq_id}", response_model=FAQResponse)
async def update_faq(
    payload: FAQUpdate,
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Update FAQ (answer and/or metadata)."""
    service = FAQService(db)
    return await service.update(faq_id, payload)


@router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_faq(
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete FAQ (removes from PostgreSQL and Qdrant)."""
    service = FAQService(db)
    await service.delete(faq_id)


# --- Manual FAQ Endpoints (backward compatibility) ---


@manual_router.get("", response_model=List[FAQResponse])
async def list_manual_faqs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List manual FAQs (legacy endpoint)."""
    service = FAQService(db)
    return await service.list_manual(skip=skip, limit=limit)


@manual_router.post("", response_model=FAQResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_faq(
    payload: ManualFAQCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create manual FAQ (legacy endpoint)."""
    service = FAQService(db)
    return await service.create_manual(payload)


@manual_router.get("/{faq_id}", response_model=FAQResponse)
async def get_manual_faq(
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Get manual FAQ by ID (legacy endpoint)."""
    service = FAQService(db)
    return await service.get_manual(faq_id)


@manual_router.patch("/{faq_id}", response_model=FAQResponse)
async def update_manual_faq(
    payload: ManualFAQUpdate,
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Update manual FAQ (legacy endpoint)."""
    service = FAQService(db)
    return await service.update_manual(faq_id, payload)


@manual_router.delete("/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_manual_faq(
    faq_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete manual FAQ (legacy endpoint)."""
    service = FAQService(db)
    await service.delete_manual(faq_id)
