# Backend API Documentation

Hệ thống backend của Indoor Wayfinder được xây dựng với FastAPI, cung cấp API RESTful cho việc quản lý bản đồ và tìm đường trong nhà.

## 🚀 Overview

- **Framework**: FastAPI
- **Database**: SQLite với SQLModel ORM
- **Graph Processing**: NetworkX cho thuật toán tìm đường
- **NLP Support**: Xử lý ngôn ngữ tự nhiên tiếng Việt cơ bản
- **Search Engine**: RapidFuzz cho tìm kiếm mờ

## 📁 Cấu trúc Backend

```
backend/
├── main.py              # Entry point, FastAPI app configuration
├── init_database.py     # Database initialization script
├── core/                # Core configurations
│   └── db.py           # Database connection and setup
├── models/              # SQLModel entities
│   └── entities.py     # Map, Node, Edge, Alias models
├── routers/             # API endpoints
│   ├── admin.py        # Admin utilities
│   ├── aliases.py      # Location name aliases
│   ├── edges.py        # Path connections
│   ├── maps.py         # Map management
│   ├── nodes.py        # Node management
│   └── routes.py       # Route finding API
├── services/           # Business logic
│   ├── nlp.py          # Natural language processing
│   └── geo.py          # Geometry calculations
└── routers/__init__.py
```

## 🛠️ Dependencies

- **fastapi**: Web framework
- **uvicorn[standard]**: ASGI server
- **sqlmodel**: ORM (SQLAlchemy + Pydantic)
- **sqlalchemy**: Database toolkit
- **networkx**: Graph algorithms
- **rapidfuzz**: Fuzzy string matching
- **Unidecode**: Text normalization
- **python-multipart**: File uploads
- **pillow**: Image processing
- **python-dotenv**: Environment variables
- **psycopg2-binary**: PostgreSQL adapter (chưa sử dụng)

## 🚀 Khởi động Backend

### 1. Cài đặt dependencies
```bash
pip install -r requirements.txt
```

### 2. Khởi tạo database
```bash
python backend/init_database.py
```

### 3. Chạy server
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Truy cập
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Frontend**: http://localhost:8000/app/editor.html

## 📖 API Endpoints

### 📍 Maps Management (`/maps`)
- `GET /maps` - Lấy danh sách tất cả bản đồ
- `POST /maps` - Tạo bản đồ mới (upload file ảnh)
- `GET /maps/{map_id}` - Lấy thông tin chi tiết bản đồ
- `DELETE /maps/{map_id}` - Xóa bản đồ

### 🎯 Nodes Management (`/nodes`)
- `GET /nodes?map_id={id}` - Lấy danh sách nodes theo map_id
- `POST /nodes` - Tạo node mới (với aliases kèm theo)
- `GET /nodes/{node_id}` - Lấy thông tin chi tiết node
- `PATCH /nodes/{node_id}` - Cập nhật node (partial update)
- `DELETE /nodes/{node_id}` - Xóa node (cả aliases và edges liên quan)

### 🔗 Edges Management (`/edges`)
- `GET /edges?map_id={id}` - Lấy danh sách edges theo map_id
- `POST /edges` - Tạo edge mới (tự động tính weight)
- `PATCH /edges/{edge_id}` - Cập nhật edge (polyline, bidirectional)
- `DELETE /edges/{edge_id}` - Xóa edge

### 🏷️ Aliases Management (`/aliases`)
- `GET /aliases?node_id={id}` - Lấy danh sách aliases (filter theo node_id)
- `POST /aliases` - Tạo alias mới
- `GET /aliases/search?q={query}` - Tìm kiếm aliases với RapidFuzz

### 🛤️ Route Finding (`/`)
- `POST /route` - Tìm đường đi thông minh (NLP + Dijkstra)

### 🔧 Admin Utilities (`/admin`)
- `POST /admin/clear-map` - Xóa toàn bộ dữ liệu một bản đồ
- `GET /admin/{map_id}/full` - Lấy full map details (nodes + edges + aliases)

## 📊 Data Models (Thực tế)

### Map Entity
```python
class Map:
    id: int
    name: str
    image_link: str          # Link đến file ảnh
    floor_number: int        # Số tầng
    scale: float            # Tỷ lệ (pixels per meter)
```

### Node Entity
```python
class Node:
    id: int
    map_id: int
    x: float
    y: float
    is_landmark: bool       # Có phải là địa điểm nổi bật
```

### Edge Entity
```python
class Edge:
    id: int
    start_node_id: int
    end_node_id: int
    type: str              # Loại đường đi
    polyline: list         # Tọa độ đường đi (JSON)
    weight: float          # Trọng số
```

### Alias Entity
```python
class Alias:
    id: int
    node_id: int
    name: str              # Tên địa điểm
```

## 🧠 Core Features (Thực tế)

### 1. Natural Language Processing (nlp.py)
- **normalize_name()**: Chuyển về chữ thường, strip whitespace
- **extract_a_b()**: Trích xuất điểm đi và điểm đến từ câu query
- **Support patterns**: "từ A đến B", "đi tới B", "tìm B"...

### 2. Route Finding (routes.py)
- **NetworkX**: Xây dựng đồ thị từ nodes và edges
- **Dijkstra algorithm**: Tìm đường ngắn nhất
- **Instruction generation**: Tạo hướng dẫn từng bước
- **Geometry calculations**: Tính góc rẽ, khoảng cách

### 3. File Upload (maps.py)
- **Image processing**: Pillow để xử lý ảnh
- **File validation**: Kiểm tra type và size
- **Storage**: Lưu vào `data/uploads/`

## 🛠️ Development Notes

### Database Connection (db.py)
- **Default**: SQLite tại `data/db/wayfinder.db`
- **Environment override**: `WAYFINDER_DB_URL` hoặc `DATABASE_URL`
- **Auto-create**: Database và tables tự động tạo khi khởi động
- **SQLModel**: Sử dụng SQLAlchemy + Pydantic

### CORS Configuration
```python
# Development mode - allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Static Files
- `/static` -> Serve từ `data/` directory
- `/app` -> Serve frontend từ `frontend/` directory

## 🔄 Request/Response Examples

### Create Map Request
```bash
curl -X POST "http://localhost:8000/maps" \
  -F "name=Tầng 1" \
  -F "floor_number=1" \
  -F "scale=50.0" \
  -F "file=@map.jpg"
```

### Route Finding Request
```json
{
    "query": "từ thư viện đến phòng B202",
    "map_id": 1
}
```

### Route Response
```json
{
    "map_id": 1,
    "path_coords": [[100, 200], [150, 200], [200, 250]],
    "total_distance_m": 45.5,
    "instructions": [
        {
            "step": 1,
            "text": "Đi thẳng",
            "action": "straight",
            "distance_m": 15.2,
            "coordinate": [100, 200]
        }
    ]
}
```

## 🔧 Configuration

### Environment Variables
- `WAYFINDER_DB_URL`: Database connection string
- `DATABASE_URL`: Fallback database URL
- `.env` file được load tự động từ project root

### File Structure
```
data/
├── db/
│   └── wayfinder.db       # SQLite database
└── uploads/               # Map images
    └── [map_files]
```

## 🚨 Error Handling

### HTTP Status Codes
- `200`: Success
- `404`: Resource not found
- `422`: Validation error
- `500`: Internal server error

### Error Response Format
```json
{
    "detail": "Map with id 999 not found"
}
```

## 📈 Current Limitations

1. **NLP**: Chỉ hỗ trợ patterns cơ bản, chưa có AI/ML
2. **Fuzzy Search**: Sử dụng RapidFuzz cơ bản
3. **Multi-floor**: Chưa có thuật toán cụ thể cho tìm đường giữa tầng
4. **Authentication**: Chưa có user management
5. **Testing**: Chưa có test suite
6. **Documentation**: API docs chỉ qua FastAPI auto-gen

## 🔒 Security Considerations

1. **Input Validation**: Pydantic models cho request/response
2. **File Upload**: Kiểm tra file types (images only)
3. **SQL Injection**: SQLModel ORM protection
4. **CORS**: Wide open cho development, cần tighten cho production

## 📞 Support

Nếu gặp vấn đề với backend:
1. Kiểm tra console output khi chạy server
2. Test với Swagger UI tại `/docs`
3. Verify database file tại `data/db/wayfinder.db`
4. Check permissions cho `data/` directory