from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime, date
from rapidfuzz import fuzz, process

from backend.core.db import engine, get_session
from backend.models.entities import Event, Node

router = APIRouter()




class EventCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location_name: Optional[str] = None
    node_id: Optional[int] = None
    organizer: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = True


class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location_name: Optional[str] = None
    node_id: Optional[int] = None
    organizer: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


class EventOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    start_date: str
    end_date: Optional[str]
    start_time: Optional[str]
    end_time: Optional[str]
    location_name: Optional[str]
    node_id: Optional[int]
    organizer: Optional[str]
    category: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class EventWithLocation(BaseModel):
    id: int
    name: str
    description: Optional[str]
    start_date: str
    end_date: Optional[str]
    start_time: Optional[str]
    end_time: Optional[str]
    location_name: Optional[str]
    node_id: Optional[int]
    node_name: Optional[str]
    building_name: Optional[str]
    floor_level: Optional[int]
    organizer: Optional[str]
    category: Optional[str]
    is_active: bool


@router.post("", response_model=EventOut)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    event = Event(**payload.model_dump(), created_at=datetime.now().isoformat())
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@router.get("", response_model=List[EventOut])
def list_events(
    active_only: bool = True,
    category: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Event)
    if active_only:
        stmt = stmt.where(Event.is_active == True)
    if category:
        stmt = stmt.where(Event.category == category)
    stmt = stmt.order_by(Event.start_date, Event.start_time)
    return session.exec(stmt).all()


def _get_event_with_location(e: Event, session: Session) -> EventWithLocation:
    node_name = None
    building_name = None
    floor_level = None

    if e.node_id:
        node = session.get(Node, e.node_id)
        if node:
            node_name = node.name
            if node.map_id:
                from backend.models.entities import Map, Building

                map_obj = session.get(Map, node.map_id)
                if map_obj:
                    floor_level = map_obj.floor_level
                    if map_obj.building_id:
                        building = session.get(Building, map_obj.building_id)
                        if building:
                            building_name = building.name

    return EventWithLocation(
        id=e.id,
        name=e.name,
        description=e.description,
        start_date=e.start_date,
        end_date=e.end_date,
        start_time=e.start_time,
        end_time=e.end_time,
        location_name=e.location_name or node_name,
        node_id=e.node_id,
        node_name=node_name,
        building_name=building_name,
        floor_level=floor_level,
        organizer=e.organizer,
        category=e.category,
        is_active=e.is_active,
    )


@router.get("/all", response_model=List[EventWithLocation])
def list_all_events_with_location(
    active_only: bool = False,
    category: Optional[str] = None,
    session: Session = Depends(get_session),
):
    """Lấy tất cả sự kiện với thông tin vị trí đầy đủ"""
    stmt = select(Event)
    if active_only:
        stmt = stmt.where(Event.is_active == True)
    if category:
        stmt = stmt.where(Event.category == category)
    stmt = stmt.order_by(Event.start_date.desc(), Event.start_time)
    events = session.exec(stmt).all()

    return [_get_event_with_location(e, session) for e in events]


@router.get("/upcoming", response_model=List[EventWithLocation])
def upcoming_events(
    limit: int = 10,
    session: Session = Depends(get_session),
):
    today = date.today().isoformat()
    stmt = (
        select(Event)
        .where(Event.is_active == True)
        .where(Event.start_date >= today)
        .order_by(Event.start_date, Event.start_time)
        .limit(limit)
    )
    events = session.exec(stmt).all()

    result = []
    for e in events:
        node_name = None
        building_name = None
        floor_level = None

        if e.node_id:
            node = session.get(Node, e.node_id)
            if node:
                node_name = node.name
                if node.map_id:
                    from backend.models.entities import Map, Building

                    map_obj = session.get(Map, node.map_id)
                    if map_obj:
                        floor_level = map_obj.floor_level
                        if map_obj.building_id:
                            building = session.get(Building, map_obj.building_id)
                            if building:
                                building_name = building.name

        result.append(
            EventWithLocation(
                id=e.id,
                name=e.name,
                description=e.description,
                start_date=e.start_date,
                end_date=e.end_date,
                start_time=e.start_time,
                end_time=e.end_time,
                location_name=e.location_name or node_name,
                node_id=e.node_id,
                node_name=node_name,
                building_name=building_name,
                floor_level=floor_level,
                organizer=e.organizer,
                category=e.category,
                is_active=e.is_active,
            )
        )

    return result


@router.get("/search", response_model=List[EventWithLocation])
def search_events(
    q: str = Query(..., description="Từ khóa tìm kiếm"),
    limit: int = 10,
    session: Session = Depends(get_session),
):
    stmt = select(Event).where(Event.is_active == True)
    events = session.exec(stmt).all()

    if not events:
        return []

    # Fuzzy search
    choices = {e.id: e.name for e in events}
    results = process.extract(
        q.lower(), choices, scorer=fuzz.token_set_ratio, limit=limit * 2
    )

    event_map = {e.id: e for e in events}
    matched = []

    for _, score, event_id in results:
        if score < 40:
            continue
        e = event_map.get(event_id)
        if e:
            node_name = None
            building_name = None
            floor_level = None

            if e.node_id:
                node = session.get(Node, e.node_id)
                if node:
                    node_name = node.name
                    if node.map_id:
                        from backend.models.entities import Map, Building

                        map_obj = session.get(Map, node.map_id)
                        if map_obj:
                            floor_level = map_obj.floor_level
                            if map_obj.building_id:
                                building = session.get(Building, map_obj.building_id)
                                if building:
                                    building_name = building.name

            matched.append(
                EventWithLocation(
                    id=e.id,
                    name=e.name,
                    description=e.description,
                    start_date=e.start_date,
                    end_date=e.end_date,
                    start_time=e.start_time,
                    end_time=e.end_time,
                    location_name=e.location_name or node_name,
                    node_id=e.node_id,
                    node_name=node_name,
                    building_name=building_name,
                    floor_level=floor_level,
                    organizer=e.organizer,
                    category=e.category,
                    is_active=e.is_active,
                )
            )

        if len(matched) >= limit:
            break

    return matched


@router.get("/{event_id}", response_model=EventWithLocation)
def get_event(event_id: int, session: Session = Depends(get_session)):
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    node_name = None
    building_name = None
    floor_level = None

    if e.node_id:
        node = session.get(Node, e.node_id)
        if node:
            node_name = node.name
            if node.map_id:
                from backend.models.entities import Map, Building

                map_obj = session.get(Map, node.map_id)
                if map_obj:
                    floor_level = map_obj.floor_level
                    if map_obj.building_id:
                        building = session.get(Building, map_obj.building_id)
                        if building:
                            building_name = building.name

    return EventWithLocation(
        id=e.id,
        name=e.name,
        description=e.description,
        start_date=e.start_date,
        end_date=e.end_date,
        start_time=e.start_time,
        end_time=e.end_time,
        location_name=e.location_name or node_name,
        node_id=e.node_id,
        node_name=node_name,
        building_name=building_name,
        floor_level=floor_level,
        organizer=e.organizer,
        category=e.category,
        is_active=e.is_active,
    )


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int, payload: EventUpdate, session: Session = Depends(get_session)
):
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(e, key, value)

    session.add(e)
    session.commit()
    session.refresh(e)
    return e


@router.delete("/{event_id}")
def delete_event(event_id: int, session: Session = Depends(get_session)):
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    session.delete(e)
    session.commit()
    return {"message": "Event deleted"}
