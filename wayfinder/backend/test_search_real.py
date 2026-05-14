from sqlmodel import Session
from backend.services.search import find_best_nodes
from backend.core.db import engine
import os
import sys

# Force UTF-8 encoding for Windows terminal
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Set database path
db_path = "d:/Code/DATN/DATN-Chatbot/wayfinder/backend/wayfinding.db"

def test_search():
    with Session(engine) as session:
        query = "Cổng 1"
        print(f"Searching for: {query}")
        results = find_best_nodes(session, query, limit=5)
        for i, res in enumerate(results):
            print(f"{i+1}. Node ID: {res.node.id}, Name: {res.name}, Score: {res.score:.2f}, Type: {res.node.type}")

if __name__ == "__main__":
    test_search()
