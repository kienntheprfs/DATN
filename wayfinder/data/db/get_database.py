import sqlite3
import asyncio
from supabase import create_client, Client
from urllib.parse import urlparse  # Import thư viện để phân tích cú pháp URL

# --- CẤU HÌNH KẾT NỐI ---
# Chuỗi kết nối PostgreSQL của bạn (Chỉ dùng để trích xuất Host)
POSTGRES_CONNECTION_STRING = "postgresql://postgres:lethanhbaotran@db.jbllygkoaglldcgkkqph.supabase.co:5432/postgres"

# THAY THẾ KEY NÀY: Anon Public Key (BẮT BUỘC, không có trong chuỗi trên)
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibGx5Z2tvYWdsbGRjZ2trcXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MDc2MTUsImV4cCI6MjA3NDM4MzYxNX0.x2GL39Hl-qidzXg4ACEts5B8-sk0HuvfxEmySp4ChR4"

# Tên file database SQLite
SQLITE_DB_NAME = "wayfinder.db"

# --- PHÂN TÍCH CÚ PHÁP VÀ KHỞI TẠO CLIENT ---
try:
    # 1. Phân tích chuỗi kết nối PostgreSQL để lấy host
    parsed_url = urlparse(POSTGRES_CONNECTION_STRING)
    DB_HOST = parsed_url.hostname

    # 2. Suy luận Supabase API URL từ DB Host (Loại bỏ 'db.' ở đầu)
    if DB_HOST and DB_HOST.startswith("db."):
        API_HOST = DB_HOST[3:]
    else:
        API_HOST = DB_HOST

    SUPABASE_URL = f"https://{API_HOST}"

    if SUPABASE_ANON_KEY == "PLEASE_REPLACE_WITH_YOUR_ANON_PUBLIC_KEY":
        raise ValueError("LỖI: Vui lòng thay thế SUPABASE_ANON_KEY bằng khóa Anon Public Key thực tế từ Supabase Settings > API.")

    print(f"URL API được trích xuất: {SUPABASE_URL}")

except Exception as e:
    # Bắt các lỗi phân tích cú pháp hoặc thiếu key
    raise RuntimeError(f"LỖI CẤU HÌNH KẾT NỐI: {e}")

# Khởi tạo client Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


# -----------------------------------------------------------
# 1. Định nghĩa Schema SQLite (Hàm tạo bảng) - GIỮ NGUYÊN
# -----------------------------------------------------------


def create_sqlite_tables(conn):
    """Tạo tất cả các bảng trong database SQLite."""
    cursor = conn.cursor()
    print("--- 1. Bắt đầu tạo các bảng SQLite... ---")

    # Bảng map
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_path TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    """
    )

    # Bảng node
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS node (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      is_landmark BOOLEAN NOT NULL,
      floor INTEGER NOT NULL,
      meta TEXT,
      FOREIGN KEY (map_id) REFERENCES map(id) ON DELETE CASCADE
    );
    """
    )

    # Bảng alias
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS alias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      norm_name TEXT NOT NULL,
      lang TEXT NOT NULL,
      weight REAL NOT NULL,
      generated BOOLEAN NOT NULL,
      FOREIGN KEY (node_id) REFERENCES node(id) ON DELETE CASCADE
    );
    """
    )

    # Bảng edge
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS edge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id INTEGER NOT NULL,
      start_node_id INTEGER NOT NULL,
      end_node_id INTEGER NOT NULL,
      floor INTEGER NOT NULL,
      polyline TEXT NOT NULL,
      weight REAL NOT NULL,
      bidirectional BOOLEAN NOT NULL,
      meta TEXT,
      FOREIGN KEY (map_id) REFERENCES map(id) ON DELETE CASCADE,
      FOREIGN KEY (start_node_id) REFERENCES node(id) ON DELETE CASCADE,
      FOREIGN KEY (end_node_id) REFERENCES node(id) ON DELETE CASCADE
    );
    """
    )
    conn.commit()
    print("--- 1. Tạo bảng SQLite hoàn tất. ---")


# -----------------------------------------------------------
# 2. Lấy dữ liệu từ Supabase và Chèn vào SQLite - GIỮ NGUYÊN
# -----------------------------------------------------------


async def fetch_and_insert_data(conn, table_name, columns):
    """Lấy dữ liệu từ một bảng Supabase và chèn vào SQLite."""
    print(f"\n--- 2. Bắt đầu xử lý bảng '{table_name}'... ---")

    # Lấy tất cả dữ liệu từ Supabase
    try:
        # BỎ TỪ KHÓA 'await' Ở ĐÂY để giải quyết lỗi
        res = supabase.from_(table_name).select("*").execute()
        data = res.data
    except Exception as e:
        print(f"LỖI khi lấy dữ liệu từ Supabase cho bảng {table_name}: {e}")
        # print(e) # In lỗi chi tiết hơn nếu cần
        return

    if not data:
        print(f"Bảng '{table_name}' không có dữ liệu. Bỏ qua.")
        return

    # Chuẩn bị câu lệnh INSERT cho SQLite
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["?" for _ in columns])
    insert_sql = f"INSERT INTO {table_name} ({cols_str}) VALUES ({placeholders})"

    cursor = conn.cursor()
    rows_to_insert = []

    for row in data:
        values = []
        for col in columns:
            value = row.get(col)
            # Xử lý Boolean (True/False -> 1/0)
            if isinstance(value, bool):
                value = 1 if value else 0
            values.append(value)

        rows_to_insert.append(tuple(values))

    # Chèn nhiều hàng cùng lúc (executemany)
    try:
        cursor.executemany(insert_sql, rows_to_insert)
        conn.commit()
        print(f"--> Thành công: Đã chèn {len(rows_to_insert)} hàng vào bảng {table_name}.")
    except Exception as e:
        print(f"LỖI khi chèn dữ liệu vào SQLite cho bảng {table_name}: {e}")
        conn.rollback()


# -----------------------------------------------------------
# 3. Chạy Toàn Bộ Quy Trình - GIỮ NGUYÊN
# -----------------------------------------------------------


async def main():
    # Định nghĩa thứ tự cột VÀ bảng.
    tables_to_migrate = [
        ("map", ["id", "name", "image_path", "width", "height", "created_at"]),
        ("node", ["id", "map_id", "x", "y", "is_landmark", "floor", "meta"]),
        ("alias", ["id", "node_id", "name", "norm_name", "lang", "weight", "generated"]),
        ("edge", ["id", "map_id", "start_node_id", "end_node_id", "floor", "polyline", "weight", "bidirectional", "meta"]),
    ]

    # 1. Kết nối/Tạo file SQLite DB
    conn = sqlite3.connect(SQLITE_DB_NAME)

    # 2. Tạo các bảng
    create_sqlite_tables(conn)

    # 3. Chạy từng bảng
    for table_name, columns in tables_to_migrate:
        await fetch_and_insert_data(conn, table_name, columns)

    conn.close()
    print("\n\n*** QUÁ TRÌNH DI CHUYỂN DỮ LIỆU HOÀN TẤT. ***")


if __name__ == "__main__":
    asyncio.run(main())
