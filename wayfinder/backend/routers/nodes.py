from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session, select
from backend.core.db import engine
from backend.models.entities import Node, Map, Alias, Edge
from backend.services.node_service import NodeService

router = APIRouter()


def get_session():
    with Session(engine) as session:
        yield session


class NodeIn(BaseModel):
    map_id: int
    x: float
    y: float
    is_landmark: bool = False
    floor: int
    meta: Optional[str] = None  # JSON string nếu muốn


class NodeOut(BaseModel):
    id: int
    map_id: int
    x: float
    y: float
    is_landmark: bool
    floor: int
    meta: Optional[str]


@router.post("", response_model=NodeOut)
def create_node(payload: NodeIn, session: Session = Depends(get_session)):
    m = session.get(Map, payload.map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")
    n = Node(**payload.dict())
    session.add(n)
    session.commit()
    session.refresh(n)
    return NodeOut(**n.dict())


@router.get("", response_model=List[NodeOut])
def list_nodes(
    map_id: int, floor: Optional[int] = None, session: Session = Depends(get_session)
):
    stmt = select(Node).where(Node.map_id == map_id)
    if floor is not None:
        stmt = stmt.where(Node.floor == floor)
    return session.exec(stmt).all()


@router.get("/{node_id}", response_model=NodeOut)
def get_node(node_id: int, session: Session = Depends(get_session)):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")
    return NodeOut(**n.dict())


class NodeUpdate(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    is_landmark: Optional[bool] = None
    floor: Optional[str] = None
    meta: Optional[str] = None


@router.patch("/{node_id}", response_model=NodeOut)
def update_node(
    node_id: int, payload: NodeUpdate, session: Session = Depends(get_session)
):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(n, k, v)
    session.add(n)
    session.commit()
    session.refresh(n)
    return NodeOut(**n.dict())


@router.delete("/{node_id}", response_model=dict)
def delete_node(node_id: int, session: Session = Depends(get_session)):
    n = session.get(Node, node_id)
    if not n:
        raise HTTPException(status_code=404, detail="Node không tồn tại.")

    # Xoá alias liên quan
    for a in session.exec(select(Alias).where(Alias.node_id == node_id)).all():
        session.delete(a)

    # Xoá edge có start/end là node này
    for e in session.exec(
        select(Edge).where(
            (Edge.start_node_id == node_id) | (Edge.end_node_id == node_id)
        )
    ).all():
        session.delete(e)

    # Cuối cùng xoá node
    session.delete(n)
    session.commit()
    return {"ok": True}


# New optimized endpoints for UI editor and user components


@router.get("/map/{map_id}/complete", response_model=dict)
def get_map_complete_data(
    map_id: int, floor: Optional[int] = None, session: Session = Depends(get_session)
):
    """
    Get complete map data (nodes, edges, aliases) in single request
    Use this for UI editor and user components to reduce API calls
    """
    try:
        return NodeService.get_map_complete_data(session, map_id, floor)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/map/{map_id}/with-aliases", response_model=List[dict])
def get_nodes_with_aliases(
    map_id: int, floor: Optional[int] = None, session: Session = Depends(get_session)
):
    """
    Get nodes with their aliases in single request
    """
    return NodeService.get_nodes_with_aliases(session, map_id, floor)


@router.get("/search", response_model=List[dict])
def search_nodes(
    map_id: int,
    q: str,
    floor: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """
    Search nodes by alias names with optimized query
    """
    if not q or len(q.strip()) < 2:
        return []

    return NodeService.search_nodes_by_alias(session, map_id, q.strip(), floor)
