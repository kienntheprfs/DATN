from wayfinder.backend.core.db import engine
from sqlmodel import Session, select
from wayfinder.backend.models.entities import Node
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    nodes = s.exec(select(Node).where(Node.map_id == 9)).all()
    for n in nodes:
        print(f"NODE IN MAP 9: {n.name}")
