from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from backend.core.db import engine, get_session
from backend.models.entities import Edge, Map, Node
from backend.services.geo import polyline_length, calculate_edge_weight, TYPE_FACTORS, FIXED_COSTS

router = APIRouter()


# --- SCHEMAS ---
class EdgeIn(BaseModel):
    start_node_id: int
    end_node_id: int
    type: str = "walk"
    # Polyline là list tọa độ [[x1,y1], [x2,y2]]
    polyline: Optional[List[List[float]]] = None
    bidirectional: bool = True


class EdgeOut(BaseModel):
    id: int
    start_node_id: int
    end_node_id: int
    type: str
    polyline: List[List[float]]
    weight: float
    bidirectional: bool

    class Config:
        from_attributes = True


class EdgeUpdate(BaseModel):
    # SỬA 1: Thêm type vào đây để có thể đổi loại đường
    type: Optional[str] = None
    polyline: Optional[List[List[float]]] = None
    bidirectional: Optional[bool] = None


@router.post("", response_model=EdgeOut)
def create_edge(payload: EdgeIn, session: Session = Depends(get_session)):
    # 1. Validate Nodes
    if payload.start_node_id == payload.end_node_id:
        raise HTTPException(
            status_code=400, detail="Start Node và End Node không được trùng nhau."
        )

    s_node = session.get(Node, payload.start_node_id)
    e_node = session.get(Node, payload.end_node_id)

    if not s_node or not e_node:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    # Check for existing edge (avoid duplicates)
    existing = session.exec(
        select(Edge).where(
            ((Edge.start_node_id == s_node.id) & (Edge.end_node_id == e_node.id))
            | (
                (Edge.start_node_id == e_node.id)
                & (Edge.end_node_id == s_node.id)
                & (Edge.bidirectional == True)
            )
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Edge giữa hai node này đã tồn tại."
        )

    # 2. Handle CROSS-FLOOR vs SAME-FLOOR
    is_cross_floor = s_node.map_id != e_node.map_id

    if is_cross_floor:
        # Cross-floor (stairs/elevator): fixed weight, no polyline
        if s_node.type in ["stairs", "elevator"]:
            conn_type = s_node.type
        elif e_node.type in ["stairs", "elevator"]:
            conn_type = e_node.type
        else:
            conn_type = "stairs"  # Default

        poly = []
        actual_weight = FIXED_COSTS.get(conn_type, 50.0)  # Fixed weight for stairs/elevator
    else:
        # Same floor: calculate normally
        m = session.get(Map, s_node.map_id)
        map_scale = m.scale_ratio if m else 1.0

        poly = payload.polyline
        if not poly or len(poly) < 2:
            poly = [[s_node.x, s_node.y], [e_node.x, e_node.y]]

        conn_type = payload.type
        actual_weight = calculate_edge_weight(poly, conn_type, map_scale)

    # 3. Save Edge
    edge = Edge(
        start_node_id=s_node.id,
        end_node_id=e_node.id,
        type=conn_type,
        polyline=poly,
        weight=actual_weight,
        bidirectional=payload.bidirectional,
    )

    session.add(edge)
    session.commit()
    session.refresh(edge)
    return edge


@router.get("", response_model=List[EdgeOut])
def list_edges(map_id: Optional[int] = None, session: Session = Depends(get_session)):
    # Lấy các cạnh mà start_node HOẶC end_node nằm trên map_id này
    # Điều này quan trọng cho cạnh liên kết tầng (cross-floor)
    if map_id is not None:
        stmt = (
            select(Edge)
            .join(Node, (Edge.start_node_id == Node.id) | (Edge.end_node_id == Node.id))
            .where(Node.map_id == map_id)
            .distinct()
        )
    else:
        stmt = select(Edge)
    return session.exec(stmt).all()


@router.patch("/{edge_id}", response_model=EdgeOut)
def update_edge(
    edge_id: int, payload: EdgeUpdate, session: Session = Depends(get_session)
):
    ed = session.get(Edge, edge_id)
    if not ed:
        raise HTTPException(status_code=404, detail="Edge không tồn tại.")

    # SỬA 3: Dùng model_dump() thay vì dict() (Pydantic V2)
    update_data = payload.model_dump(exclude_unset=True)

    # Logic: Nếu Type hoặc Polyline thay đổi -> Phải tính lại Weight
    should_recalc_weight = False

    # Xử lý Polyline mới (Nếu có)
    if "polyline" in update_data:
        new_poly = update_data["polyline"]
        # Lấy lại node để snap tọa độ (Rất quan trọng khi kéo thả node)
        s_node = session.get(Node, ed.start_node_id)
        e_node = session.get(Node, ed.end_node_id)

        # Snap endpoints
        if len(new_poly) >= 2:
            new_poly[0] = [s_node.x, s_node.y]
            new_poly[-1] = [e_node.x, e_node.y]

        ed.polyline = new_poly
        should_recalc_weight = True

    # Xử lý Type mới (Nếu có)
    if "type" in update_data:
        ed.type = update_data["type"]
        should_recalc_weight = True

    # Xử lý Bidirectional
    if "bidirectional" in update_data:
        ed.bidirectional = update_data["bidirectional"]

    # Tính lại Weight nếu cần
    if should_recalc_weight:
        # Lấy scale từ Map
        # Cách tối ưu: Join trực tiếp thay vì query lồng
        stmt = (
            select(Map)
            .join(Node, Map.id == Node.map_id)
            .where(Node.id == ed.start_node_id)
        )
        m = session.exec(stmt).first()
        map_scale = m.scale_ratio if m else 1.0

        ed.weight = calculate_edge_weight(ed.polyline, ed.type, map_scale)

    session.add(ed)
    session.commit()
    session.refresh(ed)
    return ed


@router.delete("/{edge_id}")
def delete_edge(edge_id: int, session: Session = Depends(get_session)):
    ed = session.get(Edge, edge_id)
    if not ed:
        raise HTTPException(status_code=404, detail="Edge không tồn tại.")
    session.delete(ed)
    session.commit()
    return {"ok": True}
