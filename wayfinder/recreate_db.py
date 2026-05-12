import os
import sys
from pathlib import Path

# Add the project root to sys.path
root_dir = Path(__file__).resolve().parents[1]
sys.path.append(str(root_dir))

from sqlmodel import text
from backend.core.db import engine, DB_SCHEMA, init_db

def recreate_db():
    print(f"Bắt đầu quá trình xóa và tạo lại schema '{DB_SCHEMA}'...")
    
    with engine.connect() as conn:
        # Drop schema wayfinder with cascade to remove everything in it
        print(f"Đang xóa schema '{DB_SCHEMA}' (CASCADE)...")
        conn.execute(text(f"DROP SCHEMA IF EXISTS {DB_SCHEMA} CASCADE"))
        conn.commit()
        
        # Create schema wayfinder again
        print(f"Đang tạo lại schema '{DB_SCHEMA}'...")
        conn.execute(text(f"CREATE SCHEMA {DB_SCHEMA}"))
        conn.commit()
        
    print("Đang khởi tạo lại các bảng...")
    init_db()
    
    print(f"Hoàn thành! Schema '{DB_SCHEMA}' và các bảng đã được tạo lại sạch sẽ.")

if __name__ == "__main__":
    recreate_db()
