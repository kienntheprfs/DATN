# API Gateway Setup Guide

## Overview

Current architecture:

- APISIX runs in Docker Compose and listens on `http://localhost:8002` (forwarded from `9080` in the container)
- FastAPI auth service runs separately on the host and listens on `http://localhost:8008`
- APISIX handles routing, `/`, `/health`, and forward-auth calls to the auth service
- The auth service handles JWT login, refresh, logout, threads, and ownership checks

This setup replaces the old custom gateway runtime. The gateway container no longer runs FastAPI, and the auth service is not part of the compose stack.

## Prerequisites

- Python 3.11+
- Docker and Docker Compose
- `uv`
- PostgreSQL reachable from the host, typically on `localhost:5433` for local development
- Downstream services running on the host, if you want to use `/agent`, `/kb`, `/wayfinder`, `/dashboard`, or `/voice`

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

Key variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`
- `INTERNAL_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### 3. Start PostgreSQL

If you already have a local PostgreSQL instance, use that instead. Otherwise, start one on the host, for example:

```bash
docker run -d \
  --name postgres-gateway \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=authdb \
  -p 5433:5432 \
  postgres:16-alpine
```

Use a `DATABASE_URL` like:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/authdb
```

### 4. Run migrations

```bash
cd api_gateway
uv run alembic upgrade head
```

### 5. Seed initial data

```bash
cd api_gateway
uv run python scripts/seed_data.py
```

### 6. Start the FastAPI auth service on the host

Open a separate terminal and run:

```bash
cd api_gateway
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8008
```

Auth service endpoints:

- Docs: `http://localhost:8008/docs`
- Health: `http://localhost:8008/health`

### 7. Start APISIX with Docker Compose

```bash
cd api_gateway
docker compose up -d
```

APISIX endpoints:

- Gateway: `http://localhost:8002`
- Root: `http://localhost:8002/`
- Health: `http://localhost:8002/health`

### 8. Verify the setup

```bash
curl http://localhost:8002/
curl http://localhost:8002/health
curl http://localhost:8008/health
```

## Request Flow

### Authentication flow

1. Client logs in against the auth service on `http://localhost:8008`
2. Auth service returns JWT access and refresh tokens
3. Client sends requests to APISIX on `http://localhost:8002`
4. APISIX calls `http://host.docker.internal:8008/auth/forward-auth` for protected routes
5. APISIX forwards the request to the correct upstream with auth headers

### System endpoints

These are served directly by APISIX:

- `GET /` - service information
- `GET /health` - gateway health check

## API Endpoints

### Auth service (`http://localhost:8008`)

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/revoke`
- `POST /auth/revoke-all`
- `GET /auth/forward-auth`

### Threads (`http://localhost:8002` through APISIX)

- `POST /threads`
- `GET /threads`
- `GET /threads/{thread_id}`
- `PATCH /threads/{thread_id}`
- `DELETE /threads/{thread_id}`

### Agent proxy (`http://localhost:8002` through APISIX)

- `POST /agent/invoke`
- `POST /agent/stream`
- `GET /agent/history/{thread_id}`
- `GET|POST|PUT|PATCH|DELETE /agent/{path:path}`

### Knowledge proxy (`http://localhost:8002` through APISIX)

- `GET|POST|PUT|PATCH|DELETE /kb/{path:path}`

### Wayfinder proxy (`http://localhost:8002` through APISIX)

- `GET|POST|PUT|PATCH|DELETE /wayfinder/{path:path}`

### Dashboard proxy (`http://localhost:8002` through APISIX)

- `GET|POST|PUT|PATCH|DELETE /dashboard/{path:path}`

### Voice proxy (`http://localhost:8002` through APISIX)

- `POST /voice/offer`
- `GET /voice/health`

## Authorization Flow

### 1. Login

```bash
curl -X POST http://localhost:8008/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin123"}'
```

### 2. Use JWT token

```bash
curl -X GET http://localhost:8002/threads \
  -H "Authorization: Bearer eyJ..."
```

### 3. Check forward-auth directly

```bash
curl -X GET http://localhost:8008/auth/forward-auth \
  -H "Authorization: Bearer eyJ..." \
  -H "X-Forwarded-Uri: /threads"
```

## Role-Based Access Control

| Role | Knowledge | Wayfinder | Agent Invoke | Agent History | Thread CRUD |
|------|-----------|-----------|--------------|---------------|-------------|
| Admin | Full | Full | All | All | All |
| User | 403 | 403 | Public | Own | Own |
| Guest | 401 | 401 | Public | 401 | 401 |

## Development

### Run the auth service only

```bash
cd api_gateway
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8008
```

### Run APISIX only

```bash
cd api_gateway
docker compose up -d
```

### Stop APISIX

```bash
cd api_gateway
docker compose down
```

### Stop the auth service

Press `Ctrl + C` in the terminal running `uvicorn`.

### Database migration commands

```bash
cd api_gateway
uv run alembic revision --autogenerate -m "description"
uv run alembic upgrade head
uv run alembic downgrade -1
```

### Testing

```bash
cd api_gateway
uv run pytest
uv run scripts/test_all_endpoints.py
```

## Configuration Reference

### Environment variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/authdb

# JWT
JWT_SECRET=your-secret-key-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Internal security
INTERNAL_SECRET=your-internal-secret

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Application
APP_NAME=API Gateway
APP_VERSION=0.1.0
DEBUG=false
API_GATEWAY_HOST=0.0.0.0
API_GATEWAY_PORT=8008
```

### APISIX environment variables

When running via Compose, APISIX uses:

- `AUTH_SERVICE_URL=http://host.docker.internal:8008`
- `AUTH_UPSTREAM_ADDR=host.docker.internal:8008`
- `AGENT_UPSTREAM_ADDR=host.docker.internal:8080`
- `KNOWLEDGE_UPSTREAM_ADDR=host.docker.internal:8000`
- `WAYFINDER_UPSTREAM_ADDR=host.docker.internal:8001`
- `DASHBOARD_UPSTREAM_ADDR=host.docker.internal:8010`
- `VOICE_UPSTREAM_ADDR=host.docker.internal:7860`

## Troubleshooting

### APISIX cannot reach auth service

- Confirm the auth service is running on `http://localhost:8008`
- Confirm `host.docker.internal` resolves inside the APISIX container
- On Linux, make sure Docker is configured to support host gateway access

### Database connection issues

- Confirm PostgreSQL is running on `localhost:5433`
- Confirm `DATABASE_URL` points to the correct host and port
- Run `uv run alembic upgrade head` again after fixing the DB connection

### Gateway health check fails

- Check `http://localhost:8002/health`
- Check APISIX container logs with `docker compose logs -f apisix`

### Auth docs not available

- Check `http://localhost:8008/docs`
- If docs fail, confirm the auth service started successfully and imports are valid

## Support

Useful URLs:

1. APISIX gateway: `http://localhost:8002`
2. APISIX health: `http://localhost:8002/health`
3. Auth service docs: `http://localhost:8008/docs`
4. Auth service health: `http://localhost:8008/health`