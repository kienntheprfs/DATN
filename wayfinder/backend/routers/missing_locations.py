from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime

from backend.core.db import engine, get_session
from backend.models.entities import MissingLocation

router = APIRouter()




class MissingLocationCreate(BaseModel):
    name: str
    building_name: Optional[str] = None
    floor_level: Optional[int] = None
    description: Optional[str] = None
    requested_by: Optional[str] = None


class MissingLocationUpdate(BaseModel):
    name: Optional[str] = None
    building_name: Optional[str] = None
    floor_level: Optional[int] = None
    description: Optional[str] = None
    requested_by: Optional[str] = None
    status: Optional[str] = None
    resolved_node_id: Optional[int] = None
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    admin_note: Optional[str] = None


class MissingLocationOut(BaseModel):
    id: int
    name: str
    building_name: Optional[str]
    floor_level: Optional[int]
    description: Optional[str]
    requested_by: Optional[str]
    status: str
    resolved_node_id: Optional[int]
    resolved_at: Optional[str]
    resolved_by: Optional[str]
    admin_note: Optional[str]
    created_at: Optional[str]

    class Config:
        from_attributes = True


@router.post("", response_model=MissingLocationOut)
def create_missing_location(
    payload: MissingLocationCreate, session: Session = Depends(get_session)
):
    missing = MissingLocation(
        **payload.model_dump(), status="pending", created_at=datetime.now().isoformat()
    )
    session.add(missing)
    session.commit()
    session.refresh(missing)
    return missing


@router.get("", response_model=List[MissingLocationOut])
def list_missing_locations(
    status: Optional[str] = Query(
        None, description="Filter by status: pending, approved, resolved, rejected"
    ),
    building: Optional[str] = Query(None, description="Filter by building name"),
    limit: int = Query(100, le=500),
    session: Session = Depends(get_session),
):
    stmt = select(MissingLocation)

    if status:
        stmt = stmt.where(MissingLocation.status == status)
    if building:
        stmt = stmt.where(MissingLocation.building_name.ilike(f"%{building}%"))

    stmt = stmt.order_by(MissingLocation.created_at.desc()).limit(limit)
    return session.exec(stmt).all()


@router.get("/pending", response_model=List[MissingLocationOut])
def list_pending_missing_locations(session: Session = Depends(get_session)):
    stmt = (
        select(MissingLocation)
        .where(MissingLocation.status == "pending")
        .order_by(MissingLocation.created_at.desc())
    )
    return session.exec(stmt).all()


@router.get("/stats")
def get_missing_location_stats(session: Session = Depends(get_session)):
    stmt = select(MissingLocation)
    all_items = session.exec(stmt).all()

    stats = {
        "total": len(all_items),
        "pending": sum(1 for x in all_items if x.status == "pending"),
        "approved": sum(1 for x in all_items if x.status == "approved"),
        "resolved": sum(1 for x in all_items if x.status == "resolved"),
        "rejected": sum(1 for x in all_items if x.status == "rejected"),
    }
    return stats


@router.get("/{item_id}", response_model=MissingLocationOut)
def get_missing_location(item_id: int, session: Session = Depends(get_session)):
    item = session.get(MissingLocation, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing location not found")
    return item


@router.patch("/{item_id}", response_model=MissingLocationOut)
def update_missing_location(
    item_id: int,
    payload: MissingLocationUpdate,
    session: Session = Depends(get_session),
):
    item = session.get(MissingLocation, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing location not found")

    update_data = payload.model_dump(exclude_unset=True)

    if payload.status == "resolved" and payload.resolved_node_id:
        update_data["resolved_at"] = datetime.now().isoformat()

    for key, value in update_data.items():
        setattr(item, key, value)

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}/status", response_model=MissingLocationOut)
def update_missing_location_status(
    item_id: int,
    status: str = Query(..., description="New status: pending, approved, resolved, rejected"),
    admin_note: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    item = session.get(MissingLocation, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing location not found")

    item.status = status
    if admin_note:
        item.admin_note = admin_note

    if status == "resolved":
        item.resolved_at = datetime.now().isoformat()

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.post("/{item_id}/resolve")
def resolve_missing_location(
    item_id: int,
    resolved_node_id: int = Query(..., description="ID of the node created in the map"),
    resolved_by: Optional[str] = Query(None, description="Admin who resolved"),
    session: Session = Depends(get_session),
):
    item = session.get(MissingLocation, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing location not found")

    item.status = "resolved"
    item.resolved_node_id = resolved_node_id
    item.resolved_at = datetime.now().isoformat()
    item.resolved_by = resolved_by

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_missing_location(item_id: int, session: Session = Depends(get_session)):
    item = session.get(MissingLocation, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing location not found")

    session.delete(item)
    session.commit()
    return {"message": "Missing location deleted"}
