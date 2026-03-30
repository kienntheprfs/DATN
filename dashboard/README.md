# Dashboard Service

Dashboard service cung cấp API cho các tính năng quản trị và phân tích. Hiện tại service đã hỗ trợ tính năng đánh giá câu trả lời AI (answer rating) để phục vụ dashboard nội bộ và cải thiện chất lượng hệ thống AI.

## 1) Yêu cầu hệ thống

- Python >= 3.11
- UV package manager
- PostgreSQL (chia schema theo service, dashboard dùng schema dashboard)

## 2) Cấu hình môi trường

Service đọc cấu hình từ biến môi trường thông qua class Settings tại src/core/settings.py.

Biến quan trọng:

- database_url: URL kết nối PostgreSQL
- db_pool_size: số kết nối trong pool
- db_max_overflow: số kết nối vượt quá pool_size
- db_pool_timeout: thời gian chờ kết nối
- db_pool_recycle: thời gian tái tạo kết nối
- debug: bật/tắt chế độ debug

Ví dụ file .env:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/authdb
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600
DEBUG=false
```

## 3) Cài đặt và khởi tạo

### 3.1 Cài dependencies

```bash
cd dashboard
uv sync
```

### 3.2 Chạy migration

```bash
cd dashboard
uv run alembic upgrade head
```

### 3.3 Chạy service local

```bash
cd dashboard
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8010
```

Health check:

```bash
curl -X GET "http://localhost:8010/health"
```

## 4) Trust boundary và authentication

Dashboard không tự xác thực JWT. Service trust API Gateway đã xác thực và inject trusted headers.

Headers được sử dụng:

- X-User-Id: danh tính người dùng
- X-User-Roles: danh sách role dạng CSV, ví dụ admin,user

Nếu thiếu X-User-Id, API trả 401.

## 5) API Reference (Answer Rating)

Base URL local:

```text
http://localhost:8010
```

### 5.1 Tạo hoặc cập nhật rating

Endpoint:

```text
POST /ratings
```

Mô tả:

- Upsert theo cặp (X-User-Id, run_id)
- Mỗi user chỉ có tối đa 1 rating cho mỗi run_id
- Không cho phép comment khi rating = LIKE
- Khi update, giữ nguyên thread_id và agent_id từ bản ghi đầu tiên

Request body:

```json
{
	"run_id": "8f8ec0ec-7e31-4fcb-8d3a-b1137a4efe20",
	"rating": "DISLIKE",
	"comment": "Câu trả lời chưa đúng nghiệp vụ",
	"thread_id": "thread-001",
	"agent_id": "agent-sales"
}
```

Ví dụ curl:

```bash
curl -X POST "http://localhost:8010/ratings" \
	-H "Content-Type: application/json" \
	-H "X-User-Id: user-001" \
	-H "X-User-Roles: user" \
	-d '{
		"run_id": "8f8ec0ec-7e31-4fcb-8d3a-b1137a4efe20",
		"rating": "DISLIKE",
		"comment": "Câu trả lời chưa đúng nghiệp vụ",
		"thread_id": "thread-001",
		"agent_id": "agent-sales"
	}'
```

Status code:

- 201: tạo mới hoặc cập nhật thành công
- 400: dữ liệu không hợp lệ
- 401: thiếu user identity
- 409: xung đột unique constraint trong tình huống race condition
- 500: lỗi hệ thống

### 5.2 Xóa rating

Endpoint:

```text
DELETE /ratings/{rating_id}
```

Quyền:

- Owner được xóa rating của chính mình
- Admin được xóa mọi rating

Ví dụ curl:

```bash
curl -X DELETE "http://localhost:8010/ratings/5dfc56d8-9f8a-4695-845a-0a5beecf69e8" \
	-H "X-User-Id: user-001" \
	-H "X-User-Roles: user"
```

Status code:

- 204: xóa thành công
- 401: thiếu user identity
- 403: không đủ quyền
- 404: không tìm thấy rating

### 5.3 Lấy ratings theo thread

Endpoint:

```text
GET /ratings/thread/{thread_id}
```

Rule hiển thị:

- User thường: chỉ thấy rating của chính họ trong thread
- Admin: thấy tất cả rating trong thread

Ví dụ curl:

```bash
curl -X GET "http://localhost:8010/ratings/thread/thread-001" \
	-H "X-User-Id: admin-001" \
	-H "X-User-Roles: admin"
```

### 5.4 Lấy thống kê rating theo agent (admin only)

Endpoint:

```text
GET /ratings/stats/agent/{agent_id}
```

Response:

```json
{
	"total": 120,
	"like_count": 84,
	"dislike_count": 36,
	"like_percentage": 70.0
}
```

Ví dụ curl:

```bash
curl -X GET "http://localhost:8010/ratings/stats/agent/agent-sales" \
	-H "X-User-Id: admin-001" \
	-H "X-User-Roles: admin"
```

## 6) Các trường hợp sử dụng chính

- User feedback nhanh:
	User like/dislike từng câu trả lời AI để đo mức độ hài lòng.
- Admin analytics:
	Admin xem thống kê theo agent để phát hiện bot trả lời kém chất lượng.
- AI improvement loop:
	Team có thể trích xuất dislike/comment để làm dữ liệu cải tiến prompt/model.

## 7) Hướng dẫn chạy test

Chạy tất cả test:

```bash
uv run pytest -q
```

Chạy riêng unit test:

```bash
uv run pytest tests/unit -q
```

Chạy riêng integration test:

```bash
uv run pytest tests/integration -q
```

## 8) Kiểm tra chất lượng và vận hành

- Trước khi merge:
	- Chạy test đầy đủ
	- Review migration (constraint/index naming)
	- Verify endpoint với trusted headers
- Sau khi deploy:
	- Kiểm tra health endpoint
	- Test nhanh các luồng create/update/delete/stats
	- Theo dõi error logs

## 9) Tài liệu bổ sung

- Kế hoạch chi tiết tính năng: docs/answer_rating.md
