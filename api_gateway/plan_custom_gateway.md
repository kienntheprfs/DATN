# Plan: API Gateway với JWT + OPA Authorization (Horizontal Scaling)

**TL;DR:** Tạo dịch vụ API Gateway riêng biệt trong `api_gateway/` làm điểm vào duy nhất, xử lý authentication (JWT) và authorization (OPA policy engine), định tuyến requests đến agent-service và knowledge service. Sử dụng RBAC pattern đơn giản trước, thiết kế migration path sang ReBAC sau. Redis cluster cho distributed caching, stateless design cho horizontal scaling hiệu quả.

## Steps

### 1. Tạo API Gateway service architecture
Khởi tạo `api_gateway/` với FastAPI, cấu trúc: `api_gateway/src/main.py`, `api_gateway/src/auth/` (JWT logic), `api_gateway/src/routes/` (routing), `api_gateway/src/policies/` (OPA Rego files); thêm Redis client, OPA SDK, httpx proxy client vào `api_gateway/pyproject.toml`.

### 2. Implement JWT authentication layer
Tạo `api_gateway/src/auth/jwt_handler.py` với `create_access_token()`, `decode_token()`, `refresh_token()` sử dụng PyJWT; `api_gateway/src/auth/password.py` dùng passlib bcrypt; endpoints `/auth/register`, `/auth/login`, `/auth/refresh` trả về JWT; pydantic validators cho token claims.

### 3. Integrate OPA policy engine
Deploy OPA container trong Docker Compose; gateway gọi OPA REST API (`POST /v1/data/authz/allow`) với input {user, resource, action}; viết RBAC policies trong `api_gateway/src/policies/rbac.rego` định nghĩa roles (admin, user, viewer) và permissions cho threads/documents.

### 4. Build unified user/role schema
Tạo shared database schema: User (id, email, hashed_password, is_active, created_at), Role (id, name, description), UserRole (user_id, role_id); ResourceOwnership (resource_type, resource_id, owner_id) cho extensibility; Alembic migrations trong `api_gateway/alembic/`.

### 5. Implement request routing middleware
Middleware trong `api_gateway/src/middleware/auth_middleware.py`: extract JWT → validate → cache JWT (Redis) → inject user info to request state; Authorization helper trong `api_gateway/src/auth/authorization.py`: call OPA → cache decision (Redis 5min TTL) → raise 403 if denied; Proxy middleware trong `api_gateway/src/middleware/proxy_middleware.py`: proxy request đến agent-service (8080) hoặc knowledge (9000) via httpx → inject `X-User-ID`, `X-User-Email`, `X-User-Roles`, `X-Internal-Secret` headers → forward response.

### 6. Setup Redis distributed cache
Thêm Redis cluster vào `compose.yaml`; cache JWT validation results (key: `jwt:{token_hash}`, TTL: token expiration); cache OPA policy decisions (key: `policy:{user_id}:{resource}:{action}`, TTL: 5min); implement cache invalidation khi roles thay đổi.

### 7. Configure horizontal scaling
Stateless gateway design (no session state, JWT self-contained); Docker Compose scale: `docker compose up --scale api_gateway=3`; Nginx load balancer upstream đến multiple gateway instances; shared Redis cho consistency; health checks tại `/health`.

## Further Considerations

### 1. OPA vs OSO Trade-offs
**OPA advantages**: CNCF graduated project (production-proven), REST API dễ scale horizontally, Rego language declarative (policy-as-code), bundle distribution cho offline evaluation (ultra low latency), CLI/testing toolkit mạnh. 

**OSO advantages**: Python-native (DX tốt hơn), policy logic gần code hơn. 

**Recommendation: Chọn OPA** vì horizontal scaling requirement, REST API dễ cache/proxy, và Rego policies có thể version control + CI/CD.

### 2. RBAC → ReBAC Migration Path
Bắt đầu với RBAC đơn giản: roles = {admin, editor, viewer}, permissions cứng trong Rego. Sau khi stable, thêm ReBAC bằng cách: (a) thêm bảng ResourceRelation (subject_id, relation, object_id) như "user1 owns thread123", (b) mở rộng Rego policies với graph traversal logic, (c) OPA built-in `walk()` function hỗ trợ relationship queries. **Không cần viết lại toàn bộ**, chỉ thêm rules mới.

### 3. Redis Cluster vs Single Node
Single Redis cho prototype (đơn giản), Redis Sentinel cho HA (auto-failover), Redis Cluster cho sharding (>100GB data hoặc >100k req/s). **Khuyến nghị**: Bắt đầu với Redis Sentinel (3 nodes) cho balance giữa complexity và availability.

### 4. Service-to-Service Authentication
Downstream services (agent/knowledge) nên trust gateway's injected headers (`X-User-ID`) nhưng verify: thêm internal API key (`X-Internal-Secret`) chỉ gateway biết; hoặc dùng mTLS giữa gateway ↔ services cho security cao hơn.

### 5. Rate Limiting Strategy
Implement tại gateway layer: per-user limits (Redis counters, sliding window 100 req/min), per-IP limits (DDoS protection), per-endpoint limits; dùng thư viện `slowapi` hoặc custom middleware.

### 6. OPA Bundle vs REST API
Development: OPA REST API (live policy updates). Production: OPA bundle mode (policies pre-compiled, load từ S3/file, ~1ms latency vs ~5-10ms REST). Implement both modes với feature flag.

### 7. Monitoring & Observability
Gateway metrics: request rate, auth success/failure, OPA decision latency, Redis hit ratio; export Prometheus metrics tại `/metrics`; distributed tracing (OpenTelemetry) với trace IDs xuyên suốt gateway → agent → knowledge.

### 8. Authorization Flow Implementation
**Route-level authorization**: Mỗi proxy route (agent_proxy, knowledge_proxy) extract resource info từ path (thread_id, doc_id) và determine action dựa trên HTTP method (GET=read, POST=invoke/create, PUT/PATCH=update, DELETE=delete). Call `check_authorization()` helper trước khi proxy request. **Error responses**: 401 Unauthorized nếu JWT missing/invalid/expired; 403 Forbidden nếu OPA policy deny với detail message "Insufficient permissions to {action} {resource_type}". **Caching**: Policy decisions cached trong Redis với key pattern `policy:{user_id}:{resource_type}:{resource_id}:{action}`, TTL 5 phút.

## Kiến trúc Microservices với API Gateway

```mermaid
sequenceDiagram
    participant Client as Streamlit UI<br/>(Port 8501)
    participant Gateway as API Gateway<br/>(Port 8002)<br/>Stateless + Scalable
    participant Redis as Redis Cluster<br/>(Cache Layer)
    participant OPA as OPA Engine<br/>(Policy Decision)
    participant Auth_DB as Auth Database<br/>(PostgreSQL)
    participant Agent as Agent Service<br/>(Port 8080)
    participant KB as Knowledge Service<br/>(Port 9000)

    Note over Client,KB: 1. Initial Authentication Flow

    Client->>Gateway: POST /auth/login<br/>{email, password}
    Gateway->>Auth_DB: Query user credentials
    Auth_DB-->>Gateway: User + roles returned
    Gateway->>Gateway: Validate password (bcrypt)<br/>Generate JWT tokens
    Gateway-->>Client: {access_token, refresh_token}<br/>TTL: 15min / 7days

    Note over Client,KB: 2. Authorized Request Flow (Thread Invocation)

    Client->>Gateway: POST /agent/invoke<br/>Header: Bearer {jwt}<br/>Body: {thread_id, message}
    
    alt JWT Cached in Redis
        Gateway->>Redis: GET jwt:{hash}
        Redis-->>Gateway: {user_id, roles, exp}
    else JWT Not Cached
        Gateway->>Gateway: Decode & validate JWT<br/>(pydantic validator)
        Gateway->>Redis: SETEX jwt:{hash} {claims}
    end

    Gateway->>Redis: GET policy:{user_id}:thread:{thread_id}:invoke
    
    alt Policy Decision Cached
        Redis-->>Gateway: cached_decision = allow/deny
    else Policy Decision Not Cached
        Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {id, roles},<br/>resource: {type: "thread", id},<br/>action: "invoke"}
        OPA->>OPA: Evaluate RBAC Rego rules:<br/>- admin role → allow all<br/>- user role → allow own threads<br/>- viewer role → deny write
        OPA-->>Gateway: {"result": {"allow": true}}
        Gateway->>Redis: SETEX policy:{key} true (5min)
    end

    alt Authorization Denied
        Gateway-->>Client: 403 Forbidden<br/>{error: "insufficient permissions"}
    else Authorization Allowed
        Gateway->>Agent: POST /invoke<br/>Headers: X-User-ID, X-User-Roles,<br/>X-Internal-Secret<br/>Body: {thread_id, message}
        Agent->>Agent: Process LangGraph agent
        Agent-->>Gateway: {type: "ai", content: "..."}
        Gateway-->>Client: 200 OK + response
    end

    Note over Client,KB: 3. Document Access Flow (Knowledge Service)

    Client->>Gateway: GET /kb/documents/{doc_id}<br/>Header: Bearer {jwt}
    Gateway->>Redis: Check JWT cache
    Gateway->>Redis: GET policy:{user_id}:document:{doc_id}:read
    
    alt Policy Decision Not Cached
        Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {id, roles},<br/>resource: {type: "document", id},<br/>action: "read"}
        OPA->>OPA: Evaluate RBAC Rego rules:<br/>- admin role → allow all<br/>- viewer role → allow read<br/>- user role → check ownership
        OPA-->>Gateway: {"result": {"allow": true/false}}
        Gateway->>Redis: SETEX policy:{key} result (5min)
    end

    alt Authorization Denied
        Gateway-->>Client: 403 Forbidden<br/>{error: "Insufficient permissions to read document"}
    else Authorization Allowed
        Gateway->>KB: GET /documents/{doc_id}<br/>Headers: X-User-ID, X-User-Roles,<br/>X-Internal-Secret
        KB->>KB: Return document data
        KB-->>Gateway: Document content
        Gateway-->>Client: 200 OK + document
    end

    Note over Client,KB: 4. Horizontal Scaling (Multiple Gateway Instances)

    rect rgb(240, 248, 255)
        Note over Gateway: Load Balancer<br/>(Nginx/Traefik)<br/>distributes requests
        Note over Gateway: Gateway Instance 1 ←<br/>Gateway Instance 2 ←<br/>Gateway Instance 3
        Note over Redis: Shared state ensures<br/>consistent auth decisions<br/>across all instances
    end

    Note over Client,KB: 5. Future: RBAC → ReBAC Migration

    Client->>Gateway: POST /threads/{id}/share<br/>{share_with_user_id}
    Gateway->>OPA: Check ownership relation
    Note over OPA: Evaluate ReBAC rules:<br/>user owns thread OR<br/>thread shared_with user
    OPA-->>Gateway: allow
    Gateway->>Auth_DB: INSERT ResourceRelation<br/>(user_id, "can_read", thread_id)
    Gateway-->>Client: 200 OK shared
```

## Cấu trúc Folder API Gateway

```
api_gateway/
├── pyproject.toml              # FastAPI, PyJWT, redis, httpx, email-validator
├── alembic.ini
├── .env                        # JWT_SECRET, REDIS_URL, OPA_URL, DB_URL
├── docker-compose.yml          # Redis, OPA, PostgreSQL services
├── docker/
│   └── Dockerfile
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_migration.py
└── src/
    ├── main.py                 # FastAPI app entry point
    ├── config.py               # Settings (pydantic-settings)
    ├── dependencies.py         # Dependency injection
    ├── shared/
    │   └── auth/               # Shared auth modules
    │       ├── jwt_handler.py  # JWT encode/decode/refresh
    │       ├── password.py     # SHA256 + bcrypt hashing
    │       └── dependencies.py # get_current_user()
    ├── auth/
    │   └── authorization.py    # OPA authorization check helper
    ├── middleware/
    │   ├── auth_middleware.py  # Extract & validate JWT
    │   └── proxy_middleware.py # Route to downstream services
    ├── routes/
    │   ├── auth.py             # /auth/login, /register, /refresh
    │   ├── agent_proxy.py      # /agent/* → agent-service:8080 (with authz)
    │   └── knowledge_proxy.py  # /kb/* → knowledge:9000 (with authz)
    ├── models/
    │   └── __init__.py         # User, Role, UserRole, ResourceOwnership
    ├── schemas/
    │   ├── auth.py             # LoginRequest, TokenResponse (pydantic)
    │   └── user.py             # UserCreate, UserRead
    ├── services/
    │   ├── auth_service.py     # Business logic: register, login
    │   ├── opa_service.py      # OPA client wrapper
    │   └── cache_service.py    # Redis operations
    ├── policies/                # OPA Rego policies
    │   ├── rbac.rego           # RBAC rules (implemented)
    │   └── rebac.rego          # ReBAC rules (future migration)
    └── utils/
        └── cache_keys.py       # Cache key generation helpers
```

## Cập nhật Docker Compose

```yaml
services:
  # New API Gateway Service
  api_gateway:
    build:
      context: ./api_gateway
      dockerfile: docker/Dockerfile
    ports:
      - "8002:8002"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/authdb
      - REDIS_URL=redis://redis:6379/0
      - OPA_URL=http://opa:8181
      - AGENT_SERVICE_URL=http://agent_service:8080
      - KNOWLEDGE_SERVICE_URL=http://knowledge:9000
      - JWT_SECRET=${JWT_SECRET}
      - JWT_ALGORITHM=HS256
      - ACCESS_TOKEN_EXPIRE_MINUTES=15
    depends_on:
      - postgres
      - redis
      - opa
    deploy:
      replicas: 3  # Horizontal scaling

  # Redis Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  # OPA Policy Engine
  opa:
    image: openpolicyagent/opa:latest
    ports:
      - "8181:8181"
    volumes:
      - ./api_gateway/src/policies:/policies:ro
    command:
      - "run"
      - "--server"
      - "--addr=0.0.0.0:8181"
      - "/policies"

  # Existing services (no public ports, accessed via gateway)
  agent_service:
    build:
      context: ./agent-service-toolkit
    expose:
      - "8080"  # Internal only
    environment:
      - AUTH_DISABLED=true  # Gateway handles auth
      - ACCEPT_INTERNAL_SECRET=true

  knowledge:
    build:
      context: ./knowledge
    expose:
      - "9000"
    environment:
      - AUTH_DISABLED=true

  streamlit_app:
    ports:
      - "8501:8501"
    environment:
      - GATEWAY_URL=http://api_gateway:8002  # Point to gateway

volumes:
  redis_data:
```

## Sample RBAC Policy (Rego)

```rego
# api_gateway/src/policies/rbac.rego
package authz

import future.keywords.if
import future.keywords.in

# Default deny
default allow := false

# Admin role allows everything
allow if {
    input.user.roles[_] == "admin"
}

# User role can invoke threads they own
allow if {
    input.user.roles[_] == "user"
    input.action == "invoke"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# User role can read own threads
allow if {
    input.user.roles[_] == "user"
    input.action == "read"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# Viewer role can only read documents
allow if {
    input.user.roles[_] == "viewer"
    input.action == "read"
    input.resource.type == "document"
}

# Migration path: Add ReBAC rules later without breaking existing RBAC
# Future: Check ResourceRelation table for "shared_with" relationships
```

## Performance Benchmark Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| **JWT validation** | <5ms | Redis cache (100% hit ratio for active tokens) |
| **OPA policy decision** | <10ms | Redis cache (5min TTL) + OPA bundle mode |
| **Gateway overhead** | <20ms | Async httpx proxy, connection pooling |
| **Cache invalidation** | <1s | Pub/sub events when roles change |
| **Horizontal scale** | Linear to 10+ instances | Stateless design, shared Redis |

## RBAC → ReBAC Migration Example

### Phase 1 (RBAC): Roles cứng
```rego
allow if input.user.roles[_] == "editor"
```

### Phase 2 (ReBAC): Thêm relationships
```rego
allow if {
    relation := data.relations[_]
    relation.subject_id == input.user.id
    relation.object_id == input.resource.id
    relation.relation == "can_edit"
}
```

### Database schema mở rộng
```sql
CREATE TABLE resource_relations (
    subject_id UUID,
    relation VARCHAR(50),  -- "owns", "can_read", "can_edit", "shared_with"
    object_id UUID,
    resource_type VARCHAR(50)
);
```

## Implementation Checklist

- [x] Setup api_gateway/ folder structure
- [x] Install dependencies (PyJWT, redis, httpx, email-validator)
- [x] Create User/Role SQLAlchemy models
- [x] Write Alembic migrations
- [x] Implement JWT handler (create/decode/refresh)
- [x] Implement password hashing (SHA256 + bcrypt)
- [x] Create auth endpoints (/login, /register, /refresh)
- [x] Write RBAC Rego policies
- [x] Deploy OPA container (docker-compose)
- [x] Setup Redis cache service (docker-compose)
- [x] Implement auth middleware (JWT extraction & validation)
- [x] Implement OPA authorization checks (check_policy helper)
- [x] Build proxy middleware for routing
- [x] Add request/response caching (JWT + policy decisions)
- [x] Inject X-User-ID headers to downstream
- [x] Configure Docker Compose with Redis, OPA, PostgreSQL
- [x] Add health check endpoints
- [ ] Add authorization checks in proxy routes (403 on deny)
- [ ] Update downstream services to accept internal headers
- [ ] Implement rate limiting
- [ ] Add Prometheus metrics
- [ ] Setup load balancer (Nginx/Traefik)
- [ ] Test horizontal scaling (3+ instances)
- [ ] Document API endpoints
- [ ] Write integration tests
