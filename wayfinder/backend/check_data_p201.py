from backend.core.db import engine
from sqlmodel import Session, select
from backend.models.entities import Alias, Node, Map
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    nodes = s.exec(select(Node).where(Node.name == "Phòng 201")).all()
    for n in nodes:
        m = s.get(Map, n.map_id)
        print(f"NODE: {n.name}, ID: {n.id}, MAP_ID: {n.map_id}, FLOOR: {m.floor_level if m else 'N/A'}")
