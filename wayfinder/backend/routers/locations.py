from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, or_
from rapidfuzz import process, fuzz
from unidecode import unidecode
from backend.core.db import engine, get_session
from backend.models.entities import Node, Building, Alias

router = APIRouter()


@router.get("/landmarks")
def get_landmarks(session: Session = Depends(get_session)):
    """Lấy danh sách các tòa nhà và node có ảnh thực tế (landmarks)"""
    buildings = session.exec(select(Building).where(Building.real_image_url != None)).all()
    nodes = session.exec(select(Node).where(Node.real_image_url != None)).all()
    
    result = []
    for b in buildings:
        result.append({
            "id": b.id,
            "type": "building",
            "name": b.name,
            "description": b.description,
            "real_image_url": b.real_image_url
        })
    
    for n in nodes:
        result.append({
            "id": n.id,
            "type": "node",
            "name": n.name,
            "description": n.description,
            "real_image_url": n.real_image_url,
            "building_id": n.building_id
        })
        
    return result

@router.get("/guess")
def guess_location(
    query: str, 
    limit: int = Query(default=5, le=10),
    session: Session = Depends(get_session)
):
    """Gợi ý vị trí dựa trên mô tả hoặc tên (Sử dụng fuzzy matching)"""
    # 1. Lấy toàn bộ dữ liệu cần search
    buildings = session.exec(select(Building)).all()
    nodes = session.exec(select(Node)).all()
    aliases = session.exec(select(Alias)).all()
    
    search_pool = []
    
    # Chuẩn bị pool dữ liệu
    for b in buildings:
        search_pool.append({
            "id": b.id,
            "type": "building",
            "name": b.name,
            "search_text": f"{b.name} {b.description or ''}"
        })
        
    for n in nodes:
        # Lấy aliases của node này
        node_aliases = [a.name for a in aliases if a.node_id == n.id]
        alias_text = " ".join(node_aliases)
        search_pool.append({
            "id": n.id,
            "type": "node",
            "name": n.name,
            "search_text": f"{n.name} {n.description or ''} {alias_text}"
        })
    
    # 2. Fuzzy matching
    # Chuẩn hóa query
    normalized_query = unidecode(query.lower())
    
    def get_search_text(item):
        return unidecode(item["search_text"].lower())
    
    # Thực hiện search trên pool
    choices = [get_search_text(item) for item in search_pool]
    results = process.extract(
        normalized_query, 
        choices, 
        scorer=fuzz.partial_ratio, 
        limit=limit
    )
    
    final_results = []
    for match_text, score, idx in results:
        if score > 60: # Threshold tối thiểu
            item = search_pool[idx]
            # Nếu là node, lấy thêm thông tin map/building nếu cần
            if item["type"] == "node":
                node = session.get(Node, item["id"])
                final_results.append({
                    "id": node.id,
                    "type": "node",
                    "name": node.name,
                    "description": node.description,
                    "real_image_url": node.real_image_url,
                    "score": score
                })
            else:
                building = session.get(Building, item["id"])
                final_results.append({
                    "id": building.id,
                    "type": "building",
                    "name": building.name,
                    "description": building.description,
                    "real_image_url": building.real_image_url,
                    "score": score
                })
                
    return final_results
