# API Gateway Setup Guide

## Overview

Simplified API Gateway with JWT authentication and Python-based authorization (no OPA, optional Redis).

**Architecture:**
- **Authentication**: JWT tokens with in-memory cache
- **Authorization**: Python decorators (@require_roles, @require_ownership)
- **Database**: PostgreSQL with SQLModel (SQLAlchemy + Pydantic)
- **Roles**: Admin (full access), User (own resources), Guest (temporary)

## Prerequisites

- Python 3.11+
- PostgreSQL 12+
- uv (Python package manager) or pip

## Quick Start

### 1. Start PostgreSQL

```bash
cd api_gateway

# Using docker-compose (recommended)
docker-compose up -d

# Or manually with docker
docker run -d \
  --name postgres-gateway \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=authdb \
  -p 5433:5432 \
  postgres:15-alpine

# Or connect to existing PostgreSQL instance
# Update DATABASE_URL in step 3 below
```

### 2. Install Dependencies

```bash
cd api_gateway

# Using uv (recommended)
uv sync

# Or using pip
pip install -e .
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/authdb
# JWT_SECRET=your-secret-key-change-this-in-production
# INTERNAL_SECRET=your-internal-secret-for-service-to-service-auth
```

### 4. Run Migrations

```bash
# Apply database migrations
uv run alembic upgrade head

# Verify migrations
uv run alembic current
```

### 5. Seed Initial Data

```bash
# Create default roles (admin, user, guest) and admin user
uv run python scripts/seed_data.py

# Follow prompts to set admin email/password
# Default: admin@example.com / admin123
```

### 6. Start API Gateway

```bash
# Development mode (hot reload)
uv run uvicorn src.main:app --reload --port 8002

# Production mode
uv run uvicorn src.main:app --host 0.0.0.0 --port 8002
```

### 7. Access Swagger UI

Open browser: http://localhost:8002/docs

## API Endpoints

### Public Endpoints (No Auth)

- `POST /auth/login` - Login with email/password
- `POST /auth/register` - Register new user
- `POST /auth/refresh` - Refresh access token
- `GET /health` - Health check

### Guest Endpoints (Optional Auth)

- `POST /agent/invoke` - Invoke agent (works without JWT)

### User Endpoints (Auth Required)

- `GET /threads` - List user's threads
- `POST /threads` - Create new thread
- `GET /threads/{id}` - Get thread details (ownership check)
- `PATCH /threads/{id}` - Update thread (ownership check)
- `DELETE /threads/{id}` - Delete thread (ownership check)
- `GET /agent/history/{thread_id}` - Get thread history (ownership check)

### Admin Endpoints (Admin Role Required)

- `GET /kb/*` - Knowledge service (all operations)
- `POST /kb/*` - Knowledge service (all operations)
- `GET /wayfinder/*` - Wayfinder service (all operations)
- `POST /wayfinder/*` - Wayfinder service (all operations)

## Authorization Flow

### 1. Login

```bash
curl -X POST http://localhost:8002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}'

# Response: {"access_token": "eyJ...", "refresh_token": "eyJ...", ...}
```

### 2. Use JWT Token

```bash
# Add Bearer token to Authorization header
curl -X GET http://localhost:8002/threads \
  -H "Authorization: Bearer eyJ..."
```

### 3. Guest Mode (No JWT)

```bash
# Works without Authorization header
curl -X POST http://localhost:8002/agent/invoke \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'
```

## Role-Based Access Control (RBAC)

| Role | Knowledge | Wayfinder | Agent Invoke | Agent History | Thread CRUD |
|------|-----------|-----------|--------------|---------------|-------------|
| **Admin** | ✅ Full | ✅ Full | ✅ All | ✅ All | ✅ All |
| **User** | ❌ 403 | ❌ 403 | ✅ Public | ✅ Own | ✅ Own |
| **Guest** | ❌ 401 | ❌ 401 | ✅ Public | ❌ 401 | ❌ 401 |

> **Note**: `/agent/invoke` is public endpoint—no JWT required, works in guest mode

## Development

### Database Migrations

```bash
# Create new migration
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head

# Rollback one version
uv run alembic downgrade -1

# Show migration history
uv run alembic history
```

### Testing

```bash
# Run unit tests
uv run pytest tests/

# Run with coverage
uv run pytest --cov=src --cov-report=html

# Run specific test file
uv run pytest tests/test_decorators.py
```

### Code Quality

```bash
# Format code (if using ruff)
uv run ruff format src/

# Lint code
uv run ruff check src/
```

## Deployment

### Using Docker

```bash
# Build image
docker build -f docker/Dockerfile -t api-gateway:latest .

# Run container
docker run -d \
  --name api-gateway \
  -p 8002:8002 \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... \
  api-gateway:latest
```

### Using Docker Compose

```bash
# Start all services (PostgreSQL + API Gateway)
docker compose up -d

# View logs
docker compose logs -f api-gateway

# Stop services
docker compose down
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -p 5433 -U postgres -d authdb

# Verify migrations
uv run alembic current
```

### Database URL Compatibility

**Issue**: `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgres`

**Cause**: DATABASE_URL uses `postgres://` scheme instead of `postgresql://`

**Solution**: API Gateway auto-normalizes URL schemes:
```bash
# Both work fine (gateway converts postgres:// to postgresql://)
DATABASE_URL=postgres://user:pass@host:port/dbname
DATABASE_URL=postgresql://user:pass@host:port/dbname
```

### asyncpg SSL Parameter Issue

**Issue**: `TypeError: connect() got an unexpected keyword argument 'sslmode'`

**Cause**: Cloud databases (Aiven, AWS RDS) use `sslmode` parameter, but asyncpg driver expects `ssl`

**Solution**: Gateway auto-converts query parameters:
```bash
# This works - gateway converts sslmode=require to ssl=require for asyncpg
DATABASE_URL=postgresql://... ?sslmode=require
```

**How it works**:
- Runtime uses asyncpg (async driver) + auto-converts `sslmode` → `ssl`
- Migrations use psycopg2 (sync driver) + keeps `sslmode` parameter

### JWT Token Issues

```bash
# Verify JWT_SECRET is set in .env
cat .env | grep JWT_SECRET

# Check token expiration
# Access tokens expire after 15 minutes (default)
# Refresh tokens expire after 7 days (default)
```

### Authorization Errors

- **401 Unauthorized**: Missing or invalid JWT token
- **403 Forbidden**: User doesn't have required role or ownership
- **404 Not Found**: Resource not found

### Seed Script Fails

**Issue**: `seed_data.py` fails with database errors

**Debug**:
```bash
# Verify database connection
uv run python -c "from src.config import settings; print(settings.database_url_async)"

# Run seed with debugging
uv run python scripts/seed_data.py
```

## Architecture Comparison

### Before (Complex)
- Components: Gateway + OPA + Redis + PostgreSQL
- Authorization: REST API calls to OPA (Rego policies)
- Latency: ~10ms per authorization check

### After (Simplified)
- Components: Gateway + PostgreSQL + in-memory cache
- Authorization: Python decorators (in-process)
- Latency: <1ms per authorization check

**Benefits:**
- ✅ 70% less code
- ✅ 2 fewer containers (OPA, Redis)
- ✅ 10x faster authorization
- ✅ Easier to debug (Python vs Rego)
- ✅ Simpler deployment

## Configuration Reference

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:port/dbname

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Services
AGENT_SERVICE_URL=http://localhost:8080
KNOWLEDGE_SERVICE_URL=http://localhost:8000
WAYFINDER_SERVICE_URL=http://localhost:8001

# Internal Security
INTERNAL_SECRET=your-internal-secret

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:8501

# Application
APP_NAME=API Gateway
APP_VERSION=0.1.0
DEBUG=false
API_GATEWAY_HOST=0.0.0.0
API_GATEWAY_PORT=8002
```

## Best Practices

### Security

1. **Change default secrets** in production
2. **Use HTTPS** in production (TLS termination at load balancer)
3. **Rotate JWT secrets** periodically
4. **Set short token expiration** (15 min for access token)
5. **Validate internal secret** in downstream services

### Performance

1. **Use connection pooling** (SQLAlchemy default)
2. **Enable database indexes** (user_id, created_at)
3. **Monitor JWT cache hit rate** (cachetools TTLCache)
4. **Scale horizontally** (stateless JWT design)

### Monitoring

1. **Log authentication failures** (security audit)
2. **Track authorization denials** (403 errors)
3. **Monitor endpoint latency** (p50, p95, p99)
4. **Alert on database connection errors**

## Support

For issues or questions:
1. Check Swagger UI: http://localhost:8002/docs
2. Review logs: `docker compose logs -f api-gateway`
3. Check database: `psql -h localhost -p 5433 -U postgres -d authdb`
