# API Gateway

API Gateway với JWT Authentication và OPA Authorization cho DATN Chatbot system.

## Kiến trúc

- **Authentication**: JWT tokens với refresh mechanism
- **Authorization**: OPA (Open Policy Agent) với RBAC policies
- **Caching**: Redis cho JWT validation và policy decisions
- **Routing**: Proxy requests đến agent-service và knowledge service

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Start Redis và OPA:
```bash
docker compose up -d
```

3. Setup database:
```bash
alembic upgrade head
```

4. Run gateway:
```bash
uv run uvicorn src.main:app --reload --port 8002
```

## Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login và nhận JWT tokens
- `POST /auth/refresh` - Refresh access token

### Proxy Routes
- `/agent/*` - Proxy đến agent-service (port 8080)
- `/kb/*` - Proxy đến knowledge service (port 8000)

## Environment Variables

Xem `.env.example` để biết các biến cần thiết.

## Testing

```bash
uv run pytest
```




# API Gateway Setup Guide

## Prerequisites

- Python 3.11+
- Docker & Docker Compose
- PostgreSQL client (optional)
- uv package manager

## Quick Start

### 1. Start Infrastructure Services

Khởi động Redis, OPA, và PostgreSQL bằng Docker Compose:

```bash
cd api_gateway
docker-compose up -d
```

### 2. Install Dependencies

```bash
cd api_gateway
uv sync
```

### 3. Configure Environment

Copy file `.env.example` sang `.env` và điều chỉnh nếu cần:
```bash
cp .env.example .env
```

Các biến quan trọng:
- `JWT_SECRET`: Đổi secret key trong production
- `DATABASE_URL`: Connection string đến PostgreSQL
- `REDIS_URL`: Connection string đến Redis
- `OPA_URL`: URL của OPA service

### 4. Run Database Migrations

```bash
alembic upgrade head
```

Lệnh này sẽ tạo các bảng: `users`, `roles`, `user_roles`, `resource_ownerships` và insert các default roles (admin, user, viewer, editor).

### 5. Start API Gateway

```bash
uv run uvicorn src.main:app --reload --port 8002
```

Gateway sẽ chạy tại: http://localhost:8002

- API Docs: http://localhost:8002/docs
- Health Check: http://localhost:8002/health

## Testing the Gateway

### 1. Register a User

```bash
curl -X POST http://localhost:8002/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "roles": ["user"]
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:8002/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

Response sẽ chứa `access_token` và `refresh_token`.

### 3. Access Protected Routes

Sử dụng access token để gọi các routes được bảo vệ:

```bash
curl -X GET http://localhost:8002/agent/threads \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Gateway sẽ:
1. Validate JWT token
2. Check authorization với OPA
3. Proxy request đến agent-service
4. Inject `X-User-ID`, `X-User-Email`, `X-User-Roles` headers

## Architecture

```
Client
  ↓
API Gateway (port 8002)
  ├─ JWT Authentication
  ├─ OPA Authorization
  ├─ Redis Cache
  ├─ Proxy to Agent Service (port 8080)
  └─ Proxy to Knowledge Service (port 9000)
```

## OPA Policies

OPA policies được định nghĩa trong `src/policies/rbac.rego`.

Test OPA policy:
```bash
curl -X POST http://localhost:8181/v1/data/authz/allow \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "user": {
        "id": "user-123",
        "roles": ["user"]
      },
      "resource": {
        "type": "thread",
        "id": "thread-456",
        "owner_id": "user-123"
      },
      "action": "invoke"
    }
  }'
```

## Database Schema

### Users Table
- `id`: UUID primary key
- `email`: Unique email
- `hashed_password`: Bcrypt hashed password
- `is_active`: Boolean flag
- `is_superuser`: Boolean flag
- `created_at`, `updated_at`: Timestamps

### Roles Table
- `id`: UUID primary key
- `name`: Role name (admin, user, viewer, editor)
- `description`: Role description

### UserRoles Junction Table
- `user_id`: Foreign key to users
- `role_id`: Foreign key to roles

### ResourceOwnerships Table
- `id`: UUID primary key
- `resource_type`: Type of resource (thread, document)
- `resource_id`: ID of resource
- `owner_id`: Foreign key to users

## Stopping Services

```bash
docker-compose down
```

Xóa volumes (data sẽ bị mất):
```bash
docker-compose down -v
```

## Troubleshooting

### Database Connection Error
Kiểm tra PostgreSQL đang chạy:
```bash
docker-compose ps postgres
```

### Redis Connection Error
Kiểm tra Redis đang chạy:
```bash
docker-compose ps redis
```

### OPA Not Responding
Kiểm tra OPA logs:
```bash
docker-compose logs opa
```

## Development

### Create New Migration
```bash
alembic revision --autogenerate -m "description"
```

### Reset Database
```bash
alembic downgrade base
alembic upgrade head
```

### Run Tests
```bash
uv run pytest
```

