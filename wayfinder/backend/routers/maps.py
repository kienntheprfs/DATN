import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Query
from sqlmodel import Session, select

from backend.core.db import engine, get_session

# Import đúng các model mới
from backend.models.entities import Map, Building, Edge, Node
from backend.services.geo import calculate_edge_weight

router = APIRouter()

# Cấu hình đường dẫn lưu file
# File sẽ nằm trong: data/uploads/
DATA_DIR = "data"
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)




# =========================================================================
# 1. CREATE MAP (Hỗ trợ upload ảnh + Gán Building)
# =========================================================================
@router.post("", response_model=Map)
async def create_map(
    name: str = Form(...),
    scale_ratio: float = Form(1.0),  # Đổi tên từ scale -> scale_ratio
    floor_level: Optional[int] = Form(None),  # Đổi tên từ floor_number, có thể null
    building_id: Optional[int] = Form(None),  # Map này thuộc tòa nhà nào (Optional)
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    # 1. Validate File
    if file.content_type not in [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
    ]:
        raise HTTPException(
            status_code=400, detail="File phải là ảnh (png/jpg/webp/svg)."
        )

    # 2. Validate Building (Nếu có gửi building_id)
    if building_id:
        building = session.get(Building, building_id)
        if not building:
            raise HTTPException(
                status_code=404, detail=f"Building ID {building_id} không tồn tại."
            )

    # 3. Lưu file vật lý
    # Tạo tên file: map_{timestamp}.png để tránh trùng
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    ext = os.path.splitext(file.filename)[1].lower()
    if not ext:
        ext = ".png"

    filename = f"map_{ts}{ext}"
    disk_path = os.path.join(UPLOAD_DIR, filename)

    try:
        with open(disk_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lưu file: {str(e)}")

    # 4. Lưu đường dẫn vào DB
    # Lưu path tương đối dạng: "uploads/map_xxx.png" để frontend dễ ghép với Base URL
    relative_path = os.path.join("uploads", filename).replace("\\", "/")

    new_map = Map(
        name=name,
        floor_level=floor_level,
        scale_ratio=scale_ratio,
        image_url=relative_path,  # Trường mới trong DB
        building_id=building_id,
    )

    session.add(new_map)
    session.commit()
    session.refresh(new_map)

    return new_map


# =========================================================================
# GET CAMPUS MAPS (Lấy map không thuộc tòa nhà nào)
# =========================================================================
@router.get("/campus", response_model=List[Map])
def get_campus_maps(session: Session = Depends(get_session)):
    """
    Chỉ lấy danh sách bản đồ Campus (building_id IS NULL).
    """
    # SQLModel: So sánh == None sẽ tự dịch thành IS NULL trong SQL
    statement = select(Map).where(Map.building_id == None)
    maps = session.exec(statement).all()
    return maps


@router.patch("/{map_id}", response_model=Map)
def update_map(map_id: int, payload: Map, session: Session = Depends(get_session)):
    n = session.get(Map, map_id)
    if not n:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    # Cập nhật các field từ payload (chỉ những field không None)
    update_data = payload.model_dump(exclude_unset=True)
    
    # Kiểm tra xem có đổi scale_ratio không
    old_scale = n.scale_ratio
    new_scale = update_data.get("scale_ratio")
    
    for field, value in update_data.items():
        setattr(n, field, value)

    session.add(n)
    
    # Nếu scale thay đổi, tính lại tất cả weight của các edge thuộc map này
    if new_scale is not None and new_scale != old_scale:
        # Lấy tất cả các node thuộc map này
        # Sau đó lấy tất cả các edge nối từ các node đó
        statement = select(Edge).join(Node, Edge.start_node_id == Node.id).where(Node.map_id == map_id)
        edges = session.exec(statement).all()
        
        for edge in edges:
            edge.weight = calculate_edge_weight(edge.polyline, edge.type, new_scale)
            session.add(edge)

    session.commit()
    session.refresh(n)
    return n


# =========================================================================
# 2. GET LIST (Hỗ trợ lọc theo Building)
# =========================================================================
@router.get("", response_model=List[Map])
def list_maps(
    building_id: Optional[int] = Query(
        None, description="Lọc map theo tòa nhà. Để trống lấy tất cả."
    ),
    session: Session = Depends(get_session),
):
    statement = select(Map)

    if building_id is not None:
        statement = statement.where(Map.building_id == building_id)

    # Sắp xếp: Map Campus (null building) lên đầu, sau đó theo ID hoặc tên
    statement = statement.order_by(Map.building_id.nullsfirst(), Map.floor_level)

    maps = session.exec(statement).all()
    return maps


# =========================================================================
# 3. GET SINGLE MAP
# =========================================================================
@router.get("/{map_id}", response_model=Map)
def get_map(map_id: int, session: Session = Depends(get_session)):
    m = session.get(Map, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")
    return m


# =========================================================================
# 4. DELETE MAP (Xóa cả file ảnh)
# =========================================================================
@router.delete("/{map_id}")
def delete_map(map_id: int, session: Session = Depends(get_session)):
    m = session.get(Map, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    # Xử lý xóa file ảnh vật lý
    if m.image_url:
        full_path = os.path.join(DATA_DIR, m.image_url)
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except Exception as e:
                print(f"Warning: Không thể xóa file ảnh {full_path}: {e}")

    # Trước khi xóa map, ta cần xóa các Node và Edge thuộc về map này
    # Nếu không, DB sẽ báo lỗi NotNullViolation cho cột map_id của Node
    from sqlmodel import delete as sql_delete
    from backend.models.entities import Alias

    # 1. Xóa Edges nối tới/từ các node của map này
    # Lấy danh sách ID của các node thuộc map này
    node_ids_stmt = select(Node.id).where(Node.map_id == map_id)
    node_ids = session.exec(node_ids_stmt).all()

    if node_ids:
        # Xóa Aliases của các node này
        session.exec(sql_delete(Alias).where(Alias.node_id.in_(node_ids)))
        
        # Xóa Edges nối tới hoặc từ các node này
        session.exec(sql_delete(Edge).where((Edge.start_node_id.in_(node_ids)) | (Edge.end_node_id.in_(node_ids))))
        
        # Xóa Nodes
        session.exec(sql_delete(Node).where(Node.map_id == map_id))

    # Xóa Map
    session.delete(m)
    session.commit()
    return {"message": "Đã xóa map và toàn bộ dữ liệu liên quan thành công", "id": map_id}
