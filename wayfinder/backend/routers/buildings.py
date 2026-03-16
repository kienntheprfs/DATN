from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from backend.models.entities import Building  # Import model Building gốc của bạn
from typing import Optional, List
from backend.core.db import engine
from sqlmodel import SQLModel

# Base class chứa các field chung
class BuildingBase(SQLModel):
    name: str
    description: Optional[str] = None

# Model dùng để Tạo mới (Client gửi lên)
class BuildingCreate(BuildingBase):
    pass

# Model dùng để Update (Client gửi lên - tất cả đều optional)
class BuildingUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None

# Model dùng để Trả về (Response) - Có thêm ID
class BuildingRead(BuildingBase):
    id: int

router = APIRouter()

def get_session():
    with Session(engine) as session:
        yield session


# ==========================================================
# 1. CREATE - Tạo tòa nhà mới
# ==========================================================
@router.post("", response_model=BuildingRead)
def create_building(
    building_in: BuildingCreate, 
    session: Session = Depends(get_session)
):
    # Convert từ Schema sang Model Database
    building = Building.from_orm(building_in)
    
    session.add(building)
    session.commit()
    session.refresh(building)
    return building

# ==========================================================
# 2. READ ALL - Lấy danh sách tòa nhà
# ==========================================================
@router.get("", response_model=List[BuildingRead])
def read_buildings(
    offset: int = 0,
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session)
):
    buildings = session.exec(select(Building).offset(offset).limit(limit)).all()
    return buildings

# ==========================================================
# 3. READ ONE - Lấy chi tiết 1 tòa nhà
# ==========================================================
@router.get("/{building_id}", response_model=BuildingRead)
def read_building(
    building_id: int, 
    session: Session = Depends(get_session)
):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building

# ==========================================================
# 4. UPDATE - Cập nhật thông tin tòa nhà
# ==========================================================
@router.patch("/{building_id}", response_model=BuildingRead)
def update_building(
    building_id: int, 
    building_in: BuildingUpdate, 
    session: Session = Depends(get_session)
):
    # 1. Tìm building trong DB
    db_building = session.get(Building, building_id)
    if not db_building:
        raise HTTPException(status_code=404, detail="Building not found")

    # 2. Lấy data client gửi lên (bỏ qua các field null)
    building_data = building_in.dict(exclude_unset=True)

    # 3. Update từng field
    for key, value in building_data.items():
        setattr(db_building, key, value)

    # 4. Lưu lại
    session.add(db_building)
    session.commit()
    session.refresh(db_building)
    return db_building

# ==========================================================
# 5. DELETE - Xóa tòa nhà
# ==========================================================
@router.delete("/{building_id}")
def delete_building(
    building_id: int, 
    session: Session = Depends(get_session)
):
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    # Lưu ý: Vì trong Map, building_id là Optional, 
    # nên khi xóa Building, các Map thuộc building này sẽ có building_id = NULL
    session.delete(building)
    session.commit()
    
    return {"ok": True, "message": "Building deleted successfully"}