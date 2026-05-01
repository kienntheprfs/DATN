from wayfinder.backend.core.db import engine
from sqlmodel import Session, select
from wayfinder.backend.models.entities import Map
import sys

# Set encoding for output
sys.stdout.reconfigure(encoding='utf-8')

with Session(engine) as s:
    maps = s.exec(select(Map)).all()
    for m in maps:
        print(f"MAP: {m.name}, ID: {m.id}, FLOOR: {m.floor_level}, BUILDING: {m.building_id}")
