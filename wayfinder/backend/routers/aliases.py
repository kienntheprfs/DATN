from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from rapidfuzz import fuzz, process
from backend.core.db import engine
from backend.models.entities import Alias, Node

router = APIRouter()


def get_session():
    with Session(engine) as session:
        yield session


class AliasIn(BaseModel):
    node_id: int
    name: str


class AliasOut(BaseModel):
    id: int
    node_id: int
    name: str

    class Config:
        from_attributes = True


class AliasSearchOut(BaseModel):
    node_id: int
    alias_id: int
    name: str
    score: float
    map_id: Optional[int] = None
    floor: Optional[int] = None
    building_id: Optional[int] = None
    node_type: Optional[str] = None


@router.post("", response_model=AliasOut)
def create_alias(payload: AliasIn, session: Session = Depends(get_session)):
    # Kiểm tra node có tồn tại không
    n = session.get(Node, payload.node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    # Tạo alias mới
    a = Alias(node_id=payload.node_id, name=payload.name)
    session.add(a)
    session.commit()
    session.refresh(a)
    return a


@router.get("", response_model=List[AliasOut])
def list_aliases(
    node_id: Optional[int] = None, session: Session = Depends(get_session)
):
    stmt = select(Alias)
    if node_id:
        stmt = stmt.where(Alias.node_id == node_id)
    return session.exec(stmt).all()


@router.get("/all", response_model=List[AliasSearchOut])
def get_all_locations(
    map_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """Lấy tất cả các địa điểm có thể điều hướng (bao gồm cả nodes không có alias)"""
    # Get map info first
    from backend.models.entities import Map

    all_maps = session.exec(select(Map)).all()
    map_info = {
        m.id: {"floor": m.floor_level, "building_id": m.building_id} for m in all_maps
    }

    # Get all nodes
    if map_id:
        nodes = session.exec(select(Node).where(Node.map_id == map_id)).all()
    else:
        nodes = session.exec(select(Node)).all()

    # Get all aliases
    all_aliases = session.exec(select(Alias)).all()
    node_aliases = {}
    for a in all_aliases:
        if a.node_id not in node_aliases:
            node_aliases[a.node_id] = []
        node_aliases[a.node_id].append(a)

    out = []
    for node in nodes:
        aliases = node_aliases.get(node.id, [])
        map_data = map_info.get(node.map_id, {})

        if aliases:
            # Use aliases as locations
            for alias in aliases:
                out.append(
                    AliasSearchOut(
                        node_id=node.id,
                        alias_id=alias.id,
                        name=alias.name,
                        score=100.0,
                        map_id=node.map_id,
                        floor=map_data.get("floor"),
                        building_id=map_data.get("building_id"),
                        node_type=node.type,
                    )
                )
        else:
            # Use node name if no aliases
            out.append(
                AliasSearchOut(
                    node_id=node.id,
                    alias_id=0,
                    name=node.name,
                    score=100.0,
                    map_id=node.map_id,
                    floor=map_data.get("floor"),
                    building_id=map_data.get("building_id"),
                    node_type=node.type,
                )
            )

    return out

    return out


@router.get("/search", response_model=List[AliasSearchOut])
def search_alias(
    q: str = Query(..., description="Tên cần tìm"),
    limit: int = 5,
    session: Session = Depends(get_session),
):
    if not q or not q.strip():
        return []

    norm_q = q.strip().lower()
    stmt = select(Alias).where(Alias.name.ilike(f"%{norm_q}%"))
    items = session.exec(stmt).all()

    if not items:
        return []

    choices = {a.id: a.name for a in items}

    # token_set_ratio rất tốt cho việc tìm "Phòng họp" khi user gõ "họp phòng"
    results = process.extract(norm_q, choices, scorer=fuzz.token_set_ratio, limit=limit)

    # Format kết quả trả về
    out = []
    items_map = {a.id: a for a in items}

    for _, score, alias_id in results:
        if score < 40:  # Ngưỡng tối thiểu để được coi là khớp
            continue

        a = items_map.get(alias_id)
        out.append(
            AliasSearchOut(
                node_id=a.node_id, alias_id=a.id, name=a.name, score=float(score)
            )
        )
    return out
