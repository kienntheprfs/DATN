from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime

from backend.core.db import engine
from backend.models.entities import MissingRoute

router = APIRouter()


def get_session():
    with Session(engine) as session:
        yield session


class MissingRouteCreate(BaseModel):
    start_name: str
    start_building: Optional[str] = None
    start_floor: Optional[int] = None
    start_node_id: Optional[int] = None

    end_name: str
    end_building: Optional[str] = None
    end_floor: Optional[int] = None
    end_node_id: Optional[int] = None

    reason: Optional[str] = None
    reported_by: Optional[str] = None


class MissingRouteUpdate(BaseModel):
    start_name: Optional[str] = None
    start_building: Optional[str] = None
    start_floor: Optional[int] = None
    start_node_id: Optional[int] = None

    end_name: Optional[str] = None
    end_building: Optional[str] = None
    end_floor: Optional[int] = None
    end_node_id: Optional[int] = None

    reason: Optional[str] = None
    status: Optional[str] = None
    resolved_note: Optional[str] = None
    resolved_by: Optional[str] = None


class MissingRouteOut(BaseModel):
    id: int
    start_node_id: Optional[int]
    start_name: str
    start_building: Optional[str]
    start_floor: Optional[int]

    end_node_id: Optional[int]
    end_name: str
    end_building: Optional[str]
    end_floor: Optional[int]

    reason: Optional[str]
    status: str
    resolved_note: Optional[str]
    resolved_at: Optional[str]
    resolved_by: Optional[str]
    reported_by: Optional[str]
    created_at: Optional[str]

    class Config:
        from_attributes = True


@router.post("", response_model=MissingRouteOut)
def create_missing_route(
    payload: MissingRouteCreate, session: Session = Depends(get_session)
):
    missing = MissingRoute(
        **payload.model_dump(), status="pending", created_at=datetime.now().isoformat()
    )
    session.add(missing)
    session.commit()
    session.refresh(missing)
    return missing


@router.get("", response_model=List[MissingRouteOut])
def list_missing_routes(
    status: Optional[str] = Query(
        None, description="Filter by status: pending, resolved"
    ),
    building: Optional[str] = Query(None, description="Filter by building name"),
    limit: int = Query(100, le=500),
    session: Session = Depends(get_session),
):
    stmt = select(MissingRoute)

    if status:
        stmt = stmt.where(MissingRoute.status == status)
    if building:
        from sqlalchemy import or_

        stmt = stmt.where(
            or_(
                MissingRoute.start_building.ilike(f"%{building}%"),
                MissingRoute.end_building.ilike(f"%{building}%"),
            )
        )

    stmt = stmt.order_by(MissingRoute.created_at.desc()).limit(limit)
    return session.exec(stmt).all()


@router.get("/pending", response_model=List[MissingRouteOut])
def list_pending_missing_routes(session: Session = Depends(get_session)):
    stmt = (
        select(MissingRoute)
        .where(MissingRoute.status == "pending")
        .order_by(MissingRoute.created_at.desc())
    )
    return session.exec(stmt).all()


@router.get("/stats")
def get_missing_route_stats(session: Session = Depends(get_session)):
    stmt = select(MissingRoute)
    all_items = session.exec(stmt).all()

    stats = {
        "total": len(all_items),
        "pending": sum(1 for x in all_items if x.status == "pending"),
        "resolved": sum(1 for x in all_items if x.status == "resolved"),
    }
    return stats


@router.get("/{item_id}", response_model=MissingRouteOut)
def get_missing_route(item_id: int, session: Session = Depends(get_session)):
    item = session.get(MissingRoute, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing route not found")
    return item


@router.patch("/{item_id}", response_model=MissingRouteOut)
def update_missing_route(
    item_id: int, payload: MissingRouteUpdate, session: Session = Depends(get_session)
):
    item = session.get(MissingRoute, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing route not found")

    update_data = payload.model_dump(exclude_unset=True)

    if payload.status == "resolved":
        update_data["resolved_at"] = datetime.now().isoformat()

    for key, value in update_data.items():
        setattr(item, key, value)

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.post("/{item_id}/resolve")
def resolve_missing_route(
    item_id: int,
    resolved_note: str = Query(..., description="Note about how it was resolved"),
    resolved_by: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    item = session.get(MissingRoute, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing route not found")

    item.status = "resolved"
    item.resolved_note = resolved_note
    item.resolved_at = datetime.now().isoformat()
    item.resolved_by = resolved_by

    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}")
def delete_missing_route(item_id: int, session: Session = Depends(get_session)):
    item = session.get(MissingRoute, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Missing route not found")

    session.delete(item)
    session.commit()
    return {"message": "Missing route deleted"}
