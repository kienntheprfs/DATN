# Wayfinder Service - Tài liệu Chi tiết

## Tổng quan

Wayfinder Service là hệ thống định vị và dẫn đường nội thất (indoor navigation) cung cấp API để quản lý bản đồ, tòa nhà, và tính toán đường đi trong các không gian trong nhà. Service hỗ trợ tìm kiếm địa điểm, đề xuất tuyến đường, và quản lý dữ liệu địa lý không gian nội bộ.

## Công nghệ sử dụng

| Công nghệ | Mục đích |
|-----------|----------|
| **FastAPI** | REST API framework cho service |
| **PostgreSQL** | Database chính |
| **PostGIS** | Xử lý dữ liệu không gian (spatial data) |
| **GeoPandas** | Thao tác dữ liệu địa lý |
| **NetworkX** | Thuật toán đồ thị cho routing |
| **spaCy** | NLP cho tìm kiếm location |

### Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                 │
│                  (frontend-wayfinding/)                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Layer (FastAPI)                        │
│                      Port: 8001                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │  /buildings │ │   /routes   │ │   /maps     │              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │GeoService   │ │NLPService   │ │RoutingService│              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Access Layer                            │
│              (PostgreSQL + PostGIS)                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  │  Buildings  │ │    Nodes    │ │    Edges    │              │
│  └─────────────┘ └─────────────┘ └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Luồng hoạt động

### 1. Luồng tìm kiếm địa điểm (Location Search Flow)

```mermaid
flowchart TD
    A[User Search Query] --> B[API Request<br/>/api/maps/search]
    B --> C{NLP Processing}
    C -->|Fuzzy Match| D[Query Database]
    C -->|Entity Extract| E[Extract Keywords]
    E --> D
    D --> F{Results Found?}
    F -->|Yes| G[Return Results]
    F -->|No| H[Search Aliases]
    H --> I{Alias Found?}
    I -->|Yes| G
    I -->|No| J[Return Empty]
    
    G --> K[Sort by Relevance]
    K --> L[Return to User]
    J --> L
```

**Chi tiết luồng:**
1. User gửi query tìm kiếm (VD: "conference room near elevator")
2. API nhận request và chuyển qua NLP service
3. NLP service thực hiện:
   - Fuzzy matching với location names
   - Entity extraction (room type, landmarks)
   - Category matching
4. Query database với các điều kiện đã xử lý
5. Kết quả được sort theo relevance score
6. Trả về cho user

### 2. Luồng tính toán đường đi (Routing Flow)

```mermaid
flowchart TD
    A[Start: From/To Nodes] --> B[Validate Nodes]
    B --> C{Valid?}
    C -->|No| D[Return Error]
    C -->|Yes| E[Build Graph]
    
    E --> F[Apply Constraints]
    F -->|Accessible| G[Filter Accessible Edges]
    F -->|Avoid Elevator| H[Exclude Elevator Edges]
    F -->|No Constraints| I[Use All Edges]
    
    G --> J[Run Dijkstra Algorithm]
    H --> J
    I --> J
    
    J --> K{Path Found?}
    K -->|No| L[Return No Path]
    K -->|Yes| M[Calculate Metrics]
    
    M --> N[Distance: Sum Edge Distances]
    M --> O[Duration: Based on Edge Types]
    M --> P[Instructions: Node Sequence]
    
    N --> Q
    O --> Q
    P --> Q
    
    Q --> R[Return Route Result]
```

**Chi tiết luồng:**
1. User yêu cầu route với 2 điểm (from_node, to_node)
2. Validate các node có tồn tại và cùng building
3. Build graph từ edges trong database
4. Apply constraints (accessible, avoid elevator, etc.)
5. Chạy Dijkstra algorithm để tìm shortest path
6. Tính toán metrics (distance, duration)
7. Tạo step-by-step instructions
8. Return kết quả

### 3. Luồng quản lý tòa nhà (Building Management Flow)

```mermaid
flowchart TD
    A[Admin Action] --> B{Operation Type}
    
    B -->|Create| C[Create Building]
    B -->|Update| D[Update Building]
    B -->|Delete| E[Delete Building]
    B -->|List| F[List Buildings]
    
    C --> G[Validate Input]
    D --> G
    G --> H{Valid?}
    H -->|No| I[Return Validation Error]
    H -->|Yes| J[Save to Database]
    
    J --> K[PostGIS: Create Boundary]
    K --> L[Create Spatial Index]
    L --> M[Return Created Object]
    
    F --> N[Query Database]
    N --> O[Include Nodes/Edges?]
    O -->|Yes| P[Join Related Data]
    O -->|No| Q[Return Basic Data]
    
    P --> R[Return Complete Object]
    Q --> R
    
    E --> S[Check Dependencies]
    S --> T{Nodes/Edges Exist?}
    T -->|Yes| U[Block Delete]
    T -->|No| V[Delete Building]
    U --> W[Return Error]
    V --> X[Return Success]
```

### 4. Luồng multi-floor navigation

```mermaid
flowchart TD
    A[From: Floor 1] --> B[To: Floor 3]
    B --> C[Identify Floor Transition]
    C --> D{Floor Change Required?}
    D -->|Yes| E[Find Transition Nodes]
    E --> F[Elevator/Stairs Options]
    F --> G{User Preference}
    G -->|Elevator| H[Use Elevator Path]
    G -->|Stairs| I[Use Stairs Path]
    G -->|Shortest| J[Compare Both]
    
    H --> K[Calculate Wait Time]
    I --> L[Calculate Walking Time]
    J --> M{Select Optimal}
    M -->|Elevator| K
    M -->|Stairs| L
    
    K --> N[Total Route: Floor1 → Elevator → Floor3]
    L --> N
    
    N --> O[Return Multi-floor Route]
    D -->|No| P[Single Floor Route]
    P --> O
```

## Database Schema

### Entities Relationship

```mermaid
erDiagram
    BUILDINGS ||--o{ NODES : has
    BUILDINGS ||--o{ ROUTES : has
    NODES ||--o{ EDGES : connects
    NODES ||--o{ ALIASES : has
    NODES ||--o{ EVENTS : located_at
    EDGES ||--o{ ROUTES : part_of
    
    BUILDINGS {
        uuid id PK
        string name
        string description
        string address
        int floors
        float total_area
        polygon geo_boundary
        timestamp created_at
        timestamp updated_at
    }
    
    NODES {
        uuid id PK
        uuid building_id FK
        string name
        string node_type
        int floor
        point coordinates
        json properties
        boolean is_accessible
    }
    
    EDGES {
        uuid id PK
        uuid from_node_id FK
        uuid to_node_id FK
        float distance
        float travel_time
        string edge_type
        boolean is_accessible
    }
    
    ALIASES {
        uuid id PK
        uuid node_id FK
        string alias_name
    }
    
    EVENTS {
        uuid id PK
        uuid node_id FK
        string event_type
        timestamp start_time
        timestamp end_time
    }
```

## API Endpoints chi tiết

### Building Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/buildings` | List all buildings |
| POST | `/api/buildings` | Create new building |
| GET | `/api/buildings/{id}` | Get building details |
| PUT | `/api/buildings/{id}` | Update building |
| DELETE | `/api/buildings/{id}` | Delete building |

### Node Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nodes` | List all nodes |
| POST | `/api/nodes` | Create new node |
| GET | `/api/nodes/{id}` | Get node details |
| PUT | `/api/nodes/{id}` | Update node |
| DELETE | `/api/nodes/{id}` | Delete node |

### Routing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/routes` | Get route between points |
| POST | `/api/routes` | Calculate custom route |
| GET | `/api/routes/nearby` | Find nearby locations |
| GET | `/api/routes/accessible` | Accessibility-aware routes |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/maps/search` | Search locations |
| GET | `/api/aliases` | Get location aliases |
| POST | `/api/aliases` | Create alias |

## Cấu hình

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/wayfinder

# PostGIS Configuration
POSTGIS_VERSION=3.3
SPATIAL_REF_SYS=4326

# Service Configuration
DEBUG=false
CORS_ORIGINS=["http://localhost:3000"]
STATIC_FILES_PATH=./data

# Routing Configuration
DEFAULT_ROUTING_ALGORITHM=dijkstra
MAX_WALKING_DISTANCE=500
ELEVATOR_SPEED=2.0
STAIRS_SPEED=1.0

# NLP Configuration
NLP_MODEL=en_core_web_sm
FUZZY_MATCH_THRESHOLD=0.8
MAX_SEARCH_RESULTS=10
```

## Performance Optimization

### 1. Database Optimization
- **Spatial Indexing**: GIST indexes trên coordinates
- **Query Optimization**: Composite indexes cho frequently queries
- **Connection Pooling**: SQLAlchemy pool management
- **Materialized Views**: Pre-computed frequently accessed data

### 2. Algorithm Optimization
- **Pre-computed Routes**: Cache common routes
- **Hierarchical Pathfinding**: Multi-level graph approach
- **A* Implementation**: Heuristic-based search
- **Bidirectional Search**: Tìm kiếm từ cả hai đầu

### 3. Caching Strategy
- Route caching
- Search result caching  
- Static asset caching
- Database query caching

## Use Cases

### 1. Tìm phòng họp gần thang máy
```python
response = requests.get(
    'http://localhost:8001/api/maps/search',
    params={
        'query': 'meeting room near elevator',
        'building_id': 'building-uuid',
        'floor': 2
    }
)
# Result: ["Conference Room A", "Meeting Room 201"]
```

### 2. Tính đường đi từ cửa chính đến phòng
```python
response = requests.get(
    'http://localhost:8001/api/routes',
    params={
        'from_node': 'entrance-uuid',
        'to_node': 'room-uuid',
        'accessible': True
    }
)
# Result: {
#     "distance": 150,
#     "duration": 3,
#     "path": ["entrance", "hallway", "elevator", "floor2", "room"]
# }
```

### 3. Tạo tòa nhà mới
```python
building_data = {
    'name': 'Tech Building',
    'floors': 5,
    'geo_boundary': {
        'type': 'Polygon',
        'coordinates': [[...]]
    }
}
response = requests.post(
    'http://localhost:8001/api/buildings',
    json=building_data
)
```

## Monitoring

### Metrics quan trọng
- Route calculation time
- Search response time
- Database query performance
- API response times

### Business Metrics
- Popular destinations
- Common search queries
- Navigation success rates
