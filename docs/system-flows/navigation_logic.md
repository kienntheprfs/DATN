# Tài liệu Logic Tìm đường và Sinh chỉ dẫn (Wayfinder)

Tài liệu này chi tiết hóa kiến trúc và logic xử lý của hệ thống tìm đường trong ứng dụng Wayfinder, tập trung vào file `wayfinder/backend/routers/routes.py`.

---

## 1. Kiến trúc Đồ thị (Graph Architecture)

Hệ thống sử dụng thư viện **NetworkX** để quản lý đồ thị đa tầng (Multi-floor Graph).

### 1.1. Cấu trúc Node & Edge
- **Node**: Đại diện cho các điểm trên bản đồ (Phòng, hành lang, thang máy, cầu thang).
  - Thuộc tính: `id`, `name`, `map_id`, `floor`, `type`, `pos (x, y)`.
- **Edge**: Kết nối giữa hai node.
  - Thuộc tính: `weight`, `type`, `polyline`.
  - **Trọng số (Weight)**: 
    - Đối với đường đi bộ thông thường: Tính dựa trên khoảng cách pixel × scale của bản đồ.
    - Đối với các kết nối đặc biệt (`FIXED_COSTS`):
      - `stairs`: 100.0 (Ưu tiên thấp hơn do tốn sức).
      - `elevator`: 50.0 (Ưu tiên cao hơn thang bộ).
      - `entrance`: 10.0 (Kết nối giữa Campus và Tòa nhà).

### 1.2. Cơ chế Cache
Để tối ưu hiệu năng, đồ thị được xây dựng một lần và lưu trữ:
- **In-memory Cache**: Biến toàn cục `_global_graph` lưu trữ đồ thị đã build.
- **File Cache**: Lưu tại `data/graph_cache.json` để không phải truy vấn Database mỗi khi khởi động lại server.

---

## 2. Thuật toán Tìm đường (Pathfinding)

Hệ thống sử dụng thuật toán **A* (A-Star)** để tìm đường ngắn nhất.

### 2.1. Heuristic Function
Hàm Heuristic được thiết kế để hỗ trợ tìm đường đa tầng:
- Sử dụng **Euclidean Distance** (Khoảng cách chim bay) giữa tọa độ x, y.
- **Floor Penalty**: Nếu hai điểm ở khác tầng nhau, hệ thống cộng thêm một khoản "phạt" (`FLOOR_PENALTY = 20.0`) cho mỗi tầng chênh lệch. Điều này giúp A* định hướng tìm về phía các thang máy/cầu thang nhanh hơn.

### 2.2. Xử lý Đa tầng (Cross-floor)
Khi đường đi đi qua các node có `map_id` khác nhau hoặc `floor` khác nhau, hệ thống sẽ nhận diện đó là bước chuyển tầng hoặc chuyển bản đồ.

---

## 3. Logic Sinh chỉ dẫn (Instruction Generation)

Hàm `generate_human_instructions` chuyển đổi danh sách các Node IDs thành ngôn ngữ tự nhiên.

### 3.1. Tính toán Góc rẽ (Turn Logic)
Sử dụng 3 điểm liên tiếp (p1 -> p2 -> p3) để tính góc:
- **Góc > 45°**: Rẽ phải (`right`).
- **Góc < -45°**: Rẽ trái (`left`).
- **15° < Góc <= 45°**: Chếch phải (`slight_right`).
- **-45° <= Góc < -15°**: Chếch trái (`slight_left`).
- **Khác**: Đi thẳng (`straight`).

### 3.2. Nhận diện Hành động Đặc biệt
- **Chuyển tầng**: Nếu `floor` của node hiện tại và node kế tiếp khác nhau.
  - Sinh chỉ dẫn: "Đi thang máy/cầu thang lên/xuống Tầng X".
- **Vào/Ra tòa nhà**: Dựa trên loại node `entrance` và sự thay đổi của `floor` (từ `null` sang có giá trị và ngược lại).
  - Sinh chỉ dẫn: "Vào Tòa nhà X" hoặc "Ra khỏi tòa nhà".

---

## 4. Hệ thống Tìm kiếm & NLP

### 4.1. Fuzzy Search (Tìm kiếm mờ)
Sử dụng thư viện **RapidFuzz** để tìm kiếm địa điểm ngay cả khi người dùng nhập sai chính tả hoặc thiếu từ.
- So khớp tên Alias của Node kết hợp với tên Tòa nhà.
- Tính điểm `score` dựa trên `token_set_ratio`.

### 4.2. Xử lý Ambiguity (Độ nhiễu)
Nếu tìm thấy nhiều địa điểm có điểm số tương đồng (chênh lệch < 10 điểm), hệ thống sẽ trả về lỗi yêu cầu người dùng xác nhận chính xác hơn (ví dụ: "Phòng 101 ở Tầng 1 hay Tầng 2?").

---

## 5. Xử lý Hiển thị (Polyline)

Hàm `build_full_polyline` tạo ra một danh sách các tọa độ liên tục để vẽ lên giao diện:
- Tự động đảo ngược `polyline` của các cạnh nếu hướng đi của người dùng ngược với hướng vẽ cạnh trong DB.
- Loại bỏ các đoạn polyline "ảo" giữa các tầng (thang máy/thang bộ xuyên tầng) để tránh các đường kẻ gạch chéo gây rối mắt trên bản đồ 2D.

---

> [!TIP]
> **Lưu ý về Scale**: Mọi tính toán khoảng cách trong chỉ dẫn đều được nhân với `scale_ratio` của bản đồ (mét/pixel) để đưa ra con số thực tế (ví dụ: "Đi 15m").
