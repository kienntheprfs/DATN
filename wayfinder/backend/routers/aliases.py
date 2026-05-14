from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
from rapidfuzz import fuzz, process
from backend.core.db import engine, get_session
from backend.models.entities import Alias, Node

router = APIRouter()




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
    building_name: Optional[str] = None
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
    # Get map and building info
    from backend.models.entities import Map, Building

    all_maps = session.exec(select(Map)).all()
    all_buildings = session.exec(select(Building)).all()
    building_dict = {b.id: b.name for b in all_buildings}

    map_info = {
        m.id: {
            "floor": m.floor_level,
            "building_id": m.building_id,
            "building_name": building_dict.get(m.building_id) if m.building_id else None,
        }
        for m in all_maps
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
                        building_name=map_data.get("building_name"),
                        node_type=node.type,
                    )
                )
        else:
            # Use node name if no aliases (Skip if it's "New Node")
            if node.name and node.name.lower() == "new node":
                continue

            out.append(
                AliasSearchOut(
                    node_id=node.id,
                    alias_id=0,
                    name=node.name,
                    score=100.0,
                    map_id=node.map_id,
                    floor=map_data.get("floor"),
                    building_id=map_data.get("building_id"),
                    building_name=map_data.get("building_name"),
                    node_type=node.type,
                )
            )

    return out

    return out


from backend.services.search import find_best_nodes

@router.get("/search", response_model=List[AliasSearchOut])
def search_alias(
    q: str = Query(..., description="Tên cần tìm"),
    limit: int = 20,
    session: Session = Depends(get_session),
):
    if not q or not q.strip():
        return []

    # Get map info for floor lookup
    from backend.models.entities import Map, Building
    all_maps = session.exec(select(Map)).all()
    all_buildings = session.exec(select(Building)).all()
    building_dict = {b.id: b.name for b in all_buildings}
    
    map_info = {
        m.id: {
            "floor": m.floor_level,
            "building_id": m.building_id,
            "building_name": building_dict.get(m.building_id) if m.building_id else None,
        }
        for m in all_maps
    }

    # Use centralized search logic
    search_results = find_best_nodes(session, q, limit=limit)
    
    out = []
    for res in search_results:
        m_data = map_info.get(res.node.map_id, {})
        out.append(
            AliasSearchOut(
                node_id=res.node.id,
                alias_id=res.alias_id,
                name=res.name,
                score=res.score,
                map_id=res.node.map_id,
                floor=m_data.get("floor"),
                building_id=m_data.get("building_id"),
                building_name=m_data.get("building_name"),
                node_type=res.node.type,
            )
        )

    return out

