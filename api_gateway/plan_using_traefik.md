# Plan: Traefik Gateway + Auth Service với JWT + OPA Authorization

**TL;DR:** Sử dụng **Traefik** làm API Gateway (routing, load balancing, TLS) kết hợp với **Auth Service** chuyên biệt (JWT + OPA) thông qua **ForwardAuth pattern**. Traefik xử lý infrastructure concerns, Auth Service focus vào authentication/authorization logic. RBAC đơn giản trước, migration path sang ReBAC sau. Redis distributed cache, stateless design cho horizontal scaling.

## Architecture Philosophy

**Tránh reinvent the wheel**: Thay vì tự implement API Gateway (routing, load balancing, circuit breaker,...), leverage Traefik industry-standard và chỉ build Auth Service nhỏ gọn, focused.

**Separation of Concerns**:
- **Traefik**: Routing, load balancing, TLS termination, rate limiting, metrics, service discovery
- **Auth Service**: JWT validation, OPA policy evaluation, user management
- **Agent/Knowledge Services**: Business logic (không lo auth)

## Steps

### 1. Setup Traefik as API Gateway
Deploy Traefik container trong Docker Compose với Docker provider; config entrypoints (HTTP/HTTPS), enable dashboard và Prometheus metrics; define ForwardAuth middleware trỏ đến Auth Service `/verify` endpoint; service discovery tự động qua Docker labels.

### 2. Create Auth Service (focused microservice)
Khởi tạo `auth_service/` với FastAPI, cấu trúc nhỏ gọn: `auth_service/src/main.py`, `auth_service/src/routes/auth.py` (login/register), `auth_service/src/routes/verify.py` (ForwardAuth endpoint), `auth_service/src/services/` (JWT, OPA, cache); **KHÔNG** cần routing/proxy logic.

### 3. Implement JWT authentication
Tạo `auth_service/src/services/jwt_service.py` với `create_access_token()`, `decode_token()`, `refresh_token()` sử dụng PyJWT; `auth_service/src/services/password_service.py` dùng passlib bcrypt; endpoints `/auth/login`, `/auth/register`, `/auth/refresh` trả về JWT; pydantic validators cho token claims.

### 4. Implement ForwardAuth endpoint
Tạo `GET /verify` endpoint nhận headers từ Traefik (`Authorization`, `X-Forwarded-Uri`, `X-Forwarded-Method`); validate JWT (check Redis cache trước); extract resource từ URI; gọi OPA để authorize; cache decision; return 200 + headers (`X-User-ID`, `X-User-Roles`) nếu allowed, 403 nếu denied.

### 5. Integrate OPA policy engine
Deploy OPA container; Auth Service gọi OPA REST API (`POST /v1/data/authz/allow`) với input {user, resource, action}; viết RBAC policies trong `auth_service/src/policies/rbac.rego` định nghĩa roles (admin, user, viewer) và permissions cho threads/documents; cache policy decisions trong Redis (5min TTL).

### 6. Build unified user/role schema
Tạo database schema: User (id, email, hashed_password, is_active, created_at), Role (id, name, description), UserRole (user_id, role_id); ResourceOwnership (resource_type, resource_id, owner_id) cho extensibility; Alembic migrations trong `auth_service/alembic/`.

### 7. Configure Traefik routing with Docker labels
Add labels vào agent_service và knowledge_service trong Docker Compose: `traefik.http.routers.{service}.rule`, `traefik.http.routers.{service}.middlewares=auth-check`; Traefik tự động discover services và apply ForwardAuth middleware; inject headers vào downstream services.

### 8. Setup Redis distributed cache
Redis container trong Docker Compose; Auth Service cache JWT validation (key: `jwt:{token_hash}`, TTL: token expiration) và OPA decisions (key: `policy:{user_id}:{resource}:{action}`, TTL: 5min); pub/sub cho cache invalidation khi roles thay đổi.

### 9. Configure horizontal scaling
Traefik scale: multiple Traefik instances với shared config; Auth Service scale: `docker compose up --scale auth_service=3`, stateless design (JWT self-contained, shared Redis); agent/knowledge services cũng scale independently; Traefik load balance tự động.

## Architecture Comparison

### ❌ Custom Gateway Approach (Reinventing Wheel)
```
Client → Custom API Gateway (FastAPI) → Agent/Knowledge
         └─ Routing logic (manual)
         └─ Load balancing (manual)
         └─ Auth logic (manual)
         └─ Metrics (manual)
```

### ✅ Traefik + Auth Service (Best Practice)
```
Client → Traefik Gateway → Auth Service (/verify) → Agent/Knowledge
         │                  └─ JWT + OPA
         └─ Routing (automatic via labels)
         └─ Load balancing (built-in)
         └─ Metrics (Prometheus)
         └─ Dashboard (built-in)
```

## Further Considerations

### 1. Why Traefik over Custom Gateway?

| Feature | Custom Gateway | Traefik + Auth Service |
|---------|----------------|------------------------|
| **Routing** | Manual implementation | ✅ Dynamic via Docker labels |
| **Load Balancing** | Manual (httpx retry) | ✅ Round-robin, weighted, sticky |
| **TLS Termination** | Manual (uvicorn SSL) | ✅ Auto Let's Encrypt |
| **Service Discovery** | Hard-coded URLs | ✅ Docker provider auto-detect |
| **Circuit Breaker** | Manual | ✅ Built-in middleware |
| **Rate Limiting** | Custom code | ✅ RateLimit middleware |
| **Metrics** | Manual Prometheus | ✅ Native Prometheus export |
| **Dashboard** | Need to build | ✅ Web UI included |
| **Maintenance** | High (custom code) | **Low (config only)** |
| **Auth Logic** | ✅ Full control | ✅ Full control (Auth Service) |

**Verdict**: Traefik handles infrastructure, Auth Service handles business logic. **Không cần reinvent routing/LB/metrics**.

### 2. Traefik vs Kong vs Nginx

| Feature | Traefik | Kong | Nginx + lua |
|---------|---------|------|-------------|
| **ForwardAuth** | ✅ Native | ✅ Plugin | ✅ auth_request |
| **Docker Discovery** | ✅ Excellent | ⚠️ Manual | ❌ Config files |
| **Config Method** | Labels/YAML | API/YAML | Config files |
| **Dashboard** | ✅ Free | 💰 Paid (Konnect) | ❌ None |
| **Learning Curve** | **Low** | Medium | High (Lua) |
| **Performance** | Fast (~10ms) | Fast | **Fastest** (~5ms) |
| **Ecosystem** | Good | Excellent | Limited |

**Recommendation: Traefik** vì Docker-native, low config overhead, ForwardAuth pattern sẵn có.

### 3. OPA vs OSO Trade-offs
**OPA advantages**: CNCF graduated, REST API scale tốt, Rego declarative (policy-as-code), bundle mode cho ultra low latency, CLI testing mạnh, **decoupled from app** (Traefik + Auth Service + OPA độc lập).

**OSO advantages**: Python-native (DX tốt), policy gần code hơn, nhưng **tight coupling** với app.

**Recommendation: OPA** vì horizontal scaling requirement, Traefik có thể gọi OPA trực tiếp nếu cần (không bắt buộc qua Auth Service), Rego policies version control tốt.

### 4. RBAC → ReBAC Migration Path
Phase 1 (RBAC): roles cứng = {admin, editor, viewer}, permissions trong Rego rules đơn giản.

Phase 2 (ReBAC): Thêm bảng `resource_relations (subject_id, relation, object_id, resource_type)` như "user1 owns thread123" hoặc "user2 shared_with thread123"; mở rộng Rego với relationship queries; OPA `walk()` function traverse graphs.

**Không breaking change**: RBAC rules vẫn chạy song song, chỉ thêm ReBAC rules mới cho advanced use cases.

### 5. Redis Cluster vs Single Node
- **Single Redis**: Prototype, <10GB data, <10k req/s
- **Redis Sentinel**: HA với auto-failover (3 nodes: 1 master + 2 replicas), **recommended**
- **Redis Cluster**: Sharding cho >100GB hoặc >100k req/s

**Khuyến nghị**: Bắt đầu với single Redis, migrate sang Sentinel khi production (balance complexity/availability).

### 6. Service-to-Service Authentication
Traefik inject headers (`X-User-ID`, `X-User-Roles`) sau khi Auth Service verify. Downstream services **should validate** headers:

**Option 1**: Internal API key (`X-Internal-Secret`) chỉ Traefik biết, services verify secret.
**Option 2**: mTLS giữa Traefik ↔ services (stronger security, phức tạp hơn).
**Option 3**: Trust headers (development only, **NOT production**).

**Recommendation**: Internal secret cho balance giữa security và simplicity.

### 7. Rate Limiting Strategy
**Traefik RateLimit middleware**: Per-IP limits (100 req/min), per-route limits.
**Auth Service level**: Per-user limits (Redis counters, sliding window), fail-fast nếu exceed.
**OPA level**: Không làm rate limiting (chỉ policy decisions).

Stack: Traefik (IP-based) → Auth Service (user-based) → OPA (authz only).

### 8. OPA Bundle vs REST API
**Development**: OPA REST API (live policy updates, easy debug).
**Production**: OPA bundle mode (policies pre-compiled từ Git/S3, load vào memory, **1-2ms latency** vs 5-10ms REST API).

Implement both modes với config flag: `OPA_BUNDLE_MODE=true/false`.

### 9. Monitoring & Observability
- **Traefik metrics**: request rate, response time, status codes → Prometheus `/metrics`
- **Auth Service metrics**: auth success/fail rate, OPA latency, Redis hit ratio → custom Prometheus endpoint
- **Distributed tracing**: OpenTelemetry với trace IDs propagate qua headers: Client → Traefik → Auth → OPA → Agent/Knowledge
- **Logs**: Structured JSON logs, centralized (ELK stack optional)

Dashboard: Grafana visualize Prometheus metrics.

## Kiến trúc Traefik + Auth Service

```mermaid
sequenceDiagram
    participant Client as Streamlit UI
    participant Traefik as Traefik Gateway<br/>(Port 80/443)
    participant Auth as Auth Service<br/>(/verify endpoint)
    participant Redis as Redis Cache
    participant OPA as OPA Engine
    participant DB as PostgreSQL
    participant Agent as Agent Service<br/>(Internal: 8080)
    participant KB as Knowledge Service<br/>(Internal: 9000)

    Note over Client,KB: 1. Authentication Flow

    Client->>Traefik: POST /auth/login<br/>{email, password}
    Traefik->>Auth: Forward to /auth/login
    Auth->>DB: Query user + roles
    DB-->>Auth: User found
    Auth->>Auth: Validate password (bcrypt)<br/>Generate JWT tokens
    Auth-->>Traefik: {access_token, refresh_token}
    Traefik-->>Client: JWT tokens (TTL: 15min/7d)

    Note over Client,KB: 2. Authorized Request (Thread Invocation)

    Client->>Traefik: POST /agent/invoke<br/>Authorization: Bearer {jwt}<br/>{thread_id, message}
    
    Note over Traefik: ForwardAuth middleware<br/>intercepts request
    
    Traefik->>Auth: GET /verify<br/>Authorization: Bearer {jwt}<br/>X-Forwarded-Uri: /agent/invoke<br/>X-Forwarded-Method: POST

    Auth->>Redis: Check jwt:{hash}
    
    alt JWT Cached
        Redis-->>Auth: {user_id, roles, exp}
    else JWT Not Cached
        Auth->>Auth: Decode & validate JWT
        Auth->>Redis: SETEX jwt:{hash} {claims}
    end

    Auth->>Redis: Check policy:{user}:thread:invoke
    
    alt Policy Cached
        Redis-->>Auth: allow/deny
    else Policy Not Cached
        Auth->>OPA: POST /v1/data/authz/allow<br/>{user: {id, roles},<br/>resource: {type:"thread", id},<br/>action: "invoke"}
        OPA->>OPA: Evaluate RBAC Rego:<br/>admin → allow all<br/>user → own threads only
        OPA-->>Auth: {result: {allow: true}}
        Auth->>Redis: SETEX policy:{key} true (5min)
    end

    alt Authorization Denied
        Auth-->>Traefik: 403 Forbidden
        Traefik-->>Client: 403 Error
    else Authorization Allowed
        Auth-->>Traefik: 200 OK<br/>X-User-ID: 123<br/>X-User-Roles: user,admin<br/>X-User-Email: user@example.com
        
        Note over Traefik: Inject headers &<br/>forward to backend
        
        Traefik->>Agent: POST /invoke<br/>X-User-ID: 123<br/>X-User-Roles: user,admin<br/>X-Internal-Secret: xxx
        Agent->>Agent: Process with user context
        Agent-->>Traefik: {type: "ai", content: "..."}
        Traefik-->>Client: Response
    end

    Note over Client,KB: 3. Document Access (Knowledge Service)

    Client->>Traefik: GET /kb/documents/{doc_id}
    Traefik->>Auth: GET /verify (ForwardAuth)
    Auth->>Redis: Check cache
    Auth->>OPA: Authorize document:read
    OPA-->>Auth: allow
    Auth-->>Traefik: 200 + headers
    Traefik->>KB: GET /documents/{doc_id}<br/>X-User-ID: 123
    KB-->>Traefik: Document data
    Traefik-->>Client: Response

    Note over Client,KB: 4. Horizontal Scaling

    rect rgb(240, 248, 255)
        Note over Traefik: Traefik auto load-balances<br/>across multiple instances
        Note over Auth: Auth Service: 3 replicas<br/>(stateless)
        Note over Agent: Agent Service: 3 replicas
        Note over KB: Knowledge Service: 2 replicas
        Note over Redis: Shared Redis ensures<br/>consistent cache across all instances
    end
```

## Cấu trúc Folder Auth Service

```
auth_service/                       # Lightweight, focused service
├── pyproject.toml                  # FastAPI, PyJWT, redis, httpx (NO proxy libs)
├── alembic.ini
├── .env                            # JWT_SECRET, REDIS_URL, OPA_URL, DB_URL
├── Dockerfile
├── alembic/
│   └── versions/
│       ├── 001_create_users_roles.py
│       └── 002_create_resource_ownership.py
└── src/
    ├── main.py                     # FastAPI app (minimal routes)
    ├── config.py                   # Pydantic settings
    ├── dependencies.py             # Dependency injection
    │
    ├── routes/
    │   ├── __init__.py
    │   ├── auth.py                 # POST /auth/login, /register, /refresh
    │   └── verify.py               # GET /verify (Traefik ForwardAuth)
    │
    ├── models/
    │   ├── __init__.py
    │   ├── user.py                 # User, Role, UserRole (SQLAlchemy)
    │   └── resource.py             # ResourceOwnership (extensible)
    │
    ├── schemas/
    │   ├── __init__.py
    │   ├── auth.py                 # LoginRequest, TokenResponse (Pydantic)
    │   └── user.py                 # UserCreate, UserRead
    │
    ├── services/
    │   ├── __init__.py
    │   ├── jwt_service.py          # JWT encode/decode/refresh
    │   ├── password_service.py     # bcrypt hashing
    │   ├── opa_service.py          # OPA client wrapper
    │   ├── cache_service.py        # Redis operations
    │   └── auth_service.py         # Business logic: register/login
    │
    ├── policies/                   # OPA Rego policies (co-located)
    │   ├── rbac.rego               # RBAC rules (Phase 1)
    │   └── rebac.rego              # ReBAC rules (Phase 2)
    │
    └── utils/
        ├── __init__.py
        ├── cache_keys.py           # Cache key generation
        └── resource_parser.py      # Parse resource from URI
```

**Lưu ý**: Auth Service **KHÔNG** chứa routing logic (Traefik lo), **KHÔNG** cần httpx proxy (Traefik forward), chỉ focus vào auth/authz.

## Docker Compose Configuration

```yaml
services:
  # Traefik API Gateway (Industry Standard)
  traefik:
    image: traefik:v3.0
    container_name: traefik
    ports:
      - "80:80"           # HTTP
      - "443:443"         # HTTPS
      - "8080:8080"       # Dashboard
    command:
      - "--api.dashboard=true"
      - "--api.insecure=true"  # Dev only, use auth in prod
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--metrics.prometheus=true"
      - "--log.level=INFO"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/certs:/certs  # TLS certificates
    networks:
      - app_network
    labels:
      - "traefik.enable=true"

  # Auth Service (Focused Microservice)
  auth_service:
    build:
      context: ./auth_service
      dockerfile: Dockerfile
    container_name: auth_service
    expose:
      - "8000"  # Internal only, not public
    environment:
      - DATABASE_URL=postgresql+asyncpg://user:pass@postgres:5432/authdb
      - REDIS_URL=redis://redis:6379/0
      - OPA_URL=http://opa:8181
      - JWT_SECRET=${JWT_SECRET}
      - JWT_ALGORITHM=HS256
      - ACCESS_TOKEN_EXPIRE_MINUTES=15
      - REFRESH_TOKEN_EXPIRE_DAYS=7
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      opa:
        condition: service_started
    networks:
      - app_network
    labels:
      - "traefik.enable=true"
      # Public auth endpoints (no ForwardAuth)
      - "traefik.http.routers.auth.rule=PathPrefix(`/auth`)"
      - "traefik.http.routers.auth.entrypoints=web"
      - "traefik.http.services.auth.loadbalancer.server.port=8000"
      # Internal verify endpoint (for ForwardAuth only)
      - "traefik.http.routers.auth-verify.rule=PathPrefix(`/verify`)"
      - "traefik.http.routers.auth-verify.entrypoints=web"
    deploy:
      replicas: 2  # Scale as needed

  # OPA Policy Engine
  opa:
    image: openpolicyagent/opa:latest-rootless
    container_name: opa
    expose:
      - "8181"
    volumes:
      - ./auth_service/src/policies:/policies:ro
    command:
      - "run"
      - "--server"
      - "--addr=0.0.0.0:8181"
      - "--log-level=info"
      - "/policies"
    networks:
      - app_network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: redis
    expose:
      - "6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    networks:
      - app_network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    expose:
      - "5432"
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: authdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Agent Service (Protected by Traefik ForwardAuth)
  agent_service:
    build:
      context: ./agent-service-toolkit
      dockerfile: docker/Dockerfile.service
    container_name: agent_service
    expose:
      - "8080"  # Internal only
    environment:
      - AUTH_SECRET=${INTERNAL_SECRET}  # Verify X-Internal-Secret header
      - DATABASE_TYPE=postgres
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=agentdb
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network
    labels:
      - "traefik.enable=true"
      # Route: /agent/* → agent_service
      - "traefik.http.routers.agent.rule=PathPrefix(`/agent`)"
      - "traefik.http.routers.agent.entrypoints=web"
      # Apply ForwardAuth middleware
      - "traefik.http.routers.agent.middlewares=auth-check,strip-agent-prefix"
      - "traefik.http.middlewares.auth-check.forwardauth.address=http://auth_service:8000/verify"
      - "traefik.http.middlewares.auth-check.forwardauth.authResponseHeaders=X-User-ID,X-User-Roles,X-User-Email"
      # Strip /agent prefix before forwarding
      - "traefik.http.middlewares.strip-agent-prefix.stripprefix.prefixes=/agent"
      - "traefik.http.services.agent.loadbalancer.server.port=8080"
    deploy:
      replicas: 2

  # Knowledge Service (Protected by Traefik ForwardAuth)
  knowledge_service:
    build:
      context: ./knowledge
      dockerfile: Dockerfile
    container_name: knowledge_service
    expose:
      - "9000"  # Internal only
    environment:
      - AUTH_SECRET=${INTERNAL_SECRET}
      - POSTGRES_HOST=postgres
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=knowledgedb
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app_network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.knowledge.rule=PathPrefix(`/kb`)"
      - "traefik.http.routers.knowledge.entrypoints=web"
      - "traefik.http.routers.knowledge.middlewares=auth-check,strip-kb-prefix"
      - "traefik.http.middlewares.strip-kb-prefix.stripprefix.prefixes=/kb"
      - "traefik.http.services.knowledge.loadbalancer.server.port=9000"
    deploy:
      replicas: 2

  # Streamlit UI (Frontend)
  streamlit_app:
    build:
      context: ./agent-service-toolkit
      dockerfile: docker/Dockerfile.app
    container_name: streamlit_app
    ports:
      - "8501:8501"
    environment:
      - GATEWAY_URL=http://traefik  # Point to Traefik, not services directly
      - AUTH_URL=http://traefik/auth
    depends_on:
      - traefik
    networks:
      - app_network

volumes:
  postgres_data:
  redis_data:

networks:
  app_network:
    driver: bridge
```

## Sample RBAC Policy (Rego)

```rego
# auth_service/src/policies/rbac.rego
package authz

import future.keywords.if
import future.keywords.in

# Default deny all
default allow := false

# Admin role: full access to everything
allow if {
    input.user.roles[_] == "admin"
}

# User role: invoke own threads
allow if {
    input.user.roles[_] == "user"
    input.action == "invoke"
    input.resource.type == "thread"
    is_owner(input.user.id, input.resource)
}

# User role: read own threads
allow if {
    input.user.roles[_] == "user"
    input.action == "read"
    input.resource.type == "thread"
    is_owner(input.user.id, input.resource)
}

# User role: read/edit own documents
allow if {
    input.user.roles[_] == "user"
    input.action in ["read", "edit"]
    input.resource.type == "document"
    is_owner(input.user.id, input.resource)
}

# Viewer role: read-only access to documents
allow if {
    input.user.roles[_] == "viewer"
    input.action == "read"
    input.resource.type == "document"
}

# Editor role: edit documents
allow if {
    input.user.roles[_] == "editor"
    input.action in ["read", "edit"]
    input.resource.type == "document"
}

# Helper function: check ownership
is_owner(user_id, resource) if {
    resource.owner_id == user_id
}

# Future ReBAC extension: check shared relationships
# Uncomment when ResourceRelation table is ready
# allow if {
#     relation := data.relations[_]
#     relation.subject_id == input.user.id
#     relation.object_id == input.resource.id
#     relation.relation == "can_read"
# }
```

### OPA Input Structure (from Auth Service)

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "roles": ["user", "editor"],
    "email": "user@example.com"
  },
  "resource": {
    "type": "thread",
    "id": "thread-123",
    "owner_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "action": "invoke"
}
```

### OPA Response

```json
{
  "result": {
    "allow": true
  }
}
```

## Performance Benchmark Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| **Traefik routing** | <2ms | Native Go performance, in-memory routing table |
| **JWT validation** | <3ms | Redis cache (90%+ hit ratio for active tokens) |
| **OPA policy decision** | <5ms | Redis cache (5min TTL) + OPA bundle mode (~1ms) |
| **Auth Service overhead** | <10ms | Async I/O, connection pooling, minimal logic |
| **Total auth latency** | <15ms | Traefik + Auth + OPA + Redis (cached path) |
| **Cache invalidation** | <1s | Redis pub/sub when roles/policies change |
| **Horizontal scale** | Linear | Stateless design, shared Redis, Traefik LB |
| **Throughput** | 10k+ req/s | Per Traefik instance, scale to 100k+ with cluster |

### Latency Breakdown (Cached Request)

```
Client → Traefik: ~1ms (network)
Traefik → Auth Service: ~1ms (internal network)
Auth Service:
  ├─ Redis JWT lookup: ~1ms
  ├─ Redis policy lookup: ~1ms
  └─ Response headers: ~1ms
Traefik → Backend: ~2ms
Backend processing: variable (agent/knowledge logic)
Total overhead: ~7ms (vs 100ms+ for LLM calls)
```

### Cache Hit Ratios (Expected)

- JWT validation: **95%+** (tokens valid for 15min)
- OPA policy decisions: **85%+** (5min cache, frequent users)
- Overall cache effectiveness: **90%+**

## RBAC → ReBAC Migration Example

### Phase 1 (Current): Simple RBAC
**Roles**: admin, user, editor, viewer  
**Permissions**: Cứng trong Rego rules

```rego
# Simple role check
allow if {
    input.user.roles[_] == "editor"
    input.action == "edit"
}
```

### Phase 2 (Future): Add ReBAC Relationships

**Database schema extension**:
```sql
CREATE TABLE resource_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL,           -- User ID
    relation VARCHAR(50) NOT NULL,      -- "owns", "can_read", "can_edit", "shared_with"
    object_id UUID NOT NULL,            -- Resource ID (thread, document, etc.)
    resource_type VARCHAR(50) NOT NULL, -- "thread", "document", etc.
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(subject_id, relation, object_id)
);

CREATE INDEX idx_resource_relations_subject ON resource_relations(subject_id);
CREATE INDEX idx_resource_relations_object ON resource_relations(object_id);
```

**Extended Rego policy** (co-exists with RBAC):
```rego
# auth_service/src/policies/rebac.rego
package authz

import future.keywords.if

# Check relationship-based access
allow if {
    relation := data.relations[_]
    relation.subject_id == input.user.id
    relation.object_id == input.resource.id
    relation.relation == "can_read"
    input.action == "read"
}

# Check transitive relationships (e.g., team membership)
allow if {
    # User is member of team
    team_member := data.relations[_]
    team_member.subject_id == input.user.id
    team_member.relation == "member_of"
    
    # Team has access to resource
    team_access := data.relations[_]
    team_access.subject_id == team_member.object_id
    team_access.object_id == input.resource.id
    team_access.relation == "can_access"
}
```

### Migration Steps

1. **Add ResourceRelation table** (Alembic migration)
2. **Populate initial relations** (owner relationships from existing data)
3. **Deploy extended Rego policies** (RBAC + ReBAC rules co-exist)
4. **Add sharing endpoints** (`POST /threads/{id}/share`)
5. **Gradually migrate** from role-based to relationship-based permissions

### Example: Thread Sharing Flow

```python
# POST /threads/{thread_id}/share
@router.post("/threads/{thread_id}/share")
async def share_thread(
    thread_id: UUID,
    share_with: UUID,
    permission: Literal["read", "edit"],
    current_user: User = Depends(get_current_user)
):
    # Check if user owns thread (via OPA)
    if not await opa_service.check_permission(
        user=current_user, 
        resource={"type": "thread", "id": thread_id},
        action="share"
    ):
        raise HTTPException(403, "Cannot share thread you don't own")
    
    # Create relationship
    await db.execute(
        ResourceRelation(
            subject_id=share_with,
            relation=f"can_{permission}",
            object_id=thread_id,
            resource_type="thread"
        )
    )
    
    # Invalidate cache
    await cache_service.invalidate_policy_cache(share_with)
    
    return {"status": "shared"}
```

### No Breaking Changes

- **Existing RBAC rules** continue to work
- **New ReBAC rules** add capabilities (sharing, teams, etc.)
- **OPA evaluates both**: First check RBAC (fast), then ReBAC (slower, but cached)
- **Backwards compatible**: Old clients don't need updates

## Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] Setup Traefik container in Docker Compose
- [ ] Configure Traefik Docker provider with labels
- [ ] Deploy Redis cache container
- [ ] Deploy OPA policy engine container
- [ ] Setup PostgreSQL database
- [ ] Configure Docker networks

### Phase 2: Auth Service Core
- [ ] Initialize auth_service/ project structure
- [ ] Install dependencies (FastAPI, PyJWT, redis, SQLAlchemy, httpx)
- [ ] Create User/Role SQLAlchemy models
- [ ] Write Alembic migrations (users, roles, user_roles)
- [ ] Implement JWT service (create/decode/refresh tokens)
- [ ] Implement password hashing (bcrypt)
- [ ] Create pydantic schemas (LoginRequest, TokenResponse, UserCreate)
- [ ] Build auth endpoints (/auth/login, /register, /refresh)

### Phase 3: Authorization Layer
- [ ] Write RBAC Rego policies (admin, user, editor, viewer)
- [ ] Implement OPA client wrapper service
- [ ] Create resource parser utility (extract from URI)
- [ ] Build /verify endpoint (ForwardAuth handler)
- [ ] Implement Redis cache service
- [ ] Add JWT validation caching
- [ ] Add policy decision caching

### Phase 4: Traefik Integration
- [ ] Configure Traefik ForwardAuth middleware
- [ ] Add Docker labels to agent_service
- [ ] Add Docker labels to knowledge_service
- [ ] Configure StripPrefix middlewares
- [ ] Test routing: /agent/* → agent_service
- [ ] Test routing: /kb/* → knowledge_service
- [ ] Verify header injection (X-User-ID, X-User-Roles)

### Phase 5: Downstream Services
- [ ] Update agent_service to accept X-User-ID header
- [ ] Add internal secret validation in agent_service
- [ ] Update knowledge_service to accept X-User-ID header
- [ ] Add internal secret validation in knowledge_service
- [ ] Remove old AUTH_SECRET validation
- [ ] Update Streamlit app to use Traefik URLs

### Phase 6: Testing & Optimization
- [ ] Write unit tests for JWT service
- [ ] Write unit tests for OPA service
- [ ] Write integration tests (login → verify → invoke)
- [ ] Load test auth service (target: 1000+ req/s)
- [ ] Verify cache hit ratios (>85% for policies)
- [ ] Test horizontal scaling (3+ auth_service replicas)
- [ ] Measure latency (target: <15ms auth overhead)

### Phase 7: Observability
- [ ] Add health check endpoint (/health)
- [ ] Implement Prometheus metrics (/metrics)
- [ ] Add structured logging (JSON format)
- [ ] Configure Traefik access logs
- [ ] Setup Grafana dashboard (optional)
- [ ] Add distributed tracing (OpenTelemetry, optional)

### Phase 8: Security Hardening
- [ ] Implement rate limiting (per-user, per-IP)
- [ ] Add CORS configuration
- [ ] Configure TLS certificates (Let's Encrypt)
- [ ] Implement token refresh rotation
- [ ] Add audit logging for auth events
- [ ] Setup Redis password authentication
- [ ] Configure PostgreSQL SSL connections

### Phase 9: Documentation
- [ ] Document API endpoints (OpenAPI/Swagger)
- [ ] Write deployment guide
- [ ] Document environment variables
- [ ] Create architecture diagrams
- [ ] Write troubleshooting guide

### Phase 10 (Future): ReBAC Migration
- [ ] Add ResourceRelation table (Alembic migration)
- [ ] Write ReBAC Rego policies
- [ ] Implement sharing endpoints
- [ ] Add relationship management UI
- [ ] Migrate existing ownership data
- [ ] Test transitive permissions (teams, groups)
