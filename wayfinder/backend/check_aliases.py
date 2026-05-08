from backend.core.db import engine
from sqlmodel import Session, select
from backend.models.entities import Alias, Node
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    node_name = "Phòng 201"
    node = s.exec(select(Node).where(Node.name == node_name)).first()
    if node:
        aliases = s.exec(select(Alias).where(Alias.node_id == node.id)).all()
        print(f"Aliases for {node_name} (ID: {node.id}):")
        for a in aliases:
            print(f"  - {a.name}")
    else:
        print(f"Node {node_name} not found.")

    print("\nAll Aliases containing '201' or '202':")
    all_aliases = s.exec(select(Alias)).all()
    for a in all_aliases:
        if "201" in a.name or "202" in a.name:
            print(f"  - {a.name} (Node ID: {a.node_id})")
