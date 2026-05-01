from typing import Optional, List, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, delete, Relationship
from sqlalchemy.orm import selectinload
from backend.core.db import engine, get_session

# Đảm bảo import đủ các model
from backend.models.entities import Node, Map, Alias, Edge, Building

router = APIRouter()




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

    # Dùng model_dump thay vì dict()
    node_data = payload.model_dump(exclude={"aliases"})

    # Auto-set building_id từ map nếu map có building
    if m.building_id and not node_data.get("building_id"):
        node_data["building_id"] = m.building_id

    # Tạo Node
    n = Node(**node_data)
    session.add(n)
    session.flush()  # Flush để lấy n.id trước khi commit

    # Tạo Aliases
    if payload.aliases:
        for name in payload.aliases:
            alias = Alias(node_id=n.id, name=name)
            session.add(alias)

    session.commit()
    session.refresh(n)
    return n


@router.get("", response_model=List[NodeOut])
def list_nodes(map_id: int, session: Session = Depends(get_session)):
    stmt = (
        select(Node)
        .where(Node.map_id == map_id)
        .options(
            selectinload(Node.map).selectinload(Map.building),
            selectinload(Node.building),
            selectinload(Node.aliases),
        )
        .order_by(Node.id)
    )
    return session.exec(stmt).all()


@router.get("/{node_id}", response_model=NodeOut)
def get_node(node_id: int, session: Session = Depends(get_session)):
    stmt = (
        select(Node)
        .where(Node.id == node_id)
        .options(
            # Eager load relationships
            selectinload(Node.map).selectinload(Map.building),
            selectinload(Node.building),
            selectinload(Node.aliases),
        )
    )
    n = session.exec(stmt).first()
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")
    return n


@router.patch("/{node_id}", response_model=NodeOut)
def update_node(
    node_id: int, payload: NodeUpdate, session: Session = Depends(get_session)
):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    # 1. Update thông tin cơ bản
    # Loại bỏ map_id và id khỏi data để tránh vô tình ghi đè
    data = payload.model_dump(
        exclude_unset=True, 
        exclude={"aliases", "map", "building", "flags", "id", "map_id"}
    )

    # Auto-set building_id từ map nếu map có building và không truyền building_id
    if "building_id" not in data or data["building_id"] is None:
        m = session.get(Map, n.map_id)
        if m and m.building_id:
            data["building_id"] = m.building_id

    # Xử lý linked_node_ids 2 chiều (multi-link)
    new_linked_ids = data.get("linked_node_ids", [])
    old_linked_ids = n.linked_node_ids or []

    # Gỡ link cũ không còn trong list mới
    for old_id in old_linked_ids:
        if old_id not in (new_linked_ids or []):
            old_node = session.get(Node, old_id)
            if old_node and old_node.linked_node_ids:
                if node_id in old_node.linked_node_ids:
                    old_node.linked_node_ids.remove(node_id)
                    session.add(old_node)

    # Set link 2 chiều cho các node mới
    if new_linked_ids:
        for target_id in new_linked_ids:
            target_node = session.get(Node, target_id)
            if target_node:
                if target_node.linked_node_ids is None:
                    target_node.linked_node_ids = []
                if node_id not in target_node.linked_node_ids:
                    target_node.linked_node_ids.append(node_id)
                    session.add(target_node)

                # Auto-set building_id nếu target có building
                if target_node.building_id and not n.building_id:
                    n.building_id = target_node.building_id

    # Xử lý linked_campus_node_id 2 chiều
    new_campus_id = data.get("linked_campus_node_id")
    old_campus_id = n.linked_campus_node_id

    if old_campus_id and old_campus_id != new_campus_id:
        old_campus = session.get(Node, old_campus_id)
        if old_campus:
            old_campus.linked_campus_node_id = None
            session.add(old_campus)

    if new_campus_id:
        campus_node = session.get(Node, new_campus_id)
        if campus_node:
            campus_node.linked_campus_node_id = node_id
            session.add(campus_node)

    for k, v in data.items():
        setattr(n, k, v)

    # 2. Xử lý update Aliases (Nếu có gửi field aliases lên)
    if payload.aliases is not None:
        # Cách đơn giản nhất: Xóa hết cũ, tạo lại mới
        # Xóa alias cũ
        session.exec(delete(Alias).where(Alias.node_id == node_id))

        # Thêm alias mới - xử lý cả list of strings và list of objects
        for alias_item in payload.aliases:
            if isinstance(alias_item, str):
                name = alias_item
            elif isinstance(alias_item, dict):
                name = alias_item.get("name", "")
            else:
                name = str(alias_item)

            if name:
                new_alias = Alias(node_id=node_id, name=name)
                session.add(new_alias)

    session.add(n)
    session.commit()
    session.refresh(n)
    return n


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
