# Chi tiết Kịch bản Kiểm thử Wayfinder (Detailed Test Cases)

Tài liệu này chi tiết hóa các bước thực hiện, dữ liệu đầu vào và kết quả mong đợi cho hệ thống Wayfinder.

---

## 1. Unit Tests (Kiểm thử Đơn vị)

### TC-UNIT-01: Chuẩn hóa tên địa điểm (NLP)
- **Mục tiêu**: Kiểm tra hàm `normalize_name`.
- **Đầu vào**: `"A4-201"`, `"Phòng 201, Tòa A4"`, `"  Phòng   Họp  "`.
- **Kết quả mong đợi**: 
    - `"a4 201"`
    - `"phong 201 toa a4"`
    - `"phong hop"`

### TC-UNIT-02: Thuật toán tìm đường Dijkstra
- **Mục tiêu**: Kiểm tra logic tính toán đường đi ngắn nhất.
- **Đầu vào**: Đồ thị giả lập (Nodes: 1, 2, 3; Edges: 1-2 (5m), 2-3 (10m), 1-3 (20m)). Tìm đường từ 1 đến 3.
- **Kết quả mong đợi**: Lộ trình `[1, 2, 3]`, tổng quãng đường `15m`.

### TC-UNIT-03: Trích xuất Node ID từ Tool input
- **Mục tiêu**: Kiểm tra hàm `find_route_func` xử lý `[ID: ...]`
- **Đầu vào**: `from_location="Phòng 201 [ID: 50]"`, `to_location="Thư viện [ID: 60]"`.
- **Kết quả mong đợi**: Tool trích xuất đúng `from_node_id=50`, `to_node_id=60` và bỏ qua bước tìm kiếm mờ.

---

## 2. Integration Tests (Kiểm thử Tích hợp)

### TC-INT-01: Tìm kiếm Alias & Building
- **API**: `GET /api/aliases/search?q=Phòng 201`
- **Kết quả mong đợi**: Trả về danh sách các JSON object chứa `node_id`, `name`, `building_name` (ví dụ: Tòa A4, Tòa B4).

### TC-INT-02: Tìm đường liên tầng (Database Integration)
- **API**: `POST /api/routes` với tọa độ A (Tầng 1) và B (Tầng 2).
- **Kết quả mong đợi**: Trả về chuỗi Node IDs chứa ít nhất một Node có type là `STAIRS` hoặc `ELEVATOR`.

---

## 3. System Tests (Kiểm thử Hệ thống - E2E)

### TC-SYS-01: Quản trị - Tạo Tòa nhà & Tầng
1. Truy cập `/navigation/editor`.
2. Mở panel quản lý tòa nhà, tạo "Tòa Nhà Test".
3. Thêm "Tầng 1" cho tòa nhà này, upload một file ảnh bản đồ hợp lệ.
- **Kết quả**: Ảnh bản đồ hiển thị trên canvas, tên tòa nhà xuất hiện trong danh sách chọn.

### TC-SYS-02: Quản trị - Vẽ Map & Lưu trữ
1. Chọn "Add Node", chấm 2 điểm lên bản đồ.
2. Chọn "Add Edge", nối 2 điểm đó.
3. Nhập Alias cho điểm 1 là "Cổng Test".
4. Nhấn "Lưu bản đồ". Refresh trang.
- **Kết quả**: 2 điểm và 1 đường nối vẫn hiển thị đúng vị trí cũ.

### TC-SYS-03: Người dùng - Tìm đường & Step-by-step
1. Truy cập `/navigation`.
2. Nhập "Cổng Test" vào ô bắt đầu, địa điểm khác vào ô kết thúc.
3. Nhấn "Tìm đường".
- **Kết quả**: Đường nét liền màu xanh hiển thị. Panel hướng dẫn bên trái hiện các bước "Đi thẳng...", "Rẽ...".

### TC-SYS-04: Người dùng - Chuyển tầng 3D
1. Tìm đường từ Tầng 1 lên Tầng 2.
- **Kết quả**: Bản đồ nghiêng sang chế độ 3D, thấy các tầng chồng lên nhau và đường nối dọc giữa chúng.

---

## 4. Acceptance Tests (Kiểm thử Chấp nhận)

### TC-ACC-01: Chatbot - Giải quyết nhập nhằng (Loop Fix)
1. User chat: "Dẫn tôi đến phòng 201".
2. Bot hỏi: "Bạn muốn đến phòng 201 ở Tòa A4 hay Tòa B4?".
3. User chat: "Tòa A4".
- **Kết quả**: Bot hiển thị `MapPreview` chỉ đường đến đúng phòng 201 tòa A4 ngay lập tức, không hỏi lại lần 3.

### TC-ACC-02: Chatbot - Hiển thị MapPreview
1. Sau khi tìm đường thành công qua chat.
2. Kiểm tra giao diện `MapPreview` trong khung chat.
3. Bấm đổi tab tầng trong `MapPreview`.
- **Kết quả**: Đường đi màu xanh không bị biến mất khi đổi tab.
