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


@router.get("/search", response_model=List[AliasSearchOut])
def search_alias(
    q: str = Query(..., description="Tên cần tìm"),
    limit: int = 20,
    session: Session = Depends(get_session),
):
    if not q or not q.strip():
        return []

    norm_q = q.strip().lower()
    # Tách query thành các từ để tìm kiếm linh hoạt hơn
    query_words = [w.strip() for w in norm_q.split() if len(w) >= 1]

    if not query_words:
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
            "building_name": building_dict.get(m.building_id)
            if m.building_id
            else None,
        }
        for m in all_maps
    }

    # Find buildings that match the query
    matching_building_ids = set()
    for b_id, b_name in building_dict.items():
        if not b_name: continue
        b_name_lower = b_name.lower()
        
        # 1. So khớp trực tiếp (substring)
        if norm_q in b_name_lower or b_name_lower in norm_q:
            matching_building_ids.add(b_id)
            continue
            
        # 2. So khớp từng từ (Ví dụ "B" khớp với "B4", "Tòa" khớp với "Tòa A")
        # Nhưng tránh khớp các từ quá phổ biến như "Tòa"
        for w in query_words:
            if w in ["tòa", "building", "floor", "tầng"]: continue
            if w == b_name_lower or w in b_name_lower:
                matching_building_ids.add(b_id)
                break
        
        # 3. Fuzzy match cho building
        if b_id not in matching_building_ids and fuzz.token_set_ratio(norm_q, b_name_lower) > 80:
            matching_building_ids.add(b_id)

    # Lấy tất cả aliases và nodes
    all_aliases = session.exec(select(Alias)).all()
    all_nodes = session.exec(select(Node)).all()

    # Tạo dict node info
    node_dict = {n.id: n for n in all_nodes}
    # 1. Thu thập tất cả định danh cho từng node (name + aliases)
    node_names_map = {}
    for n in all_nodes:
        if n.name and n.name.lower() != "new node":
            node_names_map[n.id] = [n.name]
        else:
            node_names_map[n.id] = []

    for a in all_aliases:
        if a.node_id in node_names_map:
            node_names_map[a.node_id].append(a.name)

    out = []
    seen_node_ids = set()

    for node_id, names in node_names_map.items():
        node = node_dict.get(node_id)
        if not node: continue

        map_data = map_info.get(node.map_id, {})
        building_name = map_data.get("building_name") or ""
        building_lower = building_name.lower()
        is_building_match = node.building_id in matching_building_ids

        best_node_score = 0
        best_name_used = node.name

        for name in names:
            name_lower = name.lower()
            combined_name = f"{name_lower} {building_lower}".strip()

            score_name = fuzz.token_set_ratio(norm_q, name_lower)
            score_combined = fuzz.token_set_ratio(norm_q, combined_name)
            current_score = max(score_name, score_combined)

            # Nếu khớp hoàn toàn (không tính hoa thường, khoảng trắng)
            if norm_q == name_lower or norm_q == combined_name:
                current_score = 100.0
            # Bonus nếu khớp một phần cụ thể (ví dụ "Phòng 101" trong "Phòng 101 B4")
            elif norm_q in name_lower or norm_q in combined_name:
                current_score += 10

            if current_score > best_node_score:
                best_node_score = current_score
                best_name_used = name

        # Tính toán final score cho node này
        words_matched = sum(1 for w in query_words if w in f"{best_name_used} {building_name}".lower())
        
        if words_matched > 0 or best_node_score > 40 or is_building_match:
            final_score = max(words_matched * 25, best_node_score)
            
            if building_lower and building_lower in norm_q:
                final_score += 15

            if is_building_match:
                final_score = max(final_score, 85.0)
                final_score += 10

            # Lấy alias_id nếu cái tên được chọn là một alias
            alias_id = 0
            for a in all_aliases:
                if a.node_id == node_id and a.name == best_name_used:
                    alias_id = a.id
                    break

            out.append(
                AliasSearchOut(
                    node_id=node_id,
                    alias_id=alias_id,
                    name=best_name_used,
                    score=float(final_score),
                    map_id=node.map_id,
                    floor=map_data.get("floor"),
                    building_id=map_data.get("building_id"),
                    building_name=building_name,
                    node_type=node.type,
                )
            )

    # Sort theo điểm giảm dần, lấy top N
    out.sort(key=lambda x: x.score, reverse=True)
    return out[:limit]
