### 3. Integrate OPA policy engine
Deploy OPA container trong Docker Compose; gateway gọi OPA REST API (`POST /v1/data/authz/allow`) với input {user, resource, action}; viết RBAC policies trong `api_gateway/src/policies/rbac.rego` định nghĩa roles (admin, user, guest) và permissions: admin full access tất cả services/resources, user access own threads + invoke agent, guest chỉ invoke agent (temporary sessions).

### 4. Build unified user/role schema
Tạo shared database schema: User (id UUID string, email, hashed_password, is_active, created_at), Role (id, name: admin/user/guest), UserRole (user_id, role_id); Thread (id, user_id, agent_id, is_guest, created_at, updated_at) cho thread ownership tracking; ResourceOwnership (resource_type, resource_id, owner_id) cho extensibility; Alembic migrations trong `api_gateway/alembic/`.

### 5. Implement request routing middleware
Middleware trong `api_gateway/src/middleware/auth_middleware.py`: extract JWT (optional cho /agent/invoke) → validate → cache JWT (Redis) → inject user info to request state; nếu no JWT thì set role="guest"; Thread tracking middleware trong `api_gateway/src/middleware/thread_tracking_middleware.py`: intercept /agent/invoke|stream → extract/generate thread_id → create Thread + ResourceOwnership records for authenticated users only (skip for guests); Authorization helper trong `api_gateway/src/auth/authorization.py`: call OPA với owner_id từ threads table → cache decision (Redis 5min TTL) → raise 403 if denied; Proxy middleware trong `api_gateway/src/middleware/proxy_middleware.py`: proxy request đến agent-service (8080) hoặc knowledge (9000) via httpx → inject `X-User-ID`, `X-User-Email`, `X-User-Roles`, `X-Internal-Secret` headers → forward response.







### 8. Authorization Flow Implementation
**Route-level authorization**: Mỗi proxy route (agent_proxy, knowledge_proxy) extract resource info từ path (thread_id, doc_id) và determine action dựa trên HTTP method (GET=read, POST=invoke/create, PUT/PATCH=update, DELETE=delete). **Service-level authorization**: Knowledge và Wayfinder services chỉ allow admin role. **Resource ownership**: Query threads table để lấy owner_id, so sánh với current user_id. Call `check_authorization()` helper trước khi proxy request. **Guest handling**: /agent/invoke cho phép guests (no JWT) với temporary session, không tạo database records. **Error responses**: 401 Unauthorized nếu JWT required but missing; 403 Forbidden nếu OPA policy deny với detail message "Insufficient permissions to {action} {resource_type}". **Caching**: Policy decisions cached trong Redis với key pattern `policy:{user_id}:{resource_type}:{resource_id}:{action}`, TTL 5 phút.

### 9. Thread Ownership Tracking
**Thread lifecycle**: Threads table trong api_gateway database track ownership (id, user_id, agent_id, is_guest, created_at, updated_at). **Automatic creation**: Thread tracking middleware intercepts /agent/invoke, generates thread_id if missing, creates Thread + ResourceOwnership records for authenticated users. **Guest sessions**: Guests generate client-side thread_id, no database persistence, threads lost after session ends. **History access**: Requires user to be logged in and own the thread (verified via threads table owner_id). **Admin override**: Admin role can access all threads regardless of ownership.

### 10. Guest Sessions & Temporary Chat
**Unauthenticated access**: /agent/invoke và /agent/stream cho phép requests không có JWT (no Authorization header). **Guest role assignment**: Middleware detects missing JWT, sets `request.state.user_roles = ["guest"]` và `user_id = None`. **No database persistence**: Thread tracking middleware skips INSERT statements for guests, không tạo Thread hoặc ResourceOwnership records. **Client-side thread management**: Frontend generates và stores thread_id trong sessionStorage (not localStorage), thread bị lost khi đóng browser. **Restricted access**: Guests KHÔNG thể access /agent/history (403 Forbidden), /knowledge, /wayfinder, hoặc bất kỳ endpoint nào require read permissions. **Conversion flow**: Khi guest đăng ký/login, tạo user account và có thể track threads từ đó về sau (previous guest threads vẫn lost).

### 11. Service-Level Authorization
**Admin-only services**: Knowledge-base service và Wayfinder service CHỈ accessible bởi users với role="admin". **OPA policy check**: Gateway calls OPA với `resource.type="service"`, `resource.id="knowledge"|"wayfinder"`, `action="access"`. **403 response**: Non-admin users nhận "403 Forbidden: Admin access required" khi cố access các services này. **Proxy route protection**: knowledge_proxy.py và wayfinder_proxy.py implement authorization check trước khi proxy request downstream. **Service discovery**: Agent service accessible by all roles (admin, user, guest) nhưng action-specific permissions apply (invoke vs read).





# Further Considerations
### 2. RBAC → ReBAC Migration Path
Bắt đầu với RBAC đơn giản: roles = {admin, user, guest}, permissions cứng trong Rego. Sau khi stable, thêm ReBAC bằng cách: (a) thêm bảng ResourceRelation (subject_id, relation, object_id) như "user1 shares_with user2 thread123", (b) mở rộng Rego policies với graph traversal logic, (c) OPA built-in `walk()` function hỗ trợ relationship queries. **Không cần viết lại toàn bộ**, chỉ thêm rules mới.






## Sample RBAC Policy (Rego)

```rego
# api_gateway/src/policies/rbac.rego
package authz

import future.keywords.if
import future.keywords.in

# Default deny
default allow := false

# Admin role allows everything (all services, all resources)
allow if {
    input.user.roles[_] == "admin"
}

# Service-level authorization: Knowledge service (admin only)
allow if {
    input.user.roles[_] == "admin"
    input.resource.type == "service"
    input.resource.id == "knowledge"
    input.action == "access"
}

# Service-level authorization: Wayfinder service (admin only)
allow if {
    input.user.roles[_] == "admin"
    input.resource.type == "service"
    input.resource.id == "wayfinder"
    input.action == "access"
}

# User role can invoke agent (own threads only)
allow if {
    input.user.roles[_] == "user"
    input.action == "invoke"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# User role can read thread history (own threads only)
allow if {
    input.user.roles[_] == "user"
    input.action == "read"
    input.resource.type == "thread"
    input.resource.owner_id == input.user.id
}

# Guest role can only invoke agent (temporary sessions, no history access)
allow if {
    input.user.roles[_] == "guest"
    input.action == "invoke"
    input.resource.type == "thread"
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
allow if input.user.roles[_] == "user"
allow if input.user.roles[_] == "guest"
```

### Phase 2 (ReBAC): Thêm relationships
```rego
# User can access threads they own OR threads shared with them
allow if {
    relation := data.relations[_]
    relation.subject_id == input.user.id
    relation.object_id == input.resource.id
    relation.relation == "can_read"  # or "shared_with"
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
- [ ] Create threads table migration (id, user_id, agent_id, is_guest, created_at, updated_at)
- [ ] Add guest role to roles table migration
- [ ] Update RBAC Rego policies with admin/user/guest roles + service-level authz
- [ ] Implement thread tracking middleware (auto-create Thread + ResourceOwnership for users)
- [ ] Update auth middleware to allow guests for /agent/invoke endpoints
- [ ] Add service-level authorization for Knowledge (admin only)
- [ ] Add service-level authorization for Wayfinder (admin only)
- [ ] Enable resource ownership checks in agent proxy (query threads table for owner_id)
- [ ] Add thread management endpoints (GET /threads, GET /threads/{id}, DELETE /threads/{id})
- [ ] Create thread_service.py database layer (create_thread, get_thread_owner, list_user_threads)
- [ ] Update downstream services to validate X-Internal-Secret header
- [ ] Implement cache invalidation when roles/ownership change
- [ ] Update frontend to handle guest mode (sessionStorage for thread_id)
- [ ] Implement rate limiting
- [ ] Add Prometheus metrics
- [ ] Setup load balancer (Nginx/Traefik)
- [ ] Test horizontal scaling (3+ instances)
- [ ] Document API endpoints
- [ ] Write integration tests (admin access all, user access own, guest temporary only)

---

## Chi tiết Luồng Authorization theo Vai trò

### 1. Admin Role - Truy cập Knowledge Service (Admin-Only)

```mermaid
sequenceDiagram
    participant Admin as Admin User<br/>(Browser/Client)
    participant Gateway as API Gateway<br/>(Middleware + OPA)
    participant Redis as Redis Cache
    participant OPA as OPA Engine
    participant AuthDB as Auth Database<br/>(threads, users)
    participant Knowledge as Knowledge Service<br/>(Port 9000)

    Note over Admin,Knowledge: Admin truy cập Knowledge Service (Admin-only)

    Admin->>Gateway: GET /knowledge/documents<br/>Header: Bearer {admin_jwt}
    
    Note over Gateway: Auth Middleware
    Gateway->>Redis: GET jwt:{token_hash}
    alt JWT cached
        Redis-->>Gateway: {user_id, roles: ["admin"]}
    else JWT not cached
        Gateway->>Gateway: jwt_handler.decode_token()
        Gateway->>Redis: SETEX jwt:{hash} 900
    end

    Note over Gateway: Authorization Check
    Gateway->>Gateway: Extract resource:<br/>type="service"<br/>resource_id="knowledge"<br/>action="access"
    
    Gateway->>Redis: GET policy:{user_id}:service:knowledge:access
    alt Policy cached
        Redis-->>Gateway: allow=true
    else Policy not cached
        Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {roles: ["admin"]},<br/>resource: {type: "service", id: "knowledge"},<br/>action: "access"}
        
        Note over OPA: Evaluate rbac.rego:<br/>allow if input.user.roles[_] == "admin"
        
        OPA-->>Gateway: {"result": {"allow": true}}
        Gateway->>Redis: SETEX policy:{key} true (300s)
    end

    Gateway->>Knowledge: GET /documents<br/>Headers:<br/>X-User-ID: {admin_id}<br/>X-User-Email: {email}<br/>X-User-Roles: admin<br/>X-Internal-Secret: {secret}
    
    Knowledge->>Knowledge: Trust gateway headers<br/>(internal auth validated)
    Knowledge-->>Gateway: 200 OK + documents[]
    Gateway-->>Admin: 200 OK + documents[]

    Note over Admin,Knowledge: ✅ Admin có full access tất cả services
```

### 2. User Role - Truy cập Thread History (Resource Ownership)

```mermaid
sequenceDiagram
    participant User as Logged-in User<br/>(Browser)
    participant Gateway as API Gateway<br/>(Auth + Ownership Check)
    participant Redis as Redis Cache
    participant OPA as OPA Engine
    participant AuthDB as Auth DB<br/>(threads table)
    participant Agent as Agent Service<br/>(LangGraph)

    Note over User,Agent: User xem lịch sử chat của thread họ sở hữu

    User->>Gateway: POST /agent/history<br/>Header: Bearer {user_jwt}<br/>Body: {thread_id: "abc-123"}

    Note over Gateway: Auth Middleware
    Gateway->>Redis: GET jwt:{token_hash}
    Redis-->>Gateway: {user_id: "user-456", roles: ["user"]}

    Note over Gateway: Thread Ownership Check
    Gateway->>Gateway: Extract thread_id from body
    
    Gateway->>AuthDB: SELECT owner_id FROM threads<br/>WHERE id = 'abc-123'
    AuthDB-->>Gateway: owner_id = "user-456"
    
    Note over Gateway: ✅ thread owner matches current user

    Note over Gateway: Authorization Check
    Gateway->>Redis: GET policy:user-456:thread:abc-123:read
    
    alt Policy not cached
        Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {id: "user-456", roles: ["user"]},<br/>resource: {type: "thread", id: "abc-123",<br/>owner_id: "user-456"},<br/>action: "read"}
        
        Note over OPA: Evaluate RBAC rule:<br/>allow if {<br/>  input.user.roles[_] == "user"<br/>  input.action == "read"<br/>  input.resource.owner_id == input.user.id<br/>}
        
        OPA-->>Gateway: {"result": {"allow": true}}
        Gateway->>Redis: SETEX policy:{key} true (300s)
    end

    Gateway->>Agent: POST /history<br/>Headers: X-User-ID, X-Internal-Secret<br/>Body: {thread_id: "abc-123"}
    
    Agent->>Agent: aget_state(thread_id)<br/>from LangGraph checkpointer
    Agent-->>Gateway: ChatHistory {messages: [...]}
    Gateway-->>User: 200 OK + chat history

    Note over User,Agent: ✅ User chỉ access được threads của họ

    Note over User,Agent: ❌ Nếu user cố access thread của người khác
    User->>Gateway: POST /agent/history<br/>Body: {thread_id: "xyz-789"}
    Gateway->>AuthDB: SELECT owner_id FROM threads<br/>WHERE id = 'xyz-789'
    AuthDB-->>Gateway: owner_id = "other-user-999"
    Gateway->>OPA: Check authorization<br/>(owner mismatch)
    OPA-->>Gateway: {"result": {"allow": false}}
    Gateway-->>User: 403 Forbidden<br/>{error: "Insufficient permissions"}
```

### 3. Guest Role - Chat tạm thời (No Database Persistence)

```mermaid
sequenceDiagram
    participant Guest as Guest User<br/>(Unauthenticated)
    participant Gateway as API Gateway<br/>(Optional Auth)
    participant Redis as Redis Cache
    participant OPA as OPA Engine
    participant AuthDB as Auth DB<br/>(NOT USED)
    participant Agent as Agent Service<br/>(LangGraph)

    Note over Guest,Agent: Guest chat không lưu vào database

    Guest->>Gateway: POST /agent/invoke<br/>No JWT header<br/>Body: {message: "Hello",<br/>thread_id: "guest-temp-123"}

    Note over Gateway: Auth Middleware
    Gateway->>Gateway: Check Authorization header
    Note over Gateway: ❌ No JWT found
    Gateway->>Gateway: Set request.state:<br/>user_id = None<br/>user_roles = ["guest"]
    Note over Gateway: ✅ Allow guest for /agent/invoke

    Note over Gateway: Thread Tracking Middleware
    Gateway->>Gateway: Extract thread_id = "guest-temp-123"
    Gateway->>Gateway: Check if user_id is None (guest)
    
    Note over Gateway: ⚠️ SKIP database creation:<br/>- No INSERT into threads table<br/>- No ResourceOwnership record<br/>- Temporary session only
    
    Gateway->>Gateway: Add thread_id to request.state

    Note over Gateway: Authorization (Guest Invoke)
    Gateway->>Redis: GET policy:guest:thread:temp:invoke
    
    alt Policy not cached
        Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {id: null, roles: ["guest"]},<br/>resource: {type: "thread", id: "temp"},<br/>action: "invoke"}
        
        Note over OPA: Evaluate RBAC rule:<br/>allow if {<br/>  input.user.roles[_] == "guest"<br/>  input.action == "invoke"<br/>}
        
        OPA-->>Gateway: {"result": {"allow": true}}
        Gateway->>Redis: SETEX policy:{key} true (300s)
    end

    Gateway->>Agent: POST /invoke<br/>Headers:<br/>X-User-ID: None<br/>X-User-Roles: guest<br/>X-Internal-Secret: {secret}<br/>Body: {thread_id: "guest-temp-123", message}

    Agent->>Agent: Process with LangGraph<br/>(thread stored in checkpointer<br/>but no app-level tracking)
    Agent-->>Gateway: {type: "ai", content: "Response"}
    Gateway-->>Guest: 200 OK + response

    Note over Guest,Agent: ✅ Guest có thể chat nhưng không lưu database

    Note over Guest,Agent: ❌ Guest không thể xem history
    Guest->>Gateway: POST /agent/history<br/>Body: {thread_id: "guest-temp-123"}
    Gateway->>Gateway: user_roles = ["guest"]
    Gateway->>OPA: Check authorization<br/>(action: "read")
    
    Note over OPA: No rule allows guest + read:<br/>❌ Deny by default
    
    OPA-->>Gateway: {"result": {"allow": false}}
    Gateway-->>Guest: 403 Forbidden<br/>{error: "History access requires login"}
```

### 4. User Role - Tạo Thread mới (Ownership Tracking)

```mermaid
sequenceDiagram
    participant User as Logged-in User
    participant Gateway as API Gateway<br/>(Thread Tracking)
    participant Redis as Redis Cache
    participant OPA as OPA Engine
    participant AuthDB as Auth DB<br/>(threads, resource_ownerships)
    participant Agent as Agent Service

    Note over User,Agent: User gửi message đầu tiên (tạo thread mới)

    User->>Gateway: POST /agent/invoke<br/>Header: Bearer {user_jwt}<br/>Body: {message: "Hello",<br/>thread_id: null}

    Note over Gateway: Auth Middleware
    Gateway->>Redis: GET jwt:{token_hash}
    Redis-->>Gateway: {user_id: "user-456", roles: ["user"]}

    Note over Gateway: Thread Tracking Middleware
    Gateway->>Gateway: thread_id is null → Generate new UUID<br/>thread_id = "new-thread-789"
    
    Gateway->>AuthDB: SELECT id FROM threads<br/>WHERE id = 'new-thread-789'
    AuthDB-->>Gateway: ❌ Not found
    
    Note over Gateway: Thread doesn't exist → Create ownership
    
    Gateway->>AuthDB: BEGIN TRANSACTION
    Gateway->>AuthDB: INSERT INTO threads<br/>(id, user_id, agent_id, is_guest, created_at)<br/>VALUES ('new-thread-789', 'user-456',<br/>'DEFAULT_AGENT', false, NOW())
    
    Gateway->>AuthDB: INSERT INTO resource_ownerships<br/>(id, resource_type, resource_id, owner_id)<br/>VALUES (uuid(), 'thread', 'new-thread-789', 'user-456')
    Gateway->>AuthDB: COMMIT
    
    Note over Gateway: ✅ Thread ownership established
    Gateway->>Gateway: Add thread_id to request.state

    Note over Gateway: Authorization Check
    Gateway->>OPA: POST /v1/data/authz/allow<br/>{user: {id: "user-456", roles: ["user"]},<br/>resource: {type: "thread", id: "new-thread-789",<br/>owner_id: "user-456"},<br/>action: "invoke"}
    
    Note over OPA: User owns thread → Allow
    OPA-->>Gateway: {"result": {"allow": true}}
    Gateway->>Redis: SETEX policy:{key} true (300s)

    Gateway->>Agent: POST /invoke<br/>Headers: X-User-ID, X-User-Roles<br/>Body: {thread_id: "new-thread-789", message}
    
    Agent->>Agent: Process with LangGraph<br/>(creates checkpoint in DB)
    Agent-->>Gateway: {type: "ai", content: "Response"}
    Gateway-->>User: 200 OK + response<br/>{thread_id: "new-thread-789", ...}

    Note over User,Agent: ✅ Thread đã được track ownership trong database

    Note over User,Agent: Lần chat tiếp theo với cùng thread_id
    User->>Gateway: POST /agent/invoke<br/>Body: {thread_id: "new-thread-789", message: "Continue"}
    Gateway->>AuthDB: SELECT owner_id FROM threads<br/>WHERE id = 'new-thread-789'
    AuthDB-->>Gateway: owner_id = "user-456" ✅ Already exists
    Note over Gateway: Skip INSERT, reuse existing thread
    Gateway->>Agent: POST /invoke (continue conversation)
```

### 5. Luồng Cache Invalidation (Role hoặc Ownership thay đổi)

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant Gateway as API Gateway
    participant Redis as Redis Cache
    participant AuthDB as Auth Database

    Note over Admin,AuthDB: Admin thay đổi role của user hoặc ownership

    Admin->>Gateway: PUT /admin/users/{user_id}/roles<br/>Body: {roles: ["user", "editor"]}
    
    Gateway->>AuthDB: UPDATE user_roles<br/>SET roles = ['user', 'editor']<br/>WHERE user_id = '...'
    AuthDB-->>Gateway: OK
    
    Note over Gateway: Cache Invalidation
    Gateway->>Redis: DEL jwt:{all_tokens_for_user}
    Note over Redis: Force JWT revalidation on next request
    
    Gateway->>Redis: Keys pattern: policy:{user_id}:*<br/>Delete all policy decisions for user
    Redis-->>Gateway: Deleted 15 keys
    
    Note over Gateway: ✅ Next request will hit OPA<br/>with updated roles
    
    Gateway-->>Admin: 200 OK {message: "Roles updated, cache invalidated"}

    Note over Admin,AuthDB: User's next request gets fresh authorization

    Note over Gateway: User makes request
    Gateway->>Redis: GET jwt:{token} → ❌ MISS
    Gateway->>Gateway: Decode JWT (roles outdated in token)
    Gateway->>Redis: GET policy:{key} → ❌ MISS
    Gateway->>OPA: Check with current DB roles
    Note over OPA: Fresh check against updated roles
```

---

## Tổng kết Phân quyền theo Role

| Role | Knowledge Service | Wayfinder Service | Agent Invoke | Agent History (Read) | Thread Ownership |
|------|-------------------|-------------------|--------------|----------------------|------------------|
| **Admin** | ✅ Full access | ✅ Full access | ✅ All threads | ✅ All threads | N/A (can access all) |
| **User** | ❌ Forbidden | ❌ Forbidden | ✅ Own threads only | ✅ Own threads only | ✅ Created in DB |
| **Guest** | ❌ Unauthorized | ❌ Unauthorized | ✅ Temporary only | ❌ Forbidden | ❌ No DB record |

### Chi tiết Actions theo Role

| Action | Admin | User (Logged In) | Guest (Unauthenticated) |
|--------|-------|------------------|-------------------------|
| **POST /auth/login** | ✅ | ✅ | ✅ |
| **POST /auth/register** | ✅ | ✅ | ✅ |
| **GET /knowledge/documents** | ✅ All documents | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| **POST /knowledge/documents** | ✅ Can create | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| **GET /wayfinder/navigate** | ✅ Full access | ❌ 403 Forbidden | ❌ 401 Unauthorized |
| **POST /agent/invoke** | ✅ All threads | ✅ Own threads | ✅ Temporary (no DB) |
| **POST /agent/stream** | ✅ All threads | ✅ Own threads | ✅ Temporary (no DB) |
| **POST /agent/history** | ✅ All threads | ✅ Own threads only | ❌ 403 Forbidden |
| **GET /threads** | ✅ All users' threads | ✅ Own threads only | ❌ 401 Unauthorized |
| **DELETE /threads/{id}** | ✅ Any thread | ✅ Own thread only | ❌ 401 Unauthorized |

### Resource-Level Access Matrix

| Resource Type | Admin | User (Owner) | User (Non-Owner) | Guest |
|---------------|-------|--------------|------------------|-------|
| **Thread (read history)** | ✅ | ✅ | ❌ 403 | ❌ 403 |
| **Thread (invoke/chat)** | ✅ | ✅ | ❌ 403 | ✅ (temp) |
| **Thread (delete)** | ✅ | ✅ | ❌ 403 | ❌ 401 |
| **Document (read)** | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| **Document (write)** | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| **Service: Knowledge** | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| **Service: Wayfinder** | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |

### Authorization Decision Flow Summary

```mermaid
flowchart TD
    A[Request arrives at Gateway] --> B{JWT present?}
    B -->|No| C[Set role = guest]
    B -->|Yes| D[Decode JWT → Extract user_id + roles]
    
    C --> E{Path = /agent/invoke or /agent/stream?}
    D --> F{Path matches which service?}
    
    E -->|Yes| G[Allow guest invoke - temporary session]
    E -->|No| H[401 Unauthorized - Login required]
    
    F -->|/knowledge/*| I[Check role = admin?]
    F -->|/wayfinder/*| J[Check role = admin?]
    F -->|/agent/history| K[Check role != guest?]
    F -->|/agent/invoke| L[Check thread ownership]
    
    I -->|Yes| M[✅ Allow - Proxy to Knowledge]
    I -->|No| N[❌ 403 Forbidden]
    
    J -->|Yes| O[✅ Allow - Proxy to Wayfinder]
    J -->|No| P[❌ 403 Forbidden]
    
    K -->|User/Admin| Q[Query thread owner from DB]
    K -->|Guest| R[❌ 403 Forbidden - History requires login]
    
    Q --> S{Owner matches user_id OR role=admin?}
    S -->|Yes| T[✅ Call OPA → Cache → Allow]
    S -->|No| U[❌ 403 Forbidden - Not your thread]
    
    L --> V[Extract/Generate thread_id]
    V --> W{User logged in?}
    W -->|Yes| X[Create thread + ownership in DB]
    W -->|No| Y[Skip DB - Temporary session]
    X --> Z[✅ Call OPA → Allow invoke]
    Y --> Z
    
    G --> AA[Proxy to Agent Service - No DB persistence]
    M --> AB[Proxy with X-User-ID headers]
    O --> AB
    T --> AB
    Z --> AB
```
