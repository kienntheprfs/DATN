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

### 1. Start PostgreSQL

```bash
cd api_gateway
docker-compose up -d
```

### 2. Install dependencies

```bash
cd api_gateway
uv sync
```

### 3. Configure environment

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

### 4. Run database migrations

```bash
cd api_gateway
alembic upgrade head
```

### 5. Run API Gateway

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

Dừng service:

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

