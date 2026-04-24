# Database Documentation

## Overview

DATN-Chatbot uses a multi-database architecture with 5 PostgreSQL instances, LangGraph checkpoint storage, Redis for semantic cache/message broker, and Qdrant vector database for semantic search.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                              │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┤
│  API Gateway │Agent Service  │  Knowledge   │  Wayfinder   │  Dashboard   │
│              │  (LangGraph)  │    Base     │             │             │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│ PostgreSQL   ││ PostgreSQL   ││ PostgreSQL   ││ PostgreSQL   ││ PostgreSQL   │
│  (5432)      ││  (5433)      ││  (5434)      ││  (5435)      ││  (5436)      │
│ api_gateway  ││ agent_db +   ││ knowledge_   ││ wayfinder    ││ dashboard    │
│              ││ LangGraph    ││   schema     ││              ││             │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘└──────────────┘
                              │
                    ┌─────────┴─────────────────────┐
                    │   LangGraph Checkpoint     │
                    │  (checkpoints table)    │
                    └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        Shared Services                                   │
├─────────────────────────────────┬───────────────────────────────────────┤
│            Qdrant (6333)        │              Redis (6379)              │
│    Vector Embeddings Storage    │    Semantic Cache & Message Broker      │
└─────────────────────────────────┴───────────────────────────────────────┘
```

---

## 1. API Gateway Database

**Connection:** `postgresql+asyncpg://localhost:5432`  
**Schema:** `api_gateway`  
**Port:** 5432  
**ORM:** SQLModel (SQLAlchemy + Pydantic)

### Tables

#### `api_gateway.users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PK, UUID | Unique user identifier |
| email | VARCHAR(255) | UNIQUE, INDEX | User email address |
| hashed_password | VARCHAR(255) | NULLABLE | Bcrypt hashed password |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| is_superuser | BOOLEAN | DEFAULT FALSE | Admin flag |
| auth_provider | VARCHAR(20) | DEFAULT 'local' | 'local' or 'google' |
| google_id | VARCHAR(255) | UNIQUE, INDEX | Google OAuth subject ID |
| avatar_url | VARCHAR(500) | NULLABLE | OAuth avatar URL |
| display_name | VARCHAR(255) | NULLABLE | OAuth display name |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update timestamp |

> **Context/Usage:** Mỗi user trong hệ thống. Một user có thể đăng nhập bằng local (email/password) hoặc Google OAuth.

#### `api_gateway.roles`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PK, UUID | Unique role identifier |
| name | VARCHAR(50) | UNIQUE, INDEX | Role name |
| description | VARCHAR(255) | NULLABLE | Role description |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |

> **Context/Usage:** Phân quyền người dùng. Ví dụ: `admin`, `teacher`, `student`. Một role có thể được gán cho nhiều users.

#### `api_gateway.user_roles` (Junction Table)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | VARCHAR(36) | PK, FK | Reference to users.id |
| role_id | VARCHAR(36) | PK, FK | Reference to roles.id |

> **Context/Usage:** Quan hệ many-to-many giữa users và roles. Một user có thể có nhiều roles, một role có thể được gán cho nhiều users.

#### `api_gateway.threads`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PK, UUID | Unique thread identifier |
| user_id | VARCHAR(36) | FK, INDEX | Reference to users.id |
| agent_id | VARCHAR(100) | NULLABLE, INDEX | Associated agent ID |
| title | VARCHAR(255) | NULLABLE | Thread title |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update timestamp |

> **Context/Usage:** Thread/conversation của user với agent. Một user có thể có nhiều threads. Một thread thuộc về một user cụ thể.

#### `api_gateway.refresh_tokens`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(36) | PK, UUID | Unique token identifier |
| token | VARCHAR(500) | UNIQUE, INDEX | JWT refresh token string |
| user_id | VARCHAR(36) | FK, INDEX | Reference to users.id |
| is_revoked | BOOLEAN | DEFAULT FALSE, INDEX | Token revoked status |
| expires_at | TIMESTAMP | INDEX | Token expiration time |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| revoked_at | TIMESTAMP | NULLABLE | Revocation timestamp |
| user_agent | VARCHAR(500) | NULLABLE | Client user agent |
| ip_address | VARCHAR(45) | NULLABLE | Client IP (IPv6 max) |

> **Context/Usage:** Lưu trữ refresh tokens để renew JWT. Một user có thể có nhiều refresh tokens (từ nhiều thiết bị). Token bị revoke khi user logout hoặc đổi password.

### Service Relationships

```
api_gateway
│
├── users (1) ────────── (N) user_roles (N) ────────── (1) roles
├── users (1) ────────── (N) threads
├── users (1) ────────── (N) refresh_tokens
```

---

## 2. Agent Service Database

**Connection:** `postgresql+asyncpg://localhost:5433`  
**Schema:** `agent_schema`  
**Port:** 5433  
**ORM:** SQLAlchemy (async)

### Tables

#### `agent_schema.conversations`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR | PK, INDEX | **Conversation UUID** (thread_id) |
| user_id | VARCHAR | INDEX, NOT NULL | Owner user ID |
| title | VARCHAR | NULLABLE | Conversation title |
| updated_at | TIMESTAMP | AUTO UPDATE | Last activity |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| is_archived | BOOLEAN | DEFAULT FALSE | Archive status (soft delete) |

> **Context/Usage:** Lưu trữ metadata của cuộc trò chuyện. Mỗi conversation có một `id` duy nhất (thread_id). Một user có thể có nhiều conversations. Khi user chat, messages được lưu vào LangGraph checkpoint với thread_id = conversations.id.

#### `agent_schema.missing_knowledge_logs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR | PK, INDEX | Log UUID |
| user_id | VARCHAR | INDEX, NOT NULL | User who triggered |
| thread_id | VARCHAR | INDEX, NOT NULL | Thread context (FK to conversations.id) |
| query | VARCHAR | NOT NULL | Unanswered query |
| created_at | TIMESTAMP | DEFAULT NOW() | Log timestamp |

> **Context/Usage:** Ghi lại các câu hỏi mà hệ thống không trả lời được. Mỗi log thuộc về một conversation cụ thể (thread_id). Admin có thể xem log này để cập nhật knowledge base.

---

### LangGraph Checkpoint Storage

The Agent Service uses **LangGraph checkpoint** (Postgres/SQLite) to store conversation messages and agent state. This is separate from the `agent_schema`.

**Implementation:**
```python
# src/service/service.py:108
agent.checkpointer = saver  # LangGraph AsyncPostgresSaver/AsyncSqliteSaver
```

**Checkpointer Tables (created by LangGraph in `agent_schema` or separate DB):**

#### `checkpoints` table
```sql
CREATE TABLE checkpoints (
    thread_id TEXT NOT NULL,           -- Maps to conversations.id
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,      -- Agent state + messages
    metadata JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
```
> **Context/Usage:** Lưu trữ checkpoint cho mỗi lần chạy agent. Mỗi conversation (thread_id) có nhiều checkpoints (theo thời gian). Cột `checkpoint` JSONB chứa toàn bộ messages (AIMessage, HumanMessage, ToolMessage) và state của agent. checkpoint_id chính là run_id để trace trong LangSmith.

#### `checkpoint_blobs` table
```sql
CREATE TABLE checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
```
> **Context/Usage:** Lưu trữ binary data cho các channel values (trạng thái nội bộ của agent graph).

#### `checkpoint_writes` table
```sql
CREATE TABLE checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    task_path TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
```
> **Context/Usage:** Lưu trữ pending writes (action logs) cho các tác vụ bất đồng bộ.

**Key Relationships:**
- `thread_id` trong checkpoints = `conversations.id`
- Mỗi conversation có một chuỗi checkpoints theo `checkpoint_id`
- `parent_checkpoint_id` dùng để truy vết lịch sử (previous runs)

### Conversation & Message Flow

```
conversations (metadata)
│
├── id (thread_id) ──────────▶ checkpoints (thread_id)
│                                 │
│                                 ├── checkpoint_id (= run_id)
│                                 ├── parent_checkpoint_id
│                                 └── checkpoint JSONB contains:
│                                     ├── messages: [HumanMessage, AIMessage, ToolMessage, ...]
│                                     └── agent_state
│
└── missing_knowledge_logs (thread_id)
```

### Relationship: Agent Service ↔ API Gateway

```
API Gateway (users.id) ──────────▶ Agent Service (conversations.user_id)
      │                                    │
      │                                    ▼
      │                          LangGraph Checkpoints
      │                          (thread_id = conversations.id)
      │
      ▼
Refresh Tokens (user_id)
```

> **Context/Usage:** Khi user đăng nhập vào Agent Service qua API Gateway, JWT chứa user_id. Agent Service dùng user_id này để tạo/lấy conversation. ThreadId được tạo bởi client hoặc tự động sinh UUID.

---

## 3. Knowledge Base Database

**Connection:** `postgresql+asyncpg://localhost:5434`  
**Schema:** `knowledge_schema`  
**Port:** 5434  
**ORM:** SQLAlchemy (declarative base)

### Tables

#### `knowledge_schema.users`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| email | VARCHAR(255) | UNIQUE, INDEX | User email |
| full_name | VARCHAR(255) | NULLABLE | Full name |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** User quản lý tài liệu trong Knowledge Base. User trong KB service có thể khác với API Gateway (độc lập). Một user có thể tạo nhiều documents.

#### `knowledge_schema.roles`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR(50) | UNIQUE | Role name |
| description | VARCHAR(255) | NULLABLE | Role description |

> **Context/Usage:** Quản lý quyền truy cập tài liệu. Ví dụ: `admin`, `editor`, `viewer`. Một role có thể được gán cho nhiều users.

#### `knowledge_schema.user_roles` (Junction)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| user_id | INTEGER | PK, FK | Reference to users.id |
| role_id | INTEGER | PK, FK | Reference to roles.id |

> **Context/Usage:** Quan hệ many-to-many giữa users và roles trong KB service.

#### `knowledge_schema.tags`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR(100) | INDEX | Tag name |
| slug | VARCHAR(100) | UNIQUE, INDEX | URL-friendly slug |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** Tag để phân loại documents. Một tag có thể được gán cho nhiều documents.

#### `knowledge_schema.document_tags` (Junction)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| document_id | INTEGER | PK, FK | Reference to documents.id |
| tag_id | INTEGER | PK, FK | Reference to tags.id |

> **Context/Usage:** Quan hệ many-to-many giữa documents và tags. Một document có thể có nhiều tags.

#### `knowledge_schema.document_storages`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR(255) | INDEX | Storage name |
| description | TEXT | NULLABLE | Storage description |
| config | JSONB | NULLABLE | Configuration data |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** Lưu trữ cấu hình cho các storageBackends (local, S3, Azure Blob, v.v.). Một storage có thể chứa nhiều documents.

#### `knowledge_schema.documents`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| storage_id | INTEGER | FK | Reference to document_storages.id |
| title | VARCHAR(500) | NOT NULL | Document title |
| status | ENUM | INDEX | 'active', 'archived', 'deleted' |
| document_type | ENUM | NOT NULL | 'pdf', 'docx', 'txt', etc. |
| file_path | VARCHAR(1024) | NOT NULL | File storage path |
| file_size | INTEGER | DEFAULT 0 | File size in bytes |
| checksum | VARCHAR(64) | INDEX | SHA256 for deduplication |
| processing_status | ENUM | INDEX | 'pending', 'processing', 'completed', 'failed' |
| processing_error | TEXT | NULLABLE | Error message if failed |
| processing_started_at | TIMESTAMP | NULLABLE | Processing start time |
| processing_completed_at | TIMESTAMP | NULLABLE | Processing end time |
| meta_data | JSONB | DEFAULT {} | Extended metadata |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** Lưu trữ metadata của tài liệu upload. Một document thuộc về một storage. Document được chunk thành nhiều chunks để vectorize. Processing status dùng để track quá trình xử lý (chờ xử lý → đang xử lý → hoàn thành/thất bại).

#### `knowledge_schema.formal_documents`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| storage_id | INTEGER | FK | Reference to document_storages.id |
| file_path | VARCHAR(1024) | NOT NULL | File storage path |
| lightrag_track_id | VARCHAR(255) | INDEX | LightRAG tracking ID |
| lightrag_doc_id | VARCHAR(255) | NULLABLE, INDEX | LightRAG document ID |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** Lưu trữ tài liệu đã được index vào LightRAG. Một formal_document对应 một document trong bảng documents. Dùng để track document đã được index vào vector database.

#### `knowledge_schema.chunks`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| document_id | INTEGER | FK, INDEX | Reference to documents.id |
| chunk_index | INTEGER | NOT NULL | Position in document |
| content | TEXT | NOT NULL | Chunk text content |
| embedding_id | VARCHAR(100) | INDEX | Qdrant vector ID |
| chunk_metadata | JSONB | DEFAULT {} | Page number, section, etc. |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** Các đoạn text tách từ document. Một document có thể có nhiều chunks (1-N). Chunk được embed và lưu vào Qdrant với embedding_id. embedding_id dùng để link với vector.

**Constraints:**
- UNIQUE(document_id, chunk_index) - Prevent duplicate chunks

#### `knowledge_schema.faqs`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| source | ENUM | INDEX | 'document' or 'manual' |
| document_id | INTEGER | FK, NULLABLE, INDEX | Reference to documents.id |
| answer | TEXT | NOT NULL | FAQ answer |
| meta_data | JSONB | NULLABLE | Category, tags, etc. |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** FAQ entries. Có 2 loại: (1) manual - tạo thủ công, (2) document - trích xuất từ document. Một FAQ có thể có nhiều câu hỏi variants.

**Constraints:**
- CHECK: source='manual' implies document_id IS NULL
- CHECK: source='document' implies document_id IS NOT NULL

#### `knowledge_schema.faq_question_variants`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| faq_id | INTEGER | FK | Reference to faqs.id |
| question | TEXT | NOT NULL | Question text |
| embedding_id | VARCHAR(100) | INDEX | Qdrant vector ID |

> **Context/Usage:** Các biến thể câu hỏi cho cùng một FAQ. Một FAQ có thể có nhiều question_variants (cùng nghĩa, cách diễn đạt khác nhau). Mỗi variant được embed và lưu vào Qdrant.

#### `knowledge_schema.role_document_permissions`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| role_id | INTEGER | PK, FK | Reference to roles.id |
| document_id | INTEGER | PK, FK | Reference to documents.id |
| can_read | BOOLEAN | DEFAULT TRUE | Read permission |
| can_edit | BOOLEAN | DEFAULT FALSE | Edit permission |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | AUTO UPDATE | Last update |

> **Context/Usage:** RBAC cho documents. Mỗi role có thể có quyền khác nhau trên từng document. Một cặp (role, document) có một permission record.

### Data Flow

```
knowledge_schema
│
├── users (1) ────────── (N) documents
├── documents (1) ───── (N) chunks
├── documents (1) ───── (1) formal_documents
├── documents (1) ───── (N) faqs (when source='document')
├── faqs (1) ────────── (N) faq_question_variants
├── documents (1) ───── (N) document_tags (N) ───── (1) tags
│
├── roles (1) ────────── (N) user_roles (N) ───── (1) users
├── roles (1) ────────── (N) role_document_permissions (N) ─── (1) documents
│
└── document_storages (1) ──────── (N) documents
```

---

## 4. Wayfinder Database

**Connection:** `postgresql+asyncpg://localhost:5435`  
**Schema:** `wayfinder`  
**Port:** 5435  
**ORM:** SQLModel

### Tables

#### `wayfinder.wayfinder_building`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR | NOT NULL | Building name |
| description | TEXT | NULLABLE | Building description |

> **Context/Usage:** Các tòa nhà trong campus. Ví dụ: A1, B1, Cơ sở 2. Một building có thể có nhiều maps (nhiều tầng).

#### `wayfinder.wayfinder_map`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR | NOT NULL | Map name |
| image_url | VARCHAR | NOT NULL | Map image URL |
| floor_level | INTEGER | NULLABLE | Floor number |
| scale_ratio | FLOAT | DEFAULT 1.0 | Map scale |
| building_id | INTEGER | FK, NULLABLE | Reference to wayfinder_building.id |

> **Context/Usage:** Bản đồ của một tầng trong tòa nhà. Một map thuộc về một building. Một building có thể có nhiều maps (mỗi tầng là một map).

#### `wayfinder.wayfinder_node`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR | NOT NULL | Node name |
| x | FLOAT | NOT NULL | X coordinate |
| y | FLOAT | NOT NULL | Y coordinate |
| type | VARCHAR | DEFAULT 'path' | Node type |
| map_id | INTEGER | FK, INDEX | Reference to wayfinder_map.id |
| building_id | INTEGER | FK, NULLABLE | Reference to wayfinder_building.id |
| linked_node_ids | JSON | NULLABLE | Cross-floor/node links |
| linked_campus_node_id | INTEGER | FK, NULLABLE | Cross-building link |

> **Context/Usage:** Các điểm/endpoint trên bản đồ. Ví dụ: Classroom 101, Restroom, Elevator. Một node thuộc về một map. Các loại node: `path` (lối đi), `poi` (điểm quan tâm), `elevator`, `stair`, `entrance`. linked_node_ids dùng cho cross-floor navigation.

#### `wayfinder.wayfinder_alias`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| node_id | INTEGER | FK, INDEX | Reference to wayfinder_node.id |
| name | VARCHAR | NOT NULL | Alias name |

> **Context/Usage:** Tên gọi khác của node (để search). Ví dụ: Node "P.101" có thể có alias "Phòng 101", "Room 101". Một node có thể có nhiều aliases.

#### `wayfinder.wayfinder_edge`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| start_node_id | INTEGER | FK | Reference to wayfinder_node.id |
| end_node_id | INTEGER | FK | Reference to wayfinder_node.id |
| type | VARCHAR | NOT NULL | Edge type |
| weight | FLOAT | NOT NULL | Path weight (distance) |
| bidirectional | BOOLEAN | DEFAULT TRUE | Two-way path |
| polyline | JSON | NULLABLE | Path geometry |

> **Context/Usage:** Các lối đi giữa các nodes. Kết nối giữa 2 nodes tạo thành graph để find đường đi. bidirectional = true nếu đi được cả 2 chiều. weight = khoảng cách.

#### `wayfinder.wayfinder_event`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR | NOT NULL | Event name |
| description | TEXT | NULLABLE | Event description |
| start_date | VARCHAR | NOT NULL | Start date |
| end_date | VARCHAR | NULLABLE | End date |
| start_time | VARCHAR | NULLABLE | Start time |
| end_time | VARCHAR | NULLABLE | End time |
| location_name | VARCHAR | NULLABLE | Location name |
| node_id | INTEGER | FK, NULLABLE | Reference to wayfinder_node.id |
| organizer | VARCHAR | NULLABLE | Organizer name |
| category | VARCHAR | NULLABLE | Event category |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |
| created_at | VARCHAR | NULLABLE | Creation timestamp |

> **Context/Usage:** Các sự kiện trong campus. Event có thể được gán vào một node (location). User có thể xem event gần vị trí mình đang đứng.

#### `wayfinder.wayfinder_missing_location`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| name | VARCHAR | NOT NULL | Location name |
| building_name | VARCHAR | NULLABLE | Building name |
| floor_level | INTEGER | NULLABLE | Floor number |
| description | TEXT | NULLABLE | Description |
| requested_by | VARCHAR | NULLABLE | Requester info |
| status | VARCHAR | DEFAULT 'pending' | 'pending', 'resolved' |
| resolved_node_id | INTEGER | NULLABLE | Resolved node |
| resolved_at | VARCHAR | NULLABLE | Resolution time |
| resolved_by | VARCHAR | NULLABLE | Resolver info |
| admin_note | TEXT | NULLABLE | Admin notes |
| created_at | VARCHAR | NULLABLE | Creation timestamp |

> **Context/Usage:** User báo cáo location còn thiếu (chưa có trong hệ thống). Admin sẽ xem và resolve bằng cách tạo node mới hoặc map vào existing node.

#### `wayfinder.wayfinder_missing_route`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK | Auto-increment ID |
| start_node_id | INTEGER | NULLABLE | Start node |
| start_name | VARCHAR | NOT NULL | Start location name |
| start_building | VARCHAR | NULLABLE | Start building |
| start_floor | INTEGER | NULLABLE | Start floor |
| end_node_id | INTEGER | NULLABLE | End node |
| end_name | VARCHAR | NOT NULL | End location name |
| end_building | VARCHAR | NULLABLE | End building |
| end_floor | INTEGER | NULLABLE | End floor |
| reason | TEXT | NULLABLE | Missing route reason |
| status | VARCHAR | DEFAULT 'pending' | 'pending', 'resolved' |
| resolved_note | TEXT | NULLABLE | Resolution notes |
| resolved_at | VARCHAR | NULLABLE | Resolution time |
| resolved_by | VARCHAR | NULLABLE | Resolver info |
| reported_by | VARCHAR | NULLABLE | Reporter info |
| created_at | VARCHAR | NULLABLE | Creation timestamp |

> **Context/Usage:** User báo cáo không tìm được đường giữa 2 location. Admin sẽ xem và resolve bằng cách tạo thêm edges.

### Data Flow

```
wayfinder
│
├── wayfinder_building (1) ────────── (N) wayfinder_map
├── wayfinder_building (1) ────────── (N) wayfinder_node
│
├── wayfinder_map (1) ──────────────── (N) wayfinder_node
│
├── wayfinder_node (1) ────────────── (N) wayfinder_alias
├── wayfinder_node (1) ────────────── (N) wayfinder_edge (as start)
├── wayfinder_node (1) ────────────── (N) wayfinder_edge (as end)
├── wayfinder_node (1) ────────────── (N) wayfinder_event
│
├── wayfinder_event (N) ───────────── (1) wayfinder_node (optional)
│
└── wayfinder_missing_location / wayfinder_missing_route (user reports)
    └── resolved_node_id → wayfinder_node
```

---

## 5. Dashboard Database

**Connection:** `postgresql+asyncpg://localhost:5436`  
**Schema:** `dashboard`  
**Port:** 5436  
**ORM:** SQLModel

### Tables

#### `dashboard.dashboard_answer_ratings`
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Rating UUID |
| user_id | VARCHAR(36) | INDEX | User who rated |
| run_id | VARCHAR(255) | INDEX | AI answer run ID |
| rating | VARCHAR(10) | NOT NULL | 'LIKE' or 'DISLIKE' |
| comment | VARCHAR(1000) | NULLABLE | Feedback comment |
| thread_id | VARCHAR(36) | INDEX | Conversation thread ID |
| agent_id | VARCHAR(100) | INDEX, NULLABLE | Agent ID |
| created_at | TIMESTAMP | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL | Last update timestamp |

> **Context/Usage:** User feedback cho câu trả lời AI. Mỗi user chỉ rating một lần cho mỗi answer (run_id). Rating dùng để cải thiện AI. Comment là optional. thread_id và agent_id dùng để phân tích.

**Constraints:**
- UNIQUE(user_id, run_id) - One rating per user per answer
- CHECK: comment <= 1000 characters

---

## 6. Shared Services (NoSQL)

### Redis (Port 6379)
**Purpose:** Semantic caching and Celery message broker

| Database | Usage |
|----------|-------|
| 0 | Semantic cache + Celery broker |
| 1 | Celery result backend |

#### Redis Search Index Structure

**Index:** `idx:kb_sem_cache:{namespace}`

```json
{
  "query_mode": "TAG",
  "kb_version": "NUMERIC",
  "dense_vector": "VECTOR (HNSW, 6, FLOAT32, 3072 DIM, COSINE)"
}
```

> **Context/Usage:** Semantic cache dùng để cache câu hỏi và câu trả lời tương tự. KB version dùng để invalidate cache khi KB thay đổi.

#### Redis Key Examples

**1. Semantic Cache Entry:**
```
Key: kb_sem_cache:kb_2:{uuid}
Type: HASH
TTL: 86400 seconds (24 hours)

Fields:
├── query_text: "Cách đăng ký học phần?"
├── response_text: "Để đăng ký học phần, bạn cần..."
├── artifacts_json: "[{\"chunk_id\": 123, \"doc_id\": 456, ...}]"
├── dense_vector: "<binary float32 array, 3072 dimensions>"
├── created_at: "2025-01-03T10:30:00+00:00"
├── last_hit_at: "2025-01-03T11:45:00+00:00"
├── hit_count: "15"
├── kb_version: "42"
└── query_mode: "hybrid"
```

> **Context/Usage:** Cache entry lưu cả query vector và response. Khi có cache hit → trả response ngay không cần gọi Qdrant. hit_count dùng để analyze.

**2. Knowledge Base Version Key:**
```
Key: kb_sem_cache:kb_version:kb_2
Type: STRING (integer counter)
Value: "42"
```

> **Context/Usage:** Incremented mỗi khi KB thay đổi (document added/updated/deleted). Cache chỉ valid khi query với đúng version.

**3. Document Reverse Index:**
```
Key: kb_sem_cache:doc:kb_2:456
Type: SET
Members: ["kb_sem_cache:kb_2:uuid1", "kb_sem_cache:kb_2:uuid2", ...]
TTL: 86400 seconds
```

> **Context/Usage:** Dùng để invalidate all cache entries liên quan đến một document khi document thay đổi.

---

### Qdrant (Port 6333)
**Purpose:** Vector embeddings storage for RAG

**Collections:**
- `lightrag_vdb_chunks_{model_suffix}` - Document chunk vectors
- `lightrag_vdb_entities_{model_suffix}` - Knowledge graph entities
- `faqs` - FAQ question vectors

> **Context/Usage:** Vector database cho semantic search. Khi user query → embed query → search vectors → retrieve top-k chunks → generate answer.

#### Qdrant Point Structure

Each record in Qdrant is called a **Point** with the following structure:

```json
{
  "id": "abc123def456...",
  "vector": [0.123, -0.456, 0.789, ...],  // 768/1024/1536/3072 dimensions
  "payload": {
    "workspace_id": "default",
    "content": "Nội dung của chunk tài liệu...",
    "id": "chunk-uuid-123",
    "created_at": "2025-01-03T10:30:00+00:00",
    "entity_id": null,
    "document_id": 123,
    "chunk_index": 5,
    "file_path": "/documents/report.pdf",
    "meta_data": {
      "page_number": 3,
      "section": "Introduction"
    }
  }
}
```

> **Context/Usage:** Mỗi chunk tài liệu được embed thành một vector. Payload chứa metadata để retrieve và hiển thị. document_id link với PostgreSQL.

#### Workspace Isolation in Qdrant

> **Context/Usage:** Multi-tenant support. Mỗi workspace có collection riêng hoặc dùng workspace_id trong payload để filter.

---

## Inter-Service Relationships

### Complete Entity Relationship Diagram

```
┌─────────────────────┐
│   API Gateway      │
│  (port 5432)       │
│  api_gateway       │
└─────────┬──────────┘
          │
          │ users.id ─────▶ user_id
          ▼
┌─────────────────────────────┐
│    Agent Service         │
│    (port 5433)          │
│    agent_schema         │
└──────────┬────────────┬┴───────────────────┬──────────────┘
           │          │                 │
           ▼          ▼                 ▼
┌──────────────────┐  ┌───────────────────┐  ┌─────────────────┐
│ conversations    │  │ LangGraph        │  │ missing_       │
│ (id=thread_id)   │  │ Checkpoints     │  │ knowledge_logs│
│                 │  │ (thread_id FK) │  │              │
│ user_id ────────▶│  │ messages here │  │ thread_id ──▶│
└──────────────────┘  └───────────────┘  └──────────────┘
                               │
                               │ thread_id
                               │ run_id (feedback)
                               ▼
                      ┌────���─���───────────────┐
                      │    Dashboard         │
                      │   (port 5436)       │
                      │   dashboard          │
                      │                      │
                      │ answer_ratings       │
                      │ thread_id ───────────▶│
                      │ run_id ────────────▶│
                      └──────────────────────┘
```

### Service-to-Service Communication

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Service Communication Flow                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User Login                                                          │
│      │                                                               │
│      ▼                                                               │
│  ┌───────────┐  JWT   ┌──────────────┐                                │
│  │  API     │──────▶│  Agent      │                                │
│  │ Gateway  │       │  Service    │                                │
│  └───────────┘       └──────┬───────┘                                │
│                            │                                         │
│                            │ calls KB agent                             │
│                            ▼                                         │
│                     ┌──────────────┐                                  │
│                     │ Knowledge  │◀── Qdrant (vectors)                │
│                     │ Base       │◀── PostgreSQL (data)              │
│                     └──────────────┘                                  │
│                            │                                         │
│                            │ Feedback                                │
│                            ▼                                         │
│                     ┌──────────────┐                                  │
│                     │  Dashboard   │                                  │
│                     └──────────────┘                                  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Shared Services                           │  │
│  │  ┌─────────┐    ┌──────────┐    ┌─────────────────────┐  │  │
│  │  │  Redis  │    │ Qdrant   │    │  LangGraph Checkpoint│  │  │
│  │  │ Cache  │    │ Vectors  │    │  Messages/State      │  │  │
│  │  └─────────┘    └──────────┘    └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key ID Relationships Summary

| Context | Primary Key | Foreign Key References | Description |
|---------|-------------|---------------------|-------------|
| User | `api_gateway.users.id` | Agent Service → `conversations.user_id` | User identity across services |
| Conversation | `conversations.id` | Agent Service → `thread_id` via LangGraph checkpointer | Thread/conversation identifier |
| Message | LangGraph checkpoint `checkpoint_id` | Agent Service → `run_id` in ChatMessage | Each message is a checkpoint |
| Rating | `dashboard_answer_ratings.id` | Links to `thread_id`, `run_id` | Feedback on AI answers |
| Vector | Qdrant `id` | Knowledge Base → `chunks.embedding_id` | Vector reference |

---

## Database Connection Details

| Service | Host | Port | Database | Schema |
|---------|------|------|----------|--------|
| API Gateway | localhost | 5432 | api_gateway | api_gateway |
| Agent Service | localhost | 5433 | agent_db | agent_schema + checkpoints |
| Knowledge Base | localhost | 5434 | knowledge_db | knowledge_schema |
| Wayfinder | localhost | 5435 | wayfinder_db | wayfinder |
| Dashboard | localhost | 5436 | dashboard_db | dashboard |

---

## Data Flow Examples

### Example 1: User Chat Flow

```
1. User login → API Gateway (JWT issued with user_id)
    │
2. User sends message with thread_id (new or existing)
    │
3. Agent Service:
   ├── Validate JWT → Extract user_id
   ├── Get/Create conversation (conversations.id = thread_id)
   ├── Load checkpoint for thread_id → Get message history
   └── Run agent → Generate response
    │
4. LangGraph Checkpoint:
   ├── Save checkpoint with messages
   ├── checkpoint.thread_id = thread_id
   └── checkpoint.checkpoint contains AIMessage
    │
5. LangGraph Checkpoint → Qdrant (if RAG agent):
   ├── Embed query
   └── Retrieve relevant chunks
    │
6. Dashboard (optional): User rates answer
   └── answer_ratings: thread_id, run_id linked
```

### Example 2: Document Upload Flow (Knowledge Base)

```
1. User uploads PDF
    │
2. Knowledge Base Service:
   ├── Create Document record (id=123)
   ├── Chunk document (e.g., 10 chunks)
   └── Save to documents + chunks tables
    │
3. Embed chunks → Qdrant:
   ├── For each chunk: embed → save to Qdrant
   └── Update chunks.embedding_id
    │
4. Cache invalidation:
   ├── INCR kb_sem_cache:kb_version:kb_2
   └── Existing cache entries will be ignored (version mismatch)
```

### Example 3: Feedback Flow

```
1. User rates AI response
    │
2. Streamlit sends to API:
   POST /feedback
   {
     run_id: "uuid-123",     # From ChatMessage.run_id
     rating: "LIKE",
     thread_id: "uuid-456"   # From ChatMessage.thread_id
   }
    │
3. API Gateway → Dashboard:
   dashboard_answer_ratings
   ├── thread_id = conversations.id
   └── run_id = checkpoint checkpoint_id
    │
4. Later: LangSmith feedback
   Uses run_id to link to traced run
```

---

## Version

**Last Updated:** 2025-04-17  
**Version:** 1.2.0 (Added LangGraph checkpoint tables, relationships, and context)