from typing import List
import os
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy import delete as sa_delete

from backend.core.db import engine
from backend.models.entities import Map, Node, Alias, Edge

router = APIRouter()


def get_session():
    with Session(engine) as session:
        yield session


class ClearMapIn(BaseModel):
    map_id: int
    delete_map: bool = False  # nếu True: xóa luôn bản ghi Map
    delete_upload: bool = False  # nếu True: xóa luôn file ảnh map trên đĩa


@router.post("/clear-map")
def clear_map_data(payload: ClearMapIn, session: Session = Depends(get_session)):
    m = session.get(Map, payload.map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    # 1. Tìm tất cả node_id thuộc map này
    node_ids = session.exec(select(Node.id).where(Node.map_id == m.id)).all()

    # 2. Xóa các quan hệ phụ thuộc trước
    if node_ids:
        # Xóa Alias
        session.exec(sa_delete(Alias).where(Alias.node_id.in_(node_ids)))
        # Xóa Edge (Dựa trên start_node hoặc end_node đều thuộc map này)
        session.exec(sa_delete(Edge).where(Edge.start_node_id.in_(node_ids)))
        # Xóa Node
        session.exec(sa_delete(Node).where(Node.map_id == m.id))

    # 3. Xóa Map và File (nếu yêu cầu)
    img_path = m.image_link
    if payload.delete_map:
        session.delete(m)
        if payload.delete_upload and img_path and os.path.exists(img_path):
            try:
                os.remove(img_path)
            except:
                pass

    session.commit()
    return {"ok": True, "detail": f"Đã dọn dẹp dữ liệu cho map {payload.map_id}"}


class FullMapResponse(BaseModel):
    id: int
    name: str
    floor_level: int
    scale: float
    nodes: List[dict]
    edges: List[dict]


@router.get("/{map_id}/full", response_model=FullMapResponse)
def get_full_map_details(map_id: int, session: Session = Depends(get_session)):
    # 1. Lấy thông tin Map
    m = session.get(Map, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    # 2. Lấy Nodes kèm theo Aliases (SQLModel tự handle relationship nếu đã config)
    nodes = session.exec(select(Node).where(Node.map_id == map_id)).all()

    # Chuyển node sang dict và kèm aliases
    node_list = []
    node_ids = []
    for n in nodes:
        node_ids.append(n.id)
        n_dict = n.dict()
        n_dict["aliases"] = [a.name for a in n.aliases]
        node_list.append(n_dict)

    # 3. Lấy Edges thuộc về các node này
    edge_list = []
    if node_ids:
        edges = session.exec(select(Edge).where(Edge.start_node_id.in_(node_ids))).all()
        edge_list = [e.dict() for e in edges]

    return {
        "id": m.id,
        "name": m.name,
        "floor_level": m.floor_level,
        "scale": m.scale_ratio,
        "nodes": node_list,
        "edges": edge_list,
    }
