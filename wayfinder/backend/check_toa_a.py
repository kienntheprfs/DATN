from wayfinder.backend.core.db import engine
from sqlmodel import Session, select
from wayfinder.backend.models.entities import Node
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    nodes = s.exec(select(Node).where(Node.name.like("Tòa A%"))).all()
    for n in nodes:
        print(f"NODE: {n.name}, MAP_ID: {n.map_id}")
