from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column, JSON


# ==========================================================
# 1. BUILDING MODEL
# ==========================================================
class Building(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None

    # Quan hệ 1-N: Một tòa nhà có nhiều Map (các tầng)
    maps: List["Map"] = Relationship(back_populates="building")


# ==========================================================
# 2. MAP MODEL
# ==========================================================
class Map(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    image_url: str  # Đổi tên từ image_link cho khớp schema
    floor_level: Optional[int] = Field(
        default=None
    )  # Tầng mấy (Null nếu là map campus)
    scale_ratio: float = Field(default=1.0)  # Tỉ lệ px/mét

    # Quan hệ N-1: Map thuộc về Building (Optional vì Map Campus không có Building)
    building_id: Optional[int] = Field(default=None, foreign_key="building.id")
    building: Optional[Building] = Relationship(back_populates="maps")

    # Quan hệ 1-N: Một Map chứa nhiều Node
    nodes: List["Node"] = Relationship(
        back_populates="map", sa_relationship_kwargs={"foreign_keys": "Node.map_id"}
    )


# ==========================================================
# 3. NODE MODEL
# ==========================================================
class Node(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    x: float
    y: float
    type: str = Field(default="path")  # 'room', 'path', 'entrance', 'stairs'

    # --- Quan hệ 1: Node NẰM TRÊN Map nào (Quan hệ "Has") ---
    map_id: int = Field(foreign_key="map.id", index=True)
    map: Map = Relationship(
        back_populates="nodes", sa_relationship_kwargs={"foreign_keys": "Node.map_id"}
    )

    # --- Quan hệ 2: Node LIÊN KẾT đến Building (ví dụ: cổng vào) ---
    building_id: Optional[int] = Field(default=None, foreign_key="building.id")
    building: Optional[Building] = Relationship()

    # --- Quan hệ 3: Node DẪN TỚI Node khác (Link giữa các tầng) ---
    # Node có thể link đến nhiều node khác (các tầng khác nhau)
    linked_node_ids: Optional[List[int]] = Field(default=None, sa_column=Column(JSON))

    # Node trong building có thể link đến node trên campus map
    linked_campus_node_id: Optional[int] = Field(default=None, foreign_key="node.id")

    # --- Quan hệ Edge (Start/End) ---
    edges_from: List["Edge"] = Relationship(
        back_populates="start_node",
        sa_relationship_kwargs={"foreign_keys": "Edge.start_node_id"},
    )
    edges_to: List["Edge"] = Relationship(
        back_populates="end_node",
        sa_relationship_kwargs={"foreign_keys": "Edge.end_node_id"},
    )

    # Alias (Tên phụ)
    aliases: List["Alias"] = Relationship(back_populates="node")


# ==========================================================
# 4. ALIAS MODEL (Giữ nguyên)
# ==========================================================
class Alias(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    node_id: int = Field(foreign_key="node.id", index=True)
    name: str

    node: Node = Relationship(back_populates="aliases")


# ==========================================================
# 5. EDGE MODEL
# ==========================================================
class Edge(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    start_node_id: int = Field(foreign_key="node.id")
    end_node_id: int = Field(foreign_key="node.id")

    type: str  # 'walk', 'stairs', 'elevator'
    weight: float  # Khoảng cách hoặc thời gian
    bidirectional: bool = Field(default=True)  # Đi 2 chiều hay 1 chiều

    # Lưu tọa độ vẽ đường gấp khúc (JSON)
    polyline: Optional[List[dict]] = Field(default=None, sa_column=Column(JSON))

    # Quan hệ ngược
    start_node: Node = Relationship(
        back_populates="edges_from",
        sa_relationship_kwargs={"foreign_keys": "Edge.start_node_id"},
    )
    end_node: Node = Relationship(
        back_populates="edges_to",
        sa_relationship_kwargs={"foreign_keys": "Edge.end_node_id"},
    )


# ==========================================================
# 6. EVENT MODEL
# ==========================================================
class Event(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    start_date: str  # ISO format: "2024-12-25"
    end_date: Optional[str] = None
    start_time: Optional[str] = None  # "09:00"
    end_time: Optional[str] = None
    location_name: Optional[str] = None  # Tên địa điểm hiển thị

    # Link to node for wayfinding
    node_id: Optional[int] = Field(default=None, foreign_key="node.id")
    node: Optional[Node] = Relationship()

    organizer: Optional[str] = None
    category: Optional[str] = None  # seminar, workshop, conference, meeting, etc.
    is_active: bool = Field(default=True)
    created_at: Optional[str] = None
