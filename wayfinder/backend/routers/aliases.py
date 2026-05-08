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
    query_words = [w.strip() for w in norm_q.split() if len(w) >= 2]

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

    # Lấy tất cả aliases và nodes
    all_aliases = session.exec(select(Alias)).all()
    all_nodes = session.exec(select(Node)).all()

    # Tạo dict node info
    node_dict = {n.id: n for n in all_nodes}

    out = []
    seen_node_ids = set()

    # Tìm kiếm linh hoạt: so khớp từng từ trong query với tên + tòa nhà
    for alias in all_aliases:
        node = node_dict.get(alias.node_id)
        if not node:
            continue
            
        map_data = map_info.get(node.map_id, {})
        building_name = map_data.get("building_name") or ""
        
        name_lower = alias.name.lower()
        building_lower = building_name.lower()
        combined_name = f"{name_lower} {building_lower}".strip()

        # Fuzzy match với toàn bộ query
        score_name = fuzz.token_set_ratio(norm_q, name_lower)
        score_combined = fuzz.token_set_ratio(norm_q, combined_name)
        full_score = max(score_name, score_combined)

        # Đếm số từ khớp
        words_matched = sum(1 for w in query_words if w in combined_name)

        # Nếu có từ nào khớp hoặc fuzzy score đủ cao
        if words_matched > 0 or full_score > 40:
            if alias.node_id not in seen_node_ids:
                # Ưu tiên kết quả có nhiều từ khớp hơn
                if words_matched >= 3:
                    final_score = max(words_matched * 25, full_score + 30)
                else:
                    final_score = full_score

                # Bonus for building name match if query contains it
                if building_lower and building_lower in norm_q:
                    final_score += 15

                out.append(
                    AliasSearchOut(
                        node_id=alias.node_id,
                        alias_id=alias.id,
                        name=alias.name,
                        score=float(final_score),
                        map_id=node.map_id,
                        floor=map_data.get("floor"),
                        building_id=map_data.get("building_id"),
                        building_name=building_name,
                        node_type=node.type,
                    )
                )
                seen_node_ids.add(alias.node_id)

    # Tìm trong Node table (cho các node không có alias)
    for n in all_nodes:
        if n.id in seen_node_ids:
            continue

        map_data = map_info.get(n.map_id, {})
        building_name = map_data.get("building_name") or ""
        
        name_lower = n.name.lower()
        building_lower = building_name.lower()
        combined_name = f"{name_lower} {building_lower}".strip()
        
        full_score = max(fuzz.token_set_ratio(norm_q, name_lower), fuzz.token_set_ratio(norm_q, combined_name))
        words_matched = sum(1 for w in query_words if w in combined_name)

        if words_matched > 0 or full_score > 40:
            final_score = max(words_matched * 25, full_score)
            
            if building_lower and building_lower in norm_q:
                final_score += 15

            out.append(
                AliasSearchOut(
                    node_id=n.id,
                    alias_id=0,
                    name=n.name,
                    score=float(final_score),
                    map_id=n.map_id,
                    floor=map_data.get("floor"),
                    building_id=map_data.get("building_id"),
                    building_name=building_name,
                    node_type=n.type,
                )
            )

    # Sort theo điểm giảm dần, lấy top N
    out.sort(key=lambda x: x.score, reverse=True)
    return out[:limit]
