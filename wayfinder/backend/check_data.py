from wayfinder.backend.core.db import engine
from sqlmodel import Session, select
from wayfinder.backend.models.entities import Alias, Node
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    aliases = s.exec(select(Alias)).all()
    nodes = s.exec(select(Node)).all()
    print(f"COUNT ALIASES: {len(aliases)}")
    print(f"COUNT NODES: {len(nodes)}")
    for a in aliases:
        print(f"ALIAS: {a.name}")
    for n in nodes:
        print(f"NODE: {n.name}")
