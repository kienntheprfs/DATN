import json
from backend.core.db import engine
from sqlmodel import Session, select
from backend.models.entities import Alias, Node
import sys

# Set encoding for output to file
with Session(engine) as s:
    aliases = s.exec(select(Alias, Node).join(Node, Alias.node_id == Node.id)).all()
    data = []
    for a, n in aliases:
        data.append({
            "alias_name": a.name,
            "node_id": n.id,
            "node_name": n.name
        })
    
    with open("all_aliases.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
print("Done")
