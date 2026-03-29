# API Gateway

API Gateway cho DATN Chatbot với JWT authentication, refresh token rotation, và authorization theo role/ownership bằng Python (fastapiDI).

## Tổng quan kiến trúc

- Authentication: JWT access token + refresh token
- Authorization: Python-based dependencies (`require_auth`, `require_roles`, `require_ownership`)
- JWT cache: in-memory TTL cache trong middleware
- Routing: proxy request đến các service downstream
  - Agent service: `AGENT_SERVICE_URL` (mặc định `http://localhost:8080`)
  - Knowledge service: `KNOWLEDGE_SERVICE_URL` (mặc định `http://localhost:8000`)
  - Wayfinder service: `WAYFINDER_SERVICE_URL` (mặc định `http://localhost:8001`)

Lưu ý: phiên bản hiện tại không dùng OPA runtime và không cần Redis để chạy luồng auth cơ bản.

## Prerequisites

- Python 3.11+
- Docker & Docker Compose
- uv package manager

## Quick Start


### 1. Install dependencies

```bash
cd api_gateway
uv sync
```

### 2. Configure environment

```bash
cd api_gateway
cp .env.example .env
```

Các biến quan trọng:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `INTERNAL_SECRET`

- `AGENT_SERVICE_URL`
- `KNOWLEDGE_SERVICE_URL`
- `WAYFINDER_SERVICE_URL`

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`


### 3. Run API Gateway

```bash
cd api_gateway
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8002
```

Gateway chạy tại `http://localhost:8002`
- Docs: `http://localhost:8002/docs`
- Health: `http://localhost:8002/health`

## API endpoints

### System
- `GET /` - thông tin service
- `GET /health` - health check

### Authentication (`/auth`)
- `POST /auth/register` - đăng ký user
- `POST /auth/login` - nhận access/refresh token
- `POST /auth/google` - login bằng Google ID token
- `GET /auth/me` - lấy thông tin user hiện tại
- `POST /auth/refresh` - refresh access token
- `POST /auth/logout` - logout current device (user/admin)
- `POST /auth/logout-all` - logout tất cả thiết bị của chính mình (user/admin)
- `POST /auth/revoke` - revoke một refresh token bất kỳ (admin)
- `POST /auth/revoke-all` - revoke tất cả token của 1 user được chỉ định (admin)

### Threads (`/threads`)
Yêu cầu auth, và với resource cụ thể sẽ kiểm tra ownership.
- `POST /threads`
- `GET /threads`
- `GET /threads/{thread_id}`
- `PATCH /threads/{thread_id}`
- `DELETE /threads/{thread_id}`

### Agent proxy (`/agent`)
- `POST /agent/invoke` - public endpoint, hỗ trợ guest mode (không bắt buộc JWT)
- `GET /agent/history/{thread_id}` - yêu cầu ownership (chính chủ người dùng) hoặc admin
- `GET|POST|PUT|PATCH|DELETE /agent/{path:path}` - generic proxy

### Knowledge proxy (`/kb`)
Toàn bộ endpoint yêu cầu role `admin`.
- `GET|POST|PUT|PATCH|DELETE /kb/{path:path}`

### Wayfinder proxy (`/wayfinder`)
Toàn bộ endpoint yêu cầu role `admin`.
- `GET|POST|PUT|PATCH|DELETE /wayfinder/{path:path}`

## Auth behavior

- Public paths: `/`, `/docs`, `/redoc`, `/openapi.json`, `/health`, và một số endpoint auth
- Guest-allowed path: `/agent/invoke`
- Các path còn lại: yêu cầu header `Authorization: Bearer <access_token>`

Optional: Khi authenticated, gateway inject các header cho downstream service:
- `X-User-ID`
- `X-User-Email`
- `X-User-Roles`
- `X-Internal-Secret`

## Testing

Chạy unit/integration tests:

```bash
cd api_gateway
uv run pytest
```

Chạy script test endpoint:

```bash
cd api_gateway
uv run scripts/test_all_endpoints.py
```

## Development

Tạo migration mới:

```bash
cd api_gateway
alembic revision --autogenerate -m "description"
```

Reset DB (dev only):

```bash
cd api_gateway
alembic downgrade base
alembic upgrade head
```

Dừng service db postgres local (nếu dùng docker):

```bash
cd api_gateway
docker-compose down
```
ctrl + C (dừng uvicorn)

Xóa data volume:

```bash
cd api_gateway
docker-compose down -v
```

## Troubleshooting

### Database URL compatibility

**Issue**: `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgres`

**Cause**: DATABASE_URL dùng scheme `postgres://` thay vì `postgresql://`.

**Solution**: API Gateway tự động chuẩn hóa URL. Hỗ trợ cả:
- `postgres://` → sẽ được chuyển thành `postgresql://`
- `postgresql://` → không thay đổi

```bash
# Cách 1: Cập nhật .env (tuỳ chọn, gateway tự xử lý)
DATABASE_URL=postgresql://user:password@host:port/dbname

# Hay giữ lại postgres:// cũng được
DATABASE_URL=postgres://user:password@host:port/dbname
```

### asyncpg SSL parameter incompatibility

**Issue**: `TypeError: connect() got an unexpected keyword argument 'sslmode'`

**Cause**: Tham số `sslmode` (dành cho psycopg2 sync) không tương thích với asyncpg.

**Solution**: Gateway tự động chuyển đổi query parameter:
- `sslmode=require` → `ssl=require` (asyncpg compatible)

Không cần thay đổi DATABASE_URL.

**Note**: Migration (Alembic) vẫn dùng psycopg2 sync, nên giữ lại `sslmode` trong URL là đúng.

### Database migration fails

**Issue**: `alembic upgrade head` bị lỗi kết nối

**Debug**: Kiểm tra URL và kết nối:
```bash
cd api_gateway
uv run python -c "from src.config import settings; print('Sync:', settings.database_url_sync); print('Async:', settings.database_url_async)"
```

**Common causes**:
- Host/port/credentials sai trong DATABASE_URL
- Database server chưa đạt
- Firewall chặn kết nối

### Seed data fails

**Issue**: `seed_data.py` bị lỗi sslmode

**Solution**: Script đã cập nhật dùng chuẩn hóa URL từ config:
```bash
cd api_gateway
echo "admin@example.com" | uv run python scripts/seed_data.py
```

