from backend.core.db import engine
from sqlmodel import Session, select
from backend.models.entities import Alias, Node, Map, Building
import sys

# Set encoding for output
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    search_term = "Cổng 1"
    print(f"Searching for aliases containing '{search_term}'...")
    
    stmt = (
        select(Alias, Node, Map, Building)
        .join(Node, Alias.node_id == Node.id)
        .join(Map, Node.map_id == Map.id)
        .outerjoin(Building, Map.building_id == Building.id)
    )
    
    results = s.exec(stmt).all()
    
    found = False
    for alias, node, map_obj, building in results:
        if search_term.lower() in alias.name.lower():
            found = True
            b_name = building.name if building else "N/A"
            print(f"Alias: {alias.name} | Node ID: {node.id} | Node Name: {node.name} | Map: {map_obj.name} | Building: {b_name}")
            
    if not found:
        print("No matches found in aliases.")

    print("\nSearching for nodes containing 'Cổng 1'...")
    nodes = s.exec(select(Node)).all()
    for n in nodes:
        if n.name and search_term.lower() in n.name.lower():
            print(f"Node Name: {n.name} | ID: {n.id}")
