
import os
from sqlalchemy import create_engine, text

DATABASE_URL = "sqlite:///wayfinding.db"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check map 8 and 9 building
    res = conn.execute(text("SELECT id, name, building_id, floor_level FROM wayfinder_map WHERE id IN (8, 9)"))
    for row in res:
        print(f"Map {row[0]}: {row[1]}, building_id={row[2]}, floor={row[3]}")
    
    # Check floors in that building
    res = conn.execute(text("SELECT building_id, count(*) FROM wayfinder_map GROUP BY building_id"))
    for row in res:
        print(f"Building {row[0]} has {row[1]} floors/maps")
