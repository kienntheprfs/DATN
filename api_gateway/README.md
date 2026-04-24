# API Gateway

API Gateway cho DATN Chatbot chạy theo kiến trúc **APISIX standalone (YAML file-driven)** + **Auth service FastAPI chạy riêng trên host**.

- APISIX chịu trách nhiệm routing/proxy (`8002:9080`) và được chạy bằng `docker compose`
- FastAPI auth service chịu trách nhiệm auth business logic + forward-auth endpoint (`/auth/forward-auth`) và chạy riêng trên host ở `:8008`
- Hỗ trợ SSE cho luồng `/agent/stream`
- APISIX cũng trả trực tiếp `/` và `/health` bằng cấu hình YAML

## Tổng quan kiến trúc

- Gateway Data Plane: APISIX standalone đọc cấu hình từ `apisix/conf/apisix.yaml`
- Authentication: JWT access token + refresh token
- Authorization: APISIX `forward-auth` plugin gọi `GET /auth/forward-auth`
- JWT cache: in-memory TTL cache trong auth service middleware
- Routing: APISIX proxy request đến các service downstream
  - Auth service: `host.docker.internal:8008`
  - Agent service: `AGENT_UPSTREAM_ADDR` (mặc định `host.docker.internal:8080`)
  - Knowledge service: `KNOWLEDGE_UPSTREAM_ADDR` (mặc định `host.docker.internal:8000`)
  - Wayfinder service: `WAYFINDER_UPSTREAM_ADDR` (mặc định `host.docker.internal:8001`)
  - Dashboard service: `DASHBOARD_UPSTREAM_ADDR` (mặc định `host.docker.internal:8010`)
  - Voice service: `VOICE_UPSTREAM_ADDR` (mặc định `host.docker.internal:7860`)

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

- `AGENT_SERVICE_URL` (default đã có giá trị phù hợp cho local dev)
- `KNOWLEDGE_SERVICE_URL` (default đã có giá trị phù hợp cho local dev)
- `WAYFINDER_SERVICE_URL` (default đã có giá trị phù hợp cho local dev)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`


### 3. Run auth service on host

Mở một terminal riêng và chạy auth service FastAPI trên host:

```bash
cd api_gateway
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8008
```

Auth service chạy tại `http://localhost:8008`
- Docs: `http://localhost:8008/docs`
- Health: `http://localhost:8008/health`

### 4. Run APISIX standalone gateway bằng Docker Compose

```bash
cd api_gateway
docker-compose up -d
```

Gateway chạy tại `http://localhost:8002`
Compose này chỉ chạy APISIX. Auth service và các service downstream chạy riêng trên máy host.

### 5. Kiểm tra routing

- Mở `http://localhost:8002`
- Gọi `GET /auth/me` qua gateway sau khi đăng nhập
- Gọi `POST /agent/invoke` và `POST /agent/stream` nếu agent service đã chạy trên host

## APISIX config files

- `apisix/conf/config.yaml`: bật standalone data plane với `config_provider: yaml`
- `apisix/conf/apisix.yaml`: toàn bộ routes/upstreams/plugins (`#END` bắt buộc ở cuối file)

Các điểm chính đã cấu hình:
- `forward-auth` cho protected routes (threads, kb, dashboard, protected agent/wayfinder, auth protected)
- SSE route `/agent/stream` với upstream read timeout dài (`3600s`)
- Header propagation từ auth service: `X-User-ID`, `X-User-Email`, `X-User-Roles`
- Inject `X-Internal-Secret` cho downstream internal services

## API endpoints

### System
- `GET /` - thông tin service do APISIX trả trực tiếp
- `GET /health` - health check do APISIX trả trực tiếp

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

- APISIX forward-auth sẽ gọi `http://host.docker.internal:8008/auth/forward-auth`
- Public auth endpoints như `/auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh` vẫn đi qua APISIX nhưng không cần forward-auth
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

### Test SSE token-by-token (kiểm tra gateway buffering)

1) Chạy mock SSE server (trả token theo từng nhịp):

```bash
cd api_gateway
uv run python scripts/mock_sse_server.py
```

Mock server mặc định chạy ở `http://localhost:18080`.

Nếu muốn test qua gateway ngay với cấu hình mặc định `AGENT_UPSTREAM_ADDR=host.docker.internal:8080`, chạy mock server ở port `8080`:

```bash
cd api_gateway
$env:MOCK_SSE_PORT=8080; uv run python scripts/mock_sse_server.py
```

2) Trỏ APISIX agent upstream về mock server (nếu cần):
- Set `AGENT_UPSTREAM_ADDR=host.docker.internal:18080` trong file env của APISIX
- Restart/reload APISIX để áp dụng cấu hình

3) Chạy test stream qua gateway và in từng token nhận được:

```bash
cd api_gateway
uv run python scripts/test_sse_stream_token_by_token.py --url http://localhost:8002/agent/stream --delay-sec 0.05 --repeat 200
```

Script sẽ in từng token kèm độ trễ giữa 2 token liên tiếp và summary cuối để nhận biết có dấu hiệu bị buffer hay không.

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

Dừng APISIX:

```bash
cd api_gateway
docker-compose down
```

Auth service đang chạy trên host thì dừng bằng `Ctrl + C` ở terminal đã chạy uvicorn.

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

