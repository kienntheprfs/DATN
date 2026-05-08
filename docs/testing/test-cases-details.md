# Chi tiết Test Cases - Module Wayfinder

Tài liệu này mô tả chi tiết các kịch bản kiểm thử (Test Cases) đã được triển khai trong mã nguồn, bao phủ các logic từ cơ bản đến phức tạp của hệ thống chỉ đường.

## 1. Unit & Router Tests (Backend)

### 1.1. Điều hướng toàn trình (Navigation - routes.py)
| mã tc | tên kịch bản | mô tả / đầu vào | kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **nv-001** | điều hướng cùng tầng | start: node a (f1), end: node b (f1) | trả về polyline và hướng dẫn "đi thẳng/rẽ..." |
| **nv-002** | điều hướng chuyển tầng | start: node a (f1), end: node c (f2) | có bước "đi lên/xuống cầu thang" và polyline qua 2 map |
| **nv-003** | đi từ tòa nhà ra sân (exit) | start: node indoor, end: node outdoor | hướng dẫn "đi ra khỏi tòa nhà..." |
| **nv-004** | đi từ sân vào tòa nhà (entrance) | start: node outdoor, end: node indoor | hướng dẫn "đi vào tòa nhà..." |
| **nv-005** | tìm đường theo tên (nlp) | query: "từ phòng 101 đến phòng 201" | tự tìm id node dựa trên alias và vẽ đường |
| **nv-006** | xử lý tên trùng lặp | query: "phòng 101" (có ở cả tòa a và tòa b) | trả về `ambiguity: true` và danh sách gợi ý |
| **nv-007** | refresh cache | gọi endpoint `/refresh-cache` | xóa file graph_cache.json và dựng lại đồ thị từ db |

### 1.2. Quản lý dữ liệu bản đồ (Maps - maps.py)
| mã tc | tên kịch bản | mô tả / đầu vào | kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **mp-001** | tạo bản đồ hợp lệ | upload file .png kèm `building_id` | lưu file vào `data/uploads`, tạo bản ghi db |
| **mp-002** | chặn file không phải ảnh | upload file .txt | trả về lỗi 400 |
| **mp-003** | cập nhật tỷ lệ (scale) | thay đổi `scale_ratio` của map | tự động tính toán lại `weight` của tất cả các edge thuộc map đó |
| **mp-004** | xóa bản đồ (cascade) | xóa map đang chứa node/edge | tự động xóa sạch node, edge, alias liên quan |

### 1.3. Quản lý Node & Edge (nodes.py)
| mã tc | tên kịch bản | mô tả / đầu vào | kết quả mong đợi |
| :--- | :--- | :--- | :--- |
| **nd-001** | tạo node liên kết 2 chiều | tạo node với `linked_node_id` | hệ thống tự tạo liên kết ngược lại từ node đích về node mới |
| **nd-002** | cập nhật tọa độ | thay đổi x, y của node | phản ánh chính xác trên bản đồ |

## 2. Kết quả kiểm thử thực tế

Dựa trên kết quả chạy test ngày 06/05/2026:

- **Tổng số test case**: 13 (Router tests) + 30+ (Logic/Service tests)
- **Tỷ lệ vượt qua**: 100%
- **Độ phủ mã nguồn (Coverage)**:
  - `routes.py`: 85.0%
  - `maps.py`: 89.0%
  - `nodes.py`: 83.0%
  - `buildings.py`: 96.0%

## 3. Các kịch bản biên & Lỗi đã xử lý (Edge Cases)

1.  **Unicode/Encoding**: Xử lý khớp tên địa điểm có dấu và không dấu (ví dụ: "Sảnh A" và "Sanh A").
2.  **Đồ thị rỗng**: Hệ thống không bị crash khi Graph Cache chưa được dựng.
3.  **Lỗi dữ liệu tòa nhà**: Khi map không thuộc tòa nhà nào (`building_id=None`), hệ thống mặc định coi đó là bản đồ ngoài trời (Campus).

---
*Cập nhật bởi: Antigravity AI Assistant*
