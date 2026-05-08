# Integration Testing Strategy

## 1. Tổng quan
Tài liệu này xác định chiến lược kiểm thử tích hợp (Integration Testing) cho hệ thống DATN-Chatbot. Mục đích là đảm bảo các module độc lập, các services, và các thành phần của hệ thống (như Database, AI Agent, Frontend, Backend) giao tiếp và hoạt động đồng bộ với nhau một cách chính xác.

| Thông tin | Chi tiết |
|-----------|----------|
| **Cấp độ Test** | Integration Testing |
| **Phạm vi hệ thống** | Backend API, Database, LLM Agents, Frontend Services |
| **Framework (Backend)** | Pytest + FastAPI TestClient |
| **Framework (Frontend)** | Jest + RTL (Tích hợp mock handlers - MSW) |

## 2. Phân loại Integration Tests

### 2.1 Backend <-> Database (Data Integration)
- **Mục tiêu:** Đảm bảo các Repository/CRUD operations truy xuất và cập nhật dữ liệu chính xác vào PostgreSQL sử dụng SQLModel.
- **Chiến lược:**
  - Dùng Test Database (database riêng biệt hoặc In-Memory SQLite tùy tính tương thích) cho mỗi phiên chạy test.
  - Sử dụng Fixtures trong Pytest để setup schema, chèn mock data (seed) trước mỗi test và teardown (rollback/drop) sau khi test xong.
- **Kịch bản test mẫu:**
  - *Tạo Graph Node:* Gọi logic lưu Graph Node -> Query trực tiếp DB xem bản ghi có tồn tại với đúng tọa độ không -> Cố ý lưu node trùng ID để kiểm tra Database Constraint Error.
  - *Truy vấn phòng:* Tìm kiếm tên phòng -> Kiểm tra kết quả trả về đúng số lượng và mapping đúng fields.

### 2.2 Backend API <-> AI Agent Service (Service Integration)
- **Mục tiêu:** Đảm bảo API route của FastAPI gọi đúng các hàm AI/LLM, truyền đúng prompt, và xử lý streaming response (SSE) thành công.
- **Chiến lược:**
  - Không call LLM thật (OpenAI/Gemini) để tránh tốn phí và thời gian chạy chậm. Thay vào đó, mock HTTP requests tới LLM Service hoặc mock trực tiếp hàm gọi LLM.
  - Test luồng: Controller nhận request -> Xử lý dữ liệu -> Gọi Mock LLM -> Controller trả về HTTP Response.
- **Kịch bản test mẫu:**
  - *Chat API:* Gửi POST request lên `/api/chat` với câu hỏi "Phòng 101 ở đâu". Mock LLM trả về text "Phòng 101 ở tầng 1". Verify API trả về status 200 và response body chứa text tương ứng.
  - *Streaming Test:* Verify API trả về đúng header `text/event-stream` và các chunk data theo chuẩn SSE.

### 2.3 Wayfinder Pipeline Integration
- **Mục tiêu:** Kiểm tra luồng dữ liệu chảy qua toàn bộ các module của Wayfinder (NLP -> Graph -> Routing).
- **Chiến lược:** Test end-to-end trong nội bộ logic backend (không qua HTTP, chỉ qua code).
- **Kịch bản test mẫu:**
  - Truyền vào input text: *"Chỉ đường từ Sảnh A đến Phòng Máy tính"*.
  - *Bước 1 (NLP):* Hệ thống parse ra `start_node = A`, `end_node = B`.
  - *Bước 2 (Graph):* Gọi thuật toán A* tìm đường từ A -> B, trả về array các điểm `[A, C, B]`.
  - *Bước 3 (Routing):* Biến đổi array các điểm thành instructions text: *"Đi thẳng 10m, rẽ phải, đi 5m tới nơi"*.
  - Kiểm tra output cuối cùng khớp với kết quả dự kiến.

### 2.4 Frontend <-> Backend APIs (Client-Server Integration)
- **Mục tiêu:** Đảm bảo Frontend call API đúng endpoint, truyền đúng payload, và xử lý chính xác response (thành công hoặc lỗi) từ Backend.
- **Chiến lược:**
  - Dùng **MSW (Mock Service Worker)** để chặn (intercept) các API calls từ Frontend và trả về mock response.
  - Render Component cha (ví dụ `ChatContainer`) và trigger action.
- **Kịch bản test mẫu:**
  - Mock API `GET /api/history` trả về danh sách 2 tin nhắn cũ.
  - Render `<ChatContainer />`.
  - Đảm bảo màn hình hiển thị đủ 2 tin nhắn đó mà không bị lỗi parse JSON.
  - Cố ý mock API trả về status 500, đảm bảo UI hiện thông báo lỗi "Không thể tải lịch sử".

---

## 3. Quản lý Môi trường Test & Dữ liệu

### 3.1 Cấu hình Môi trường
- Phải có file `.env.test` riêng biệt.
- Database Connection URL phải trỏ về test DB (VD: `postgresql://user:pass@localhost:5432/datn_test`).
- Tắt các services không cần thiết (Telemetry, Analytics) khi chạy test.

### 3.2 Setup & Teardown (Pytest)
```python
@pytest.fixture(scope="session")
def test_db():
    # Setup: Create all tables in test DB
    SQLModel.metadata.create_all(engine)
    yield
    # Teardown: Drop all tables
    SQLModel.metadata.drop_all(engine)

@pytest.fixture
def test_client(test_db):
    # Setup test client for FastAPI
    from fastapi.testclient import TestClient
    from app.main import app
    yield TestClient(app)
```

## 4. Lệnh Thực Thi

```bash
# Chạy Integration Tests cho Backend
pytest tests/integration/ -v

# Chạy Integration Tests cho Frontend (chứa MSW)
npm run test:integration
```
