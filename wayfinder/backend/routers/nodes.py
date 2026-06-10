from typing import Optional, List, Any, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, delete, Relationship
from sqlalchemy.orm import selectinload
from backend.core.db import engine, get_session

# Đảm bảo import đủ các model
from backend.models.entities import Node, Map, Alias, Edge, Building
from backend.services.geo import FIXED_COSTS

router = APIRouter()


def _get_linked_node_ids(session: Session, node_id: int) -> List[int]:
    """Get all linked node IDs from edges (both directions), excluding entrance type"""
    linked = set()

    outgoing = session.exec(
        select(Edge).where((Edge.start_node_id == node_id) & (Edge.type != "entrance"))
    ).all()
    for e in outgoing:
        linked.add(e.end_node_id)

    incoming = session.exec(
        select(Edge).where(
            (Edge.end_node_id == node_id)
            & (Edge.type != "entrance")
            & ((Edge.bidirectional == True) | (Edge.start_node_id == node_id))
        )
    ).all()
    for e in incoming:
        if e.start_node_id != node_id:
            linked.add(e.start_node_id)

    return sorted(list(linked))


def _resolve_conn_type(n1: Node, n2: Node) -> str:
    # Nếu cùng bản đồ thì luôn là đi bộ
    if n1.map_id == n2.map_id:
        return "walk"
    
    # Nếu khác bản đồ mới xét đến cầu thang/thang máy
    if n1.type in ["stairs", "elevator"]:
        return n1.type
    if n2.type in ["stairs", "elevator"]:
        return n2.type
    return "walk"


def _get_linked_campus_node_id(session: Session, node_id: int) -> Optional[int]:
    """Get campus link from edges (type='entrance')"""
    # Outgoing
    outgoing = session.exec(
        select(Edge).where((Edge.start_node_id == node_id) & (Edge.type == "entrance"))
    ).first()
    if outgoing:
        return outgoing.end_node_id

    # Incoming
    incoming = session.exec(
        select(Edge).where(
            (Edge.end_node_id == node_id)
            & (Edge.type == "entrance")
            & (Edge.bidirectional == True)
        )
    ).first()
    if incoming:
        return incoming.start_node_id

    return None


# --- SCHEMAS (DTO) ---


# 1. Thêm các trường name, type cho khớp DB
class NodeIn(BaseModel):
    map_id: int
    name: str
    x: float
    y: float
    type: str = "path"  # Mặc định là path
    linked_node_ids: Optional[List[int]] = None
    linked_campus_node_id: Optional[int] = None
    description: Optional[str] = None
    real_image_url: Optional[str] = None
    aliases: List[str] = []


class AliasOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class BuildingOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class MapOut(BaseModel):
    id: int
    name: str
    building_id: Optional[int] = None
    building: Optional[BuildingOut] = None

    class Config:
        from_attributes = True


class NodeOut(BaseModel):
    id: int
    map_id: int
    map: Optional[MapOut] = None
    name: str
    x: float
    y: float
    type: str
    building_id: Optional[int] = None
    building: Optional[BuildingOut] = None
    linked_node_ids: Optional[List[int]] = None
    linked_campus_node_id: Optional[int] = None
    description: Optional[str] = None
    real_image_url: Optional[str] = None
    aliases: List[AliasOut] = []

    class Config:
        from_attributes = True


# 2. Update cho phép sửa cả name, type và danh sách aliases
class NodeUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    type: Optional[str] = None
    linked_node_ids: Optional[List[int]] = None
    linked_campus_node_id: Optional[int] = None
    building_id: Optional[int] = None
    description: Optional[str] = None
    real_image_url: Optional[str] = None
    aliases: Optional[Any] = None
    map_id: Optional[int] = None  # Thêm nhưng sẽ bị loại bỏ khi update


# --- ENDPOINTS ---


@router.post("", response_model=NodeOut)
def create_node(payload: NodeIn, session: Session = Depends(get_session)):
    # Validate Map tồn tại
    m = session.get(Map, payload.map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    node_data = payload.model_dump(
        exclude={"aliases", "linked_node_ids", "linked_campus_node_id"}
    )

    # Auto-set building_id từ map nếu map có building
    if m.building_id and not node_data.get("building_id"):
        node_data["building_id"] = m.building_id

    n = Node(**node_data)
    session.add(n)
    session.flush()

    # Tạo Edge từ linked_node_ids
    if payload.linked_node_ids:
        for target_id in payload.linked_node_ids:
            target_node = session.get(Node, target_id)
            if target_node:
                conn_type = _resolve_conn_type(n.type, target_node.type)
                edge = Edge(
                    start_node_id=n.id,
                    end_node_id=target_id,
                    type=conn_type,
                    weight=50.0,
                    bidirectional=True,
                    polyline=[],
                )
                session.add(edge)

    if payload.linked_campus_node_id:
        campus_node = session.get(Node, payload.linked_campus_node_id)
        if campus_node:
            edge = Edge(
                start_node_id=n.id,
                end_node_id=payload.linked_campus_node_id,
                type="entrance",
                weight=10.0,
                bidirectional=True,
                polyline=[],
            )
            session.add(edge)

    # Tạo Aliases
    if payload.aliases:
        for name in payload.aliases:
            alias = Alias(node_id=n.id, name=name)
            session.add(alias)

    session.commit()
    session.refresh(n)
    
    # Chuyển sang NodeOut (Pydantic) trước khi gán các trường bổ sung
    node_out = NodeOut.model_validate(n)
    node_out.linked_node_ids = _get_linked_node_ids(session, n.id)
    node_out.linked_campus_node_id = _get_linked_campus_node_id(session, n.id)
    
    return node_out


@router.get("", response_model=List[NodeOut])
def list_nodes(map_id: Optional[int] = None, session: Session = Depends(get_session)):
    stmt = select(Node)
    if map_id is not None:
        stmt = stmt.where(Node.map_id == map_id)
    
    stmt = stmt.options(
        selectinload(Node.map).selectinload(Map.building),
        selectinload(Node.building),
        selectinload(Node.aliases),
    ).order_by(Node.id)
    nodes = session.exec(stmt).all()
    
    results = []
    for n in nodes:
        # Chuyển sang NodeOut (Pydantic) trước khi gán các trường bổ sung
        node_out = NodeOut.model_validate(n)
        node_out.linked_node_ids = _get_linked_node_ids(session, n.id)
        node_out.linked_campus_node_id = _get_linked_campus_node_id(session, n.id)
        results.append(node_out)
        
    return results


@router.get("/{node_id}", response_model=NodeOut)
def get_node(node_id: int, session: Session = Depends(get_session)):
    stmt = (
        select(Node)
        .where(Node.id == node_id)
        .options(
            selectinload(Node.map).selectinload(Map.building),
            selectinload(Node.building),
            selectinload(Node.aliases),
        )
    )
    n = session.exec(stmt).first()
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")
        
    # Chuyển sang NodeOut (Pydantic) trước khi gán các trường bổ sung
    node_out = NodeOut.model_validate(n)
    node_out.linked_node_ids = _get_linked_node_ids(session, n.id)
    node_out.linked_campus_node_id = _get_linked_campus_node_id(session, n.id)
    
    return node_out


@router.patch("/{node_id}", response_model=NodeOut)
def update_node(
    node_id: int, payload: NodeUpdate, session: Session = Depends(get_session)
):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    raw = payload.model_dump(exclude_unset=True)
    linked_node_ids_raw = raw.pop("linked_node_ids", None)
    linked_campus_node_id_raw = raw.pop("linked_campus_node_id", None)

    data = {
        k: v
        for k, v in raw.items()
        if k not in {"aliases", "map", "building", "flags", "id", "map_id"}
    }

    if "building_id" not in data or data["building_id"] is None:
        m = session.get(Map, n.map_id)
        if m and m.building_id:
            data["building_id"] = m.building_id

    # Xử lý linked_node_ids (Edge table only)
    if linked_node_ids_raw is not None:
        new_ids = linked_node_ids_raw or []
        old_ids = _get_linked_node_ids(session, node_id)

        for oid in old_ids:
            if oid not in new_ids:
                edge = session.exec(
                    select(Edge).where(
                        ((Edge.start_node_id == node_id) & (Edge.end_node_id == oid))
                        | ((Edge.start_node_id == oid) & (Edge.end_node_id == node_id))
                    )
                ).first()
                if edge:
                    session.delete(edge)

        for tid in new_ids:
            if tid not in old_ids:
                target = session.get(Node, tid)
                if target:
                    existing = session.exec(
                        select(Edge).where(
                            (
                                (Edge.start_node_id == node_id)
                                & (Edge.end_node_id == tid)
                            )
                            | (
                                (Edge.start_node_id == tid)
                                & (Edge.end_node_id == node_id)
                            )
                        )
                    ).first()
                    if not existing:
                        conn_type = _resolve_conn_type(n, target)
                        session.add(
                            Edge(
                                start_node_id=node_id,
                                end_node_id=tid,
                                type=conn_type,
                                weight=FIXED_COSTS.get(conn_type, 50.0),
                                bidirectional=True,
                                polyline=[],
                            )
                        )

    # Xử lý linked_campus_node_id (Edge table only)
    if linked_campus_node_id_raw is not None:
        new_campus = linked_campus_node_id_raw
        old_campus = _get_linked_campus_node_id(session, node_id)

        if old_campus and old_campus != new_campus:
            edge = session.exec(
                select(Edge).where(
                    (
                        (Edge.start_node_id == node_id)
                        & (Edge.end_node_id == old_campus)
                        & (Edge.type == "entrance")
                    )
                    | (
                        (Edge.start_node_id == old_campus)
                        & (Edge.end_node_id == node_id)
                        & (Edge.type == "entrance")
                    )
                )
            ).first()
            if edge:
                session.delete(edge)

        if new_campus and new_campus != old_campus:
            campus_node = session.get(Node, new_campus)
            if campus_node:
                existing = session.exec(
                    select(Edge).where(
                        (
                            (Edge.start_node_id == node_id)
                            & (Edge.end_node_id == new_campus)
                            & (Edge.type == "entrance")
                        )
                        | (
                            (Edge.start_node_id == new_campus)
                            & (Edge.end_node_id == node_id)
                            & (Edge.type == "entrance")
                        )
                    )
                ).first()
                if not existing:
                    session.add(
                        Edge(
                            start_node_id=node_id,
                            end_node_id=new_campus,
                            type="entrance",
                            weight=FIXED_COSTS.get("entrance", 10.0),
                            bidirectional=True,
                            polyline=[],
                        )
                    )

    for k, v in data.items():
        setattr(n, k, v)

    # Xử lý update Aliases
    if payload.aliases is not None:
        session.exec(delete(Alias).where(Alias.node_id == node_id))
        for alias_item in payload.aliases:
            if isinstance(alias_item, str):
                name = alias_item
            elif isinstance(alias_item, dict):
                name = alias_item.get("name", "")
            else:
                name = str(alias_item)
            if name:
                session.add(Alias(node_id=node_id, name=name))

    session.add(n)
    session.commit()
    session.refresh(n)
    
    # Chuyển sang NodeOut (Pydantic) trước khi gán các trường bổ sung
    node_out = NodeOut.model_validate(n)
    node_out.linked_node_ids = _get_linked_node_ids(session, n.id)
    node_out.linked_campus_node_id = _get_linked_campus_node_id(session, n.id)
    
    return node_out


@router.delete("/{node_id}")
def delete_node(node_id: int, session: Session = Depends(get_session)):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    # Dùng lệnh delete trực tiếp sẽ nhanh hơn là select all rồi loop delete
    # Xoá Alias
    session.exec(delete(Alias).where(Alias.node_id == node_id))

    # Xoá Edge liên quan
    session.exec(
        delete(Edge).where(
            (Edge.start_node_id == node_id) | (Edge.end_node_id == node_id)
        )
    )

    # Xoá Node
    session.delete(n)
    session.commit()
    return {"message": "Xóa node thành công", "node_id": node_id}
