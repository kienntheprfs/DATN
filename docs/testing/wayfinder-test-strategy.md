# Chiến lược Kiểm thử Wayfinder (Wayfinder Test Strategy)

Tài liệu này chi tiết chiến lược kiểm thử cho module Wayfinder - dịch vụ chỉ đường trong khuôn viên trường. Mục tiêu chính là đảm bảo độ tin cậy của thuật toán tìm đường, tính chính xác của dữ liệu bản đồ và hiệu năng của API.

## 1. Mục tiêu & Chỉ số (Goals & Metrics)

| Chỉ số | Mục tiêu | Trạng thái hiện tại |
|--------|----------|-------------------|
| **Code Coverage (Core Routers)** | > 80% | **85% - 96%** |
| **Pass Rate** | 100% | 100% |
| **Thời gian phản hồi API** | < 2s | ~500ms |

## 2. Các cấp độ kiểm thử (Testing Levels)

### 2.1. Unit Testing (Logic & Services)
Tập trung vào các hàm xử lý tính toán thuần túy không phụ thuộc vào Database hoặc Network.
- **`geo.py`**: Tính toán khoảng cách (Haversine/Euclidean), trọng số cạnh.
- **`nlp.py`**: Chuẩn hóa văn bản, trích xuất điểm đi/điểm đến từ ngôn ngữ tự nhiên.
- **`route_logic`**: Tính toán góc xoay, xác định hành động (rẽ trái/phải/đi thẳng).

### 2.2. Router Integration Testing (API Layer)
Kiểm thử các Endpoint API bằng `FastAPI TestClient` và cơ sở dữ liệu SQLite in-memory.
- **`routes.py`**: Kiểm thử luồng điều hướng toàn trình, chuyển tầng, quản lý Graph Cache.
- **`nodes.py`, `maps.py`, `buildings.py`**: Kiểm thử các nghiệp vụ CRUD, ràng buộc dữ liệu và logic cascade delete.

## 3. Các kịch bản kiểm thử trọng tâm (Core Test Scenarios)

### 3.1. Điều hướng & Thuật toán (Navigation)
- **Cùng tầng**: Tìm đường ngắn nhất giữa 2 phòng trong cùng 1 tòa nhà.
- **Chuyển tầng**: Tìm đường từ Tầng 1 tòa A sang Tầng 3 tòa A (phải đi qua thang bộ/thang máy).
- **Liên tòa nhà**: Tìm đường từ tòa A sang tòa B (đi qua bản đồ Campus).
- **Chuyển đổi trạng thái**: Đi từ bên trong tòa nhà (Indoor) ra ngoài trời (Outdoor/Campus).
- **Hướng dẫn giọng nói**: Kiểm tra tính chính xác của các câu lệnh "Rẽ trái", "Rẽ phải", "Đi thẳng" dựa trên góc tọa độ.

### 3.2. Quản lý Graph Cache
- **Refresh Cache**: Đảm bảo đồ thị đường đi được cập nhật ngay khi Admin thay đổi dữ liệu Node/Edge.
- **Persistence**: Đảm bảo cache được lưu xuống file JSON để tăng tốc độ khởi động hệ thống.

### 3.3. Xử lý ngôn ngữ tự nhiên (NLP)
- **Fuzzy Matching**: Tìm đúng Node ngay cả khi User nhập tên không hoàn toàn chính xác (ví dụ: "p.101" -> "Phòng 101").
- **Ambiguity**: Xử lý trường hợp một tên phòng tồn tại ở nhiều tòa nhà (hiển thị danh sách lựa chọn).

## 4. Cấu trúc thư mục Test

```text
backend/tests/
├── unit/
│   ├── test_geo_service.py      # Test logic địa lý
│   ├── test_nlp_service.py      # Test xử lý văn bản
│   ├── test_routes_router.py    # Test API điều hướng chính
│   ├── test_maps_router.py      # Test API quản lý bản đồ
│   ├── test_nodes_router.py     # Test API quản lý node
│   └── test_buildings_router.py # Test API quản lý tòa nhà
└── conftest.py                  # Fixtures (Database, Client, Mock data)
```

## 5. Hướng dẫn chạy Test

```bash
# Thiết lập môi trường
export PYTHONPATH="."

# Chạy toàn bộ test suite
uv run pytest backend/tests/unit/ -v

# Chạy kèm báo cáo Coverage
uv run pytest --cov=backend/routers --cov-report=term-missing
```

---
*Tài liệu này được cập nhật định kỳ dựa trên các thay đổi trong logic lõi của Wayfinder.*