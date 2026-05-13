from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, Column, JSON
from sqlalchemy import MetaData

metadata = MetaData(schema="wayfinder")


class Building(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_building"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    real_image_url: Optional[str] = None

    maps: List["Map"] = Relationship(back_populates="building")


class Map(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_map"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    image_url: str
    floor_level: Optional[int] = Field(default=None)
    scale_ratio: float = Field(default=1.0)

    building_id: Optional[int] = Field(
        default=None, foreign_key="wayfinder_building.id"
    )
    building: Optional[Building] = Relationship(back_populates="maps")

    nodes: List["Node"] = Relationship(
        back_populates="map", sa_relationship_kwargs={"foreign_keys": "Node.map_id"}
    )


class Node(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_node"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    x: float
    y: float
    description: Optional[str] = None
    real_image_url: Optional[str] = None
    type: str = Field(default="path")

    map_id: int = Field(foreign_key="wayfinder_map.id", index=True)
    map: Map = Relationship(
        back_populates="nodes", sa_relationship_kwargs={"foreign_keys": "Node.map_id"}
    )

    building_id: Optional[int] = Field(
        default=None, foreign_key="wayfinder_building.id"
    )
    building: Optional[Building] = Relationship()

    edges_from: List["Edge"] = Relationship(
        back_populates="start_node",
        sa_relationship_kwargs={"foreign_keys": "Edge.start_node_id"},
    )
    edges_to: List["Edge"] = Relationship(
        back_populates="end_node",
        sa_relationship_kwargs={"foreign_keys": "Edge.end_node_id"},
    )

    aliases: List["Alias"] = Relationship(back_populates="node")


class Alias(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_alias"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    node_id: int = Field(foreign_key="wayfinder_node.id", index=True)
    name: str

    node: Node = Relationship(back_populates="aliases")


from sqlalchemy.dialects.postgresql import JSONB

class Edge(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_edge"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)

    start_node_id: int = Field(foreign_key="wayfinder_node.id")
    end_node_id: int = Field(foreign_key="wayfinder_node.id")

    type: str
    weight: float
    bidirectional: bool = Field(default=True)

    polyline: Optional[List[List[float]]] = Field(default=None, sa_column=Column(JSONB))

    start_node: Node = Relationship(
        back_populates="edges_from",
        sa_relationship_kwargs={"foreign_keys": "Edge.start_node_id"},
    )
    end_node: Node = Relationship(
        back_populates="edges_to",
        sa_relationship_kwargs={"foreign_keys": "Edge.end_node_id"},
    )


class Event(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_event"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location_name: Optional[str] = None

    node_id: Optional[int] = Field(default=None, foreign_key="wayfinder_node.id")
    node: Optional[Node] = Relationship()

    organizer: Optional[str] = None
    category: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: Optional[str] = None


class MissingLocation(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_missing_location"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    building_name: Optional[str] = None
    floor_level: Optional[int] = None
    description: Optional[str] = None

    requested_by: Optional[str] = None

    status: str = Field(default="pending")
    resolved_node_id: Optional[int] = Field(default=None)
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None
    admin_note: Optional[str] = None

    created_at: Optional[str] = None


class MissingRoute(SQLModel, table=True, metadata=metadata):
    __tablename__ = "wayfinder_missing_route"  # type: ignore[assignment]

    id: Optional[int] = Field(default=None, primary_key=True)

    start_node_id: Optional[int] = Field(default=None)
    start_name: str
    start_building: Optional[str] = None
    start_floor: Optional[int] = None

    end_node_id: Optional[int] = Field(default=None)
    end_name: str
    end_building: Optional[str] = None
    end_floor: Optional[int] = None

    reason: Optional[str] = Field(default=None)

    status: str = Field(default="pending")
    resolved_note: Optional[str] = None
    resolved_at: Optional[str] = None
    resolved_by: Optional[str] = None

    reported_by: Optional[str] = None

    created_at: Optional[str] = None
