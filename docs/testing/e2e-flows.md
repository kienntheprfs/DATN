# Tài liệu Luồng nghiệp vụ E2E — DATN-Chatbot

## 1. Tổng quan kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────┐ │
│  │  Frontend   │  │   Dashboard   │  │   Mobile    │  │  Admin  │ │
│  │  (Next.js)  │  │  (FastAPI)    │  │  (Flutter)  │  │  Pages  │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬─────┘  └────┬────┘ │
│         │                │                 │             │       │
└─────────┼────────────────┼─────────────────┼─────────────┼───────┘
          │                │                 │             │
          ▼                ▼                 ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (FastAPI)                       │
│  - JWT Authentication / Token Refresh                           │
│  - Forward-auth with APISIX                                     │
│  - Route: /auth/*                                               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────────┬──────────────┐
          ▼             ▼                 ▼              ▼
┌──────────────┐ ┌────────────┐  ┌──────────────┐ ┌────────────┐
│  Wayfinder    │ │  Agent-    │  │  Dashboard   │ │  Common/   │
│  Backend      │ │  Service   │  │  Service     │ │  LightRAG  │
│  (FastAPI)    │ │  Toolkit   │  │  (FastAPI)   │ │  Services  │
└──────┬───────┘ └──────┬─────┘  └──────┬───────┘ └──────┬─────┘
       │                │               │               │
       ▼                ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data Layer                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ PostgreSQL │  │  SQLite    │  │  Redis     │  │  S3/Local │ │
│  │ (Main DB)  │  │ (Wayfinder)│  │ (Cache)    │  │  (Files)  │ │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Các service chính

| Service | Port | Chức năng |
|---------|------|-----------|
| **Frontend (Next.js)** | 3000 | Web UI chính — chat, navigation, admin, events, FAQ, knowledge |
| **API Gateway** | 8000 | Authentication, JWT, token refresh |
| **Knowledge Service** | 8000 | Document management, FAQ, LightRAG integration, vector search (Qdrant) |
| **Wayfinder Backend** | 8001 | Map editor, route finding, nodes/edges/aliases CRUD |
| **Agent Service (Toolkit)** | 8002 | LLM chatbot, streaming, threads, tools |
| **Dashboard Service** | 8003 | Ratings, pinned posts, topics management |
| **Mobile (Flutter)** | — | Voice chatbot app |

---

## 2. Luồng nghiệp vụ chi tiết (E2E Flows)

---

### FLOW-01: Đăng ký tài khoản (User Registration)

**Trigger:** User nhấn "Đăng ký" trên trang `/auth`

**Bước:**
1. User nhập email, password, confirm password, tên → Submit form
2. Frontend gửi `POST /api/auth/register` (payload: `{ email, password, full_name }`)
3. API Gateway nhận request → tạo user trong PostgreSQL → hash password (bcrypt) → trả về user info (không có password)
4. Nếu thành công → redirect đến trang login
5. Nếu thất bại → hiển thị lỗi (email trùng, password yếu, ...)

**Endpoints:**
- `POST /api/auth/register` → `200 User` | `400 Duplicate email` | `422 Validation error`

**Error paths:**
- Email đã tồn tại → `400`
- Password không đủ mạnh → `400`
- Thiếu trường bắt buộc → `422`

---

### FLOW-02: Đăng nhập (User Login)

**Trigger:** User nhấn "Đăng nhập" trên trang `/auth`

**Bước:**
1. User nhập email + password → Submit
2. Frontend gửi `POST /api/auth/login` (payload: `{ email, password }`)
3. API Gateway verify credentials → tạo JWT access_token + refresh_token → lưu refresh_token vào DB
4. Frontend nhận tokens → lưu `access_token`, `refresh_token`, `user` vào localStorage
5. Redirect về trang chủ `/`

**Endpoints:**
- `POST /api/auth/login` → `200 TokenResponse` | `401 Invalid credentials`
- `GET /api/auth/me` → Lấy thông tin user hiện tại

**Token Refresh Flow:**
1. API interceptor phát hiện token sắp hết hạn (< 5 phút)
2. Gửi `POST /api/auth/refresh` với `refresh_token`
3. API Gateway validate refresh_token → cấp access_token mới
4. Retry request ban đầu với token mới

**Error paths:**
- Sai email/password → `401`
- Refresh token hết hạn → `401` → redirect về `/auth`
- Token refresh đang chạy → queue request, đợi token mới

---

### FLOW-03: Đăng nhập bằng Google

**Trigger:** User nhấn "Sign in with Google"

**Bước:**
1. User chọn tài khoản Google → Google OAuth callback
2. Frontend nhận Google `credential` (ID token)
3. Gửi `POST /api/auth/google` (payload: `{ credential }`)
4. API Gateway verify Google token → tạo/tìm user → cấp JWT tokens
5. Redirect về trang chủ

**Endpoints:**
- `POST /api/auth/google` → `200 TokenResponse` | `401 Invalid Google token`

---

### FLOW-04: Chatbot hỏi đáp — Normal Mode

**Trigger:** User nhập câu hỏi tại trang chủ `/` → nhấn Enter

**Bước:**
1. User nhập câu hỏi → Frontend tạo `thread_id` (UUID)
2. Redirect đến `/chat?thread_id=xxx&message=...`
3. Frontend gọi SSE endpoint `POST /api/agent/stream?agent_id=chatbot`
   - Body: `{ message, thread_id, agent: "chatbot", query_mode: "normal", stream_tokens: true }`
   - Header: `Accept: text/event-stream`
4. Agent service stream response qua Server-Sent Events (SSE)
   - Các chunk types: `token` (text streaming), `message` (final answer), `citations_ready`, `error`
5. Frontend render từng token → hiển thị câu trả lời đầy đủ
6. Nếu có citations → hiển thị nguồn tham chiếu

**Endpoints:**
- `POST /api/agent/stream?agent_id=chatbot` → SSE stream
- `POST /api/agent/history` → `{ thread_id }` → lấy lịch sử chat
- `GET /api/agent/threads` → lấy danh sách threads

**Data flow:**
```
User → Frontend → /api/agent/stream (SSE) → Agent Service → LLM (OpenAI/Gemini)
                                                          ↓
User ← Frontend ← SSE chunks ← Agent Service ← LLM response
```

**Error paths:**
- Network error → Retry tối đa 3 lần (exponential backoff)
- LLM error → hiển thị lỗi trong chat
- Unauthorized → redirect về login

---

### FLOW-05: Chatbot hỏi đáp — Deep Mode

**Trigger:** User bật chế độ "Deep" trước khi gửi câu hỏi

**Bước:**
1. Giống Flow-04 nhưng `query_mode: "deep"`
2. Agent service sử dụng RAG (LightRAG) để truy vấn knowledge base
3. Tìm kiếm tài liệu liên quan → inject vào prompt → LLM sinh câu trả lời
4. Trả về kèm citations (nguồn tài liệu tham khảo)

**Endpoints:**
- `POST /api/agent/stream?agent_id=chatbot` với `query_mode: "deep"`

**Data flow:**
```
User Query → Agent Service → LightRAG (vector search) → Relevant docs
                             ↓
                      LLM with RAG context → Citations + Answer
```

---

### FLOW-06: Chatbot Voice — Mobile App

**Trigger:** User mở app Flutter → nhấn nút voice

**Bước:**
1. Mobile app khởi tạo `VoiceController` (speech-to-text)
2. User nói → app chuyển giọng nói thành text (STT)
3. Gửi text đến API agent service
4. Nhận response → chuyển thành giọng nói (TTS)
5. Phát audio cho user nghe

**Services:**
- `mobile_chatbot/lib/services/api_client.dart` → gọi API
- `mobile_chatbot/lib/services/voice_controller.dart` → xử lý voice
- `mobile_chatbot/lib/screens/voice_home_page.dart` → UI chính

---

### FLOW-07: Quản lý Conversation (Threads)

**Trigger:** User vào trang `/chat` → xem lịch sử

**Bước:**
1. Frontend gọi `GET /api/agent/threads?limit=20&offset=0`
2. Hiển thị danh sách threads với title, updated_at
3. User có thể:
   - **Xóa thread:** `DELETE /api/agent/threads/{threadId}`
   - **Đổi tiêu đề:** `PATCH /api/agent/threads/{threadId}/title` (body: `{ new_title }`)
   - **Xóa tất cả:** `DELETE /api/agent/threads`
   - **Xem lịch sử:** `POST /api/agent/history` (body: `{ thread_id }`)

**Endpoints:**
- `GET /api/agent/threads` → `200 ThreadListResponse`
- `DELETE /api/agent/threads/{threadId}` → `204`
- `PATCH /api/agent/threads/{threadId}/title` → `200`
- `POST /api/agent/history` → `200 ChatHistory`

---

### FLOW-08: Tạo Building (Tòa nhà)

**Trigger:** Admin vào trang editor → tạo tòa nhà mới

**Bước:**
1. Admin nhập tên building, mô tả, ảnh thực tế (optional)
2. Frontend gửi `POST /wayfinder/api/buildings`
3. Wayfinder Backend validate → tạo record trong SQLite → trả về building (có id)
4. Frontend cập nhật danh sách buildings

**Endpoints:**
- `POST /wayfinder/api/buildings` → `200 BuildingRead` | `400 Validation`
- `GET /wayfinder/api/buildings` → `200 BuildingRead[]`
- `GET /wayfinder/api/buildings/{id}` → `200 BuildingRead` | `404`
- `PATCH /wayfinder/api/buildings/{id}` → `200 BuildingRead` | `404`
- `DELETE /wayfinder/api/buildings/{id}` → `200 { ok: true }` | `404`

**DB operations:**
- INSERT vào `building` table
- DELETE (cascade: maps có `building_id = NULL`)

---

### FLOW-09: Tạo Map (Bản đồ tầng)

**Trigger:** Admin chọn building → thêm tầng mới

**Bước:**
1. Admin nhập: tên tầng, floor_level, scale_ratio (mét/pixel), chọn building
2. Upload ảnh bản đồ (PNG/JPG/WebP/SVG)
3. Frontend gửi `POST /wayfinder/api/maps` với `FormData`:
   - `name`, `floor_level`, `scale_ratio`, `building_id`, `file`
4. Wayfinder Backend:
   - Validate file type
   - Validate building_id tồn tại
   - Lưu file vào `data/uploads/map_{timestamp}.{ext}`
   - Tạo map record với `image_url = "uploads/map_xxx.png"`
   - Trả về map (có id)
5. Frontend hiển thị map trên canvas editor

**Endpoints:**
- `POST /wayfinder/api/maps` → `200 Map` | `400 Invalid file` | `404 Building not found`
- `GET /wayfinder/api/maps?building_id=X` → `200 Map[]`
- `GET /wayfinder/api/maps/campus` → `200 Map[]` (maps không thuộc building)
- `GET /wayfinder/api/maps/{id}` → `200 Map` | `404`
- `PATCH /wayfinder/api/maps/{id}` → `200 Map` | `404`
- `DELETE /wayfinder/api/maps/{id}` → `200` (xóa cả file ảnh, nodes, edges, aliases)

**DB operations:**
- INSERT vào `map` table
- Khi xóa: DELETE aliases → edges → nodes → map → file ảnh

**Scale ratio change:**
- Khi update `scale_ratio` → tự động tính lại weight của tất cả edges trong map

---

### FLOW-10: Tạo Node (Điểm trên bản đồ)

**Trigger:** Admin chọn "Add Node" → click trên canvas

**Bước:**
1. Admin click trên map → frontend lấy tọa độ (x, y)
2. Nhập tên node, type (path/stairs/elevator/entrance), aliases (optional)
3. Frontend gửi `POST /wayfinder/api/nodes`
4. Wayfinder Backend:
   - Validate map_id tồn tại
   - Auto-set `building_id` từ map
   - Tạo node → flush để lấy id
   - Tạo aliases nếu có
   - Commit → trả về node (có aliases, map, building)

**Endpoints:**
- `POST /wayfinder/api/nodes` → `200 NodeOut` | `404 Map not found`
- `GET /wayfinder/api/nodes?map_id=X` → `200 NodeOut[]`
- `GET /wayfinder/api/nodes/{id}` → `200 NodeOut` | `404`
- `PATCH /wayfinder/api/nodes/{id}` → `200 NodeOut` | `404`
- `DELETE /wayfinder/api/nodes/{id}` → `200` (xóa aliases + edges liên quan)

**DB operations:**
- INSERT vào `node` table
- INSERT vào `alias` table (nếu có aliases)
- Khi xóa: DELETE aliases → DELETE edges → DELETE node

**Linked nodes (2-way):**
- Khi update `linked_node_ids` → tự động set link ngược lại
- Ví dụ: Node A link tới Node B → Node B cũng link tới A
- Dùng cho cầu thang/thang máy liên tầng

**Linked campus node:**
- Khi update `linked_campus_node_id` → set link ngược lại
- Dùng cho entrance nodes nối building với campus map

---

### FLOW-11: Tạo Edge (Đường nối giữa 2 nodes)

**Trigger:** Admin chọn "Add Edge" → nối 2 nodes trên canvas

**Bước:**
1. Admin chọn start node → end node → vẽ polyline (optional)
2. Nhập type (walk/stairs/elevator/escalator/restricted)
3. Frontend gửi `POST /wayfinder/api/edges`
4. Wayfinder Backend:
   - Validate 2 nodes tồn tại và cùng map
   - Nếu không có polyline → tạo đường thẳng
   - Tính weight = `polyline_length * scale_ratio * type_factor`
   - Type factors: walk=1.0, stairs=2.0, elevator=1.5, escalator=1.0, restricted=999.0
   - Tạo edge → trả về

**Endpoints:**
- `POST /wayfinder/api/edges` → `200 EdgeOut` | `400 Same node` | `404 Node not found`
- `GET /wayfinder/api/edges?map_id=X` → `200 EdgeOut[]`
- `PATCH /wayfinder/api/edges/{id}` → `200 EdgeOut` | `404`
- `DELETE /wayfinder/api/edges/{id}` → `200 { ok: true }` | `404`

**DB operations:**
- INSERT vào `edge` table với weight đã tính

---

### FLOW-12: Tạo Alias (Tên gọi cho node)

**Trigger:** Admin đặt tên cho node hoặc user tìm kiếm địa điểm

**Bước:**
1. Frontend gửi `POST /wayfinder/api/aliases` (body: `{ node_id, name }`)
2. Backend validate node tồn tại → tạo alias → trả về

**Endpoints:**
- `POST /wayfinder/api/aliases` → `200 AliasOut` | `404 Node not found`
- `GET /wayfinder/api/aliases?node_id=X` → `200 AliasOut[]`
- `GET /wayfinder/api/aliases/search?q=xxx&limit=20` → `200 AliasSearchOut[]` (fuzzy match)
- `GET /wayfinder/api/aliases/all?map_id=X` → `200 AliasSearchOut[]` (tất cả locations)

**Search algorithm:**
- Fuzzy matching với `rapidfuzz.fuzz.token_set_ratio`
- So khớp cả alias name + building name
- Score > 40 → include kết quả
- Sort theo score giảm dần

---

### FLOW-13: Tìm đường (Route Finding — by Node IDs)

**Trigger:** User chọn điểm bắt đầu và điểm đến → nhấn "Tìm đường"

**Bước:**
1. Frontend gửi `GET /wayfinder/api/find?start_node_id=X&end_node_id=Y&map_id=Z`
2. Wayfinder Backend:
   - Validate start_node tồn tại
   - Lấy map của start node → lấy scale_ratio
   - Load/Build graph từ cache hoặc DB
   - Dùng Dijkstra (NetworkX) tìm shortest path
   - Generate human-readable instructions:
     - Step 1: "Bắt đầu từ {name}"
     - Intermediate steps: "Đi bộ Xm. Rẽ trái/phải/thẳng/chếch"
     - Floor change: "Đi cầu thang/thang máy lên/xuống tầng N"
     - Exit: "Ra {building_name}"
     - Entrance: "Vào {building_name}"
     - Last step: "Đã đến {destination}"
   - Build full polyline cho đường đi
3. Trả về `RouteResponse`:
   ```json
   {
     "map_id": 1,
     "path_coords": [[x1,y1], [x2,y2], ...],
     "path_node_ids": [1, 2, 3, ...],
     "total_distance_m": 45.5,
     "instructions": [
       { "step": 1, "text": "Bắt đầu từ Sảnh A", "action": "start", "distance_m": 0, "coordinate": [0,0] },
       { "step": 2, "text": "Đi bộ 15m. Rẽ trái", "action": "turn_left", "distance_m": 15, "coordinate": [10,0] },
       { "step": 3, "text": "Đi 20m. Đã đến Phòng 201", "action": "arrive", "distance_m": 20, "coordinate": [20,0] }
     ]
   }
   ```

**Endpoints:**
- `GET /wayfinder/api/find?start_node_id=X&end_node_id=Y` → `200 RouteResponse` | `400 Invalid node` | `404 No path`

**Graph caching:**
- Graph được cache trong memory + file JSON (`data/graph_cache.json`)
- Khi có thay đổi nodes/edges → cần gọi `POST /wayfinder/api/refresh-cache`

**Instruction actions:**
- `start` — Điểm bắt đầu
- `straight`, `turn_left`, `turn_right`, `slight_left`, `slight_right` — Hướng đi thường
- `use_stairs`, `use_elevator` — Chuyển tầng
- `exit`, `entrance` — Ra/vào tòa nhà
- `arrive` — Điểm đến

**Turn detection algorithm:**
- Tính góc giữa 3 điểm: prev → current → next
- `|angle| > 45°` → left/right
- `15° < |angle| <= 45°` → slight_left/slight_right
- `|angle| <= 15°` → straight

---

### FLOW-14: Tìm đường bằng tiếng Việt (Natural Language Query)

**Trigger:** User nhập "từ Sảnh A đến Thư viện" hoặc click trên bản đồ

**Bước:**
1. Frontend gửi `GET /wayfinder/api/query?map_id=X&q=từ Sảnh A đến Thư viện`
   - Hoặc: `GET /wayfinder/api/query?map_id=X&q=&cx=100&cy=200` (click trên bản đồ)
2. Wayfinder Backend:
   - Parse câu query bằng `extract_a_b()` → `start_txt`, `end_txt`
   - Patterns hỗ trợ:
     - "từ ... đến ..." → cả start và end
     - "đi từ ... tới ..." → cả start và end
     - "đến ...", "tới ...", "chỉ đường tới ..." → chỉ end
     - "tìm ...", "về ...", "sang ..." → chỉ end
   - Tìm start/end candidates bằng `find_best_alias_node()`:
     - Fuzzy matching với aliases + building names
     - Score > 50 → candidate
   - Ambiguity check:
     - Nếu nhiều candidates có score gần nhau (< 10 điểm chênh lệch) → báo lỗi "Tìm thấy nhiều địa điểm..."
     - Nếu có cx, cy → tìm node gần nhất
   - Dijkstra tìm đường → generate instructions → trả về

**Endpoints:**
- `GET /wayfinder/api/query?map_id=X&q=...` → `200 RouteResponse` | `400 Not found/Ambiguous` | `404 No path`

---

### FLOW-15: Refresh Graph Cache

**Trigger:** Admin thay đổi map data → cần cập nhật cache

**Bước:**
1. Frontend gửi `POST /wayfinder/api/refresh-cache`
2. Backend xóa cache trong memory + xóa file JSON
3. Rebuild graph từ DB → cache lại
4. Trả về `{ message, node_count }`

**Endpoints:**
- `POST /wayfinder/api/refresh-cache` → `200 { message, node_count }`

---

### FLOW-16: Upload ảnh

**Trigger:** Admin upload ảnh cho node, building, hoặc map

**Bước:**
1. Frontend gửi `POST /wayfinder/api/uploads/image` với `FormData` chứa file
2. Backend validate file type (png/jpg/webp/svg)
3. Tạo tên file duy nhất `img_{timestamp}.{ext}`
4. Lưu vào `data/uploads/`
5. Trả về `{ url: "uploads/img_xxx.png" }`

**Endpoints:**
- `POST /wayfinder/api/uploads/image` → `200 { url }` | `400 Invalid file` | `500 Storage error`

---

### FLOW-17: Admin — Clear Map Data

**Trigger:** Admin muốn xóa hết nodes/edges của một map

**Bước:**
1. Admin chọn map → nhấn "Clear Map"
2. Frontend gửi `POST /wayfinder/api/admin/clear-map`
   - Body: `{ map_id, delete_map: false, delete_upload: false }`
3. Backend:
   - Validate map tồn tại
   - Xóa aliases → edges → nodes của map
   - Nếu `delete_map=true` → xóa cả map record
   - Nếu `delete_upload=true` → xóa file ảnh

**Endpoints:**
- `POST /wayfinder/api/admin/clear-map` → `200 { ok, detail }` | `404 Map not found`

---

### FLOW-18: Admin — Get Full Map Details

**Trigger:** Admin xem chi tiết một map để debug/edit

**Bước:**
1. Frontend gửi `GET /wayfinder/api/admin/{map_id}/full`
2. Backend trả về map info + tất cả nodes (kèm aliases) + tất cả edges

**Endpoints:**
- `GET /wayfinder/api/admin/{map_id}/full` → `200 FullMapResponse` | `404`

---

### FLOW-19: Quản lý Sự kiện (Events CRUD)

**Trigger:** Admin tạo/sửa/xóa sự kiện

**Bước:**
1. **Tạo event:** `POST /wayfinder/api/events`
   - Body: `{ name, description, start_date, end_date, start_time, end_time, location_name, node_id, organizer, category, is_active }`
2. **Danh sách:** `GET /wayfinder/api/events?active_only=true&category=xxx`
3. **Tất cả (với location info):** `GET /wayfinder/api/events/all`
   - Trả về event + node_name, building_name, floor_level
4. **Sắp tới:** `GET /wayfinder/api/events/upcoming?limit=10`
   - Lọc `start_date >= today`, sort theo date
5. **Tìm kiếm:** `GET /wayfinder/api/events/search?q=xxx`
   - Fuzzy search với `rapidfuzz.fuzz.token_set_ratio`
6. **Chi tiết:** `GET /wayfinder/api/events/{id}`
7. **Cập nhật:** `PATCH /wayfinder/api/events/{id}`
8. **Xóa:** `DELETE /wayfinder/api/events/{id}`

**Data flow khi event có node_id:**
```
Event → node_id → Node → map_id → Map → building_id → Building
                                      ↓                    ↓
                                  floor_level          building_name
```

---

### FLOW-20: Báo cáo địa điểm thiếu (Missing Locations)

**Trigger:** User báo cáo "địa điểm này chưa có trên bản đồ"

**Bước:**
1. **Tạo báo cáo:** `POST /wayfinder/api/missing-locations`
   - Body: `{ name, building_name, floor_level, description, requested_by }`
   - Status mặc định: `pending`
2. **Danh sách:** `GET /wayfinder/api/missing-locations?status=pending&building=A4&limit=100`
3. **Thống kê:** `GET /wayfinder/api/missing-locations/stats`
   - Trả về: `{ total, pending, approved, resolved, rejected }`
4. **Chi tiết:** `GET /wayfinder/api/missing-locations/{id}`
5. **Cập nhật:** `PATCH /wayfinder/api/missing-locations/{id}`
   - Admin có thể đổi status, thêm resolved_node_id, admin_note
6. **Resolve:** `POST /wayfinder/api/missing-locations/{id}/resolve?resolved_node_id=X`
   - Set status = `resolved`, resolved_at = now
7. **Xóa:** `DELETE /wayfinder/api/missing-locations/{id}`

---

### FLOW-21: Báo cáo tuyến đường thiếu (Missing Routes)

**Trigger:** User báo cáo "không có đường đi từ A đến B"

**Bước:**
1. **Tạo báo cáo:** `POST /wayfinder/api/missing-routes`
   - Body: `{ start_name, start_building, start_floor, start_node_id, end_name, end_building, end_floor, end_node_id, reason, reported_by }`
2. **Danh sách:** `GET /wayfinder/api/missing-routes?status=pending&building=A4`
3. **Thống kê:** `GET /wayfinder/api/missing-routes/stats`
   - Trả về: `{ total, pending, resolved }`
4. **Cập nhật:** `PATCH /wayfinder/api/missing-routes/{id}`
5. **Resolve:** `POST /wayfinder/api/missing-routes/{id}/resolve?resolved_note=xxx`
6. **Xóa:** `DELETE /wayfinder/api/missing-routes/{id}`

---

### FLOW-22: Location Search & Guessing

**Trigger:** User tìm kiếm địa điểm trong app

**Bước:**
1. **Landmarks:** `GET /wayfinder/api/locations/landmarks`
   - Trả về tất cả buildings và nodes có `real_image_url`
2. **Guess:** `GET /wayfinder/api/locations/guess?query=xxx&limit=5`
   - Fuzzy matching với `unidecode` + `fuzz.partial_ratio`
   - Search trong buildings + nodes + aliases
   - Score > 60 → include kết quả
   - Trả về kèm score

---

### FLOW-23: Dashboard — Ratings

**Trigger:** User đánh giá câu trả lời chatbot / Admin quản lý ratings

**Service:** Dashboard Service (Port 8003)

**User Flow (Like/Dislike):**
1. User nhận câu trả lời chatbot → nhấn nút Like/Dislike
2. Frontend gửi `POST /dashboard/ratings`
   - Body: `{ run_id, rating: "LIKE" | "DISLIKE", comment?, thread_id, agent_id? }`
3. Nếu rating đã tồn tại cho run_id → update (upsert)
4. Nếu DISLIKE → user có thể nhập comment (optional)
5. Hiển thị trạng thái đánh giá (đã like/dislike)

**Admin Flow (Quản lý ratings):**
1. Admin vào `/admin/rating` → danh sách ratings với filter
2. Filter: ngày (from/to), loại rating (LIKE/DISLIKE), search keyword, sort
3. Frontend gọi `GET /dashboard/ratings/admin?page=1&page_size=20&search=xxx&rating=DISLIKE&from_date=2026-01-01&to_date=2026-05-08&sort_by=-created_at`
4. Admin nhấn vào row → mở DetailModal:
   - Tên user, tên thread, câu hỏi, câu trả lời, rating, comment
5. Admin có thể xóa rating không phù hợp → `DELETE /dashboard/ratings/{id}`
6. Xem thống kê theo agent → `GET /dashboard/ratings/stats/agent/{agent_id}`

**Endpoints:**

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/dashboard/ratings` | `RatingCreate { run_id, rating, comment?, thread_id, agent_id? }` | `RatingResponse` | Tạo/update rating (upsert by run_id) |
| DELETE | `/dashboard/ratings/{rating_id}` | — | 204 | Xóa rating (owner/admin only) |
| GET | `/dashboard/ratings/thread/{thread_id}` | — | `RatingResponse[]` | Lấy ratings trong thread |
| GET | `/dashboard/ratings/stats/agent/{agent_id}` | — | `RatingStats { total, like_count, dislike_count, like_percentage }` | Thống kê theo agent (admin) |
| GET | `/dashboard/ratings/admin` | Query: `page, page_size, search, rating, from_date, to_date, sort_by` | `RatingAdminListResponse { items, page, page_size, total_items, total_pages }` | Danh sách admin với filter |

**RatingCreate Schema:**
```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "rating": "LIKE",
  "comment": "Câu trả lời rất hữu ích",
  "thread_id": "thread-abc-123",
  "agent_id": "chatbot"
}
```

**Error paths:**
- 401: Thiếu/invalid `X-User-Id` header
- 403: Non-admin truy cập admin endpoints
- 422: Invalid payload (comment mà không có DISLIKE, invalid UUID)

---

### FLOW-24: Dashboard — Pinned Posts

**Trigger:** Admin quản lý bài viết ghim / User xem trên homepage

**Service:** Dashboard Service (Port 8003)

**Categories:** `"Quy chế Đào tạo" | "Sau Đại học" | "Công tác Sinh viên" | "Nghiên cứu Khoa học"`

**Admin Flow (CRUD):**
1. Admin vào `/admin/pinned-post` → danh sách bài viết (sort by manual order)
2. **Tạo bài mới:** Nhấn "Create new" → điền form (title, summary, category, document_type, source_url, tags[])
3. Frontend gửi `POST /dashboard/pinned-posts`
   - Body: `{ title, summary, document_type, source_url, category, tags }`
4. **Sắp xếp:** Drag-drop → frontend gửi `PUT /dashboard/pinned-posts/reorder`
   - Body: `{ ordered_post_ids: ["id1", "id2", "id3", ...] }`
5. **Sửa bài:** Nhấn edit → mở form pre-filled → `PUT /dashboard/pinned-posts/{id}`
6. **Xóa bài:** Confirm → `DELETE /dashboard/pinned-posts/{id}`
7. Admin xem thống kê: tổng số bài, số bài theo category

**User Flow (Public):**
1. User vào trang chủ `/` → thấy danh sách bài viết ghim
2. Frontend gọi `GET /dashboard/pinned-posts?limit=10&sort_by=manual`
3. Hiển thị theo thứ tự manual (drag-drop order)

**Endpoints:**

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/dashboard/pinned-posts` | Query: `limit, sort_by="manual"` | `PinnedPostPublicListResponse { items, total_items }` | Public list (homepage) |
| GET | `/dashboard/pinned-posts/admin` | Query: `page, page_size, search, category, sort_by` | `PinnedPostAdminListResponse { items, page, page_size, total_items, total_pages, stats }` | Admin list với stats |
| POST | `/dashboard/pinned-posts` | `PinnedPostCreate { title, summary, document_type, source_url, category, tags }` | `PinnedPostResponse` | Tạo bài (admin) |
| PUT | `/dashboard/pinned-posts/reorder` | `{ ordered_post_ids: string[] }` | `PinnedPostReorderResponse` | Sắp xếp lại (admin) |
| PUT | `/dashboard/pinned-posts/{post_id}` | `PinnedPostUpdate { title, summary, document_type, source_url, category, tags }` | `PinnedPostResponse` | Cập nhật (admin) |
| DELETE | `/dashboard/pinned-posts/{post_id}` | — | 204 | Xóa bài (admin) |

**PinnedPostCreate Schema:**
```json
{
  "title": "Quy chế đào tạo đại học 2025",
  "summary": "Quy chế mới áp dụng từ năm học 2025-2026",
  "document_type": "pdf",
  "source_url": "https://example.com/quy-che.pdf",
  "category": "Quy chế Đào tạo",
  "tags": ["quy che", "dao tao", "2025"]
}
```

**Error paths:**
- 401: Thiếu `X-User-Id` header
- 403: Non-admin truy cập admin endpoints
- 422: Thiếu required fields, invalid category

---

### FLOW-25: Dashboard — Topic Pipeline

**Trigger:** Admin chạy pipeline phân tích topic từ hội thoại user

**Service:** Dashboard Service (Port 8003)

**Pipeline Types:** `"missing_knowledge"` (chủ đề thiếu kiến thức) | `"popular_questions"` (câu hỏi phổ biến)

**Full Pipeline Flow:**
1. Admin vào `/admin/topic` → nhấn "Run Pipeline"
2. Chọn time range: `24h | 7d | 14d | 30d`
3. Frontend gửi `POST /dashboard/topics/jobs`
   - Body: `{ time_range: "7d" }`
4. Dashboard trigger pipeline → chạy cả 2 loại topic (missing_knowledge + popular_questions)
5. Frontend poll `GET /dashboard/topics/jobs/current` mỗi 3s để theo dõi tiến độ
6. Job status: `pending → running → succeeded | failed`
7. Job stages: `pending → loading_input → modeling → exporting_file → exporting_db → completed`
8. Pipeline hoàn thành → topics hiển thị trong danh sách
9. Frontend gọi `GET /dashboard/topics/results/latest/list?topic_type=missing_knowledge`
10. Admin chọn topic → xem chi tiết:
    - **Questions:** `GET /dashboard/topics/results/latest/questions?topic_type=missing_knowledge&topic_id=X&page=1&page_size=20`
    - **Trends:** `GET /dashboard/topics/results/latest/trends?topic_type=missing_knowledge&topic_id=X&view=week`
    - **Keywords:** `GET /dashboard/topics/results/latest/keywords?topic_type=missing_knowledge&topic_id=X`
11. Admin "pin" topic lên homepage:
    - `PATCH /dashboard/topics/results/{result_id}/topics/{topic_id}/pin`
    - Body: `{ pinned: true, knowledge_updated: false }`
12. Admin đánh dấu "knowledge updated":
    - Cùng endpoint: `{ pinned: false, knowledge_updated: true }`
13. Admin export CSV: `GET /dashboard/topics/jobs/{job_id}/export/csv`

**Endpoints:**

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/dashboard/topics/jobs` | `JobTriggerRequest { time_range }` | `JobTriggerResponse` (202) | Trigger pipeline job |
| GET | `/dashboard/topics/jobs/current` | — | `JobDetailResponse \| null` | Job hiện tại/mới nhất |
| GET | `/dashboard/topics/jobs/{job_id}` | — | `JobDetailResponse` | Chi tiết job |
| GET | `/dashboard/topics/jobs/{job_id}/export/csv` | — | FileResponse (CSV) | Tải báo cáo CSV |
| GET | `/dashboard/topics/results/latest` | Query: `topic_type` | `TopicResultSummary` | Kết quả mới nhất tóm tắt |
| GET | `/dashboard/topics/results/latest/list` | Query: `topic_type` | `TopicListResponse { items, total_topics, total_documents }` | Danh sách topics enriched |
| GET | `/dashboard/topics/results/latest/questions` | Query: `topic_type, topic_id, page, page_size, sort_by` | `TopicQuestionsResponse` | Câu hỏi phân trang |
| GET | `/dashboard/topics/results/latest/trends` | Query: `topic_type, topic_id, view: "day"\|"week"\|"month"` | `TopicTrendResponse { data: TrendDataPoint[] }` | Dữ liệu trend |
| GET | `/dashboard/topics/results/latest/keywords` | Query: `topic_type, topic_id` | `TopicKeywordsResponse { keywords }` | Keywords của topic |
| PATCH | `/dashboard/topics/results/{result_id}/topics/{topic_id}/pin` | `TopicPinRequest { pinned?, knowledge_updated? }` | `TopicPinResponse` | Update pin/knowledge state |

**Error paths:**
- 409: Đã có job đang chạy (active job exists)
- 404: Job hoặc result không tìm thấy
- 422: Invalid time_range hoặc view parameter

---

### FLOW-29: Knowledge — Document Management

**Trigger:** Admin quản lý tài liệu knowledge base

**Service:** Knowledge Service (Port 8000)

**Document Types:** Normal (vector embeddings) | Formal (LightRAG knowledge graph)

**Upload Flow:**
1. Admin vào `/admin/knowledge` → nhấn "Upload new document"
2. Chọn file (PDF, DOCX, TXT, MD, HTML, JSON)
3. Điền metadata: year, unit, document_type
4. Chọn loại: Normal Document hoặc Formal Document (LightRAG)
5. Option: "Auto-generate FAQ" checkbox
6. Frontend gửi `POST /kb/documents/upload` với FormData:
   - `file` (binary), `storage_id=2`, `auto_generate_faq=true/false`, `is_formal_doc=true/false`, `meta_data_json`
7. System trả về `202 Accepted`: `{ status: "queued", document_id, task_id, ... }`
8. Frontend poll status qua `GET /kb/documents/{document_id}`
9. Processing pipeline:
   - `pending → processing → completed | failed`
   - Nếu failed: hiển thị error message, admin có thể retry
10. Document hoàn thành → xuất hiện trong admin list
11. Admin xem chi tiết → `GET /kb/documents/{id}` (có sections, chunks count, embedding status)
12. Admin download file → `GET /kb/documents/{id}/file?is_formal_doc=true/false&download=true`
13. Admin update metadata → `PATCH /kb/documents/{id}`
14. Admin xóa document → `DELETE /kb/documents/{id}`
    - Status flow: `delete_pending → deleted | delete_failed`
    - Celery task xử lý xóa (PostgreSQL + Qdrant + LightRAG nếu formal)

**Admin List Flow:**
1. Admin vào `/admin/knowledge` → danh sách documents
2. Filter: search keyword, year, unit, document_type, class (normal/formal)
3. Frontend gọi `GET /kb/documents/admin/list` với query params
4. Hiển thị: title, status, document_type, year, unit, created_at, actions
5. Admin có thể toggle normal/formal filter

**Formal Document Sync:**
1. Formal document được ingest vào LightRAG knowledge graph
2. Admin sync từ LightRAG → `POST /kb/documents/formal-documents/{id}/sync`
3. LightRAG re-indexes entities + relationships

**Endpoints:**

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| POST | `/kb/documents/upload` | FormData: `file, storage_id, auto_generate_faq, is_formal_doc, meta_data_json` | `{ status, document_id, task_id }` | Upload document (async) |
| GET | `/kb/documents` | Query: `skip, limit, storage_id` | `DocumentResponse[]` | List documents |
| GET | `/kb/documents/admin/list` | Query: `page, page_size, search, year, unit, document_type, is_formal_doc, storage_id` | `AdminDocumentListResponse { items, page, page_size, total_items, total_pages }` | Admin list với filters |
| GET | `/kb/documents/{document_id}` | — | `DocumentDetailResponse` | Document details |
| GET | `/kb/documents/{document_id}/file` | Query: `is_formal_doc, download` | StreamingResponse | Stream/download file |
| PATCH | `/kb/documents/{document_id}` | `DocumentUpdate { title?, status?, meta_data? }` | `DocumentResponse` | Update metadata |
| DELETE | `/kb/documents/{document_id}` | Query: `is_formal_doc` | 202 | Delete document (async) |
| GET | `/kb/documents/formal-documents` | Query: `skip, limit, storage_id` | `FormalDocumentResponse[]` | List formal documents |
| PATCH | `/kb/documents/formal-documents/{document_id}` | `FormalDocumentUpdate` | `FormalDocumentResponse` | Update formal document |
| POST | `/kb/documents/formal-documents/{document_id}/sync` | — | `FormalDocumentResponse` | Sync từ LightRAG |

**Error paths:**
- 404: Document not found
- 409: Cannot delete khi status = pending/processing
- 422: Invalid meta_data JSON
- 413: File too large

---

### FLOW-30: Knowledge — FAQ Management

**Trigger:** Admin quản lý FAQ / System auto-generate từ document ingestion

**Service:** Knowledge Service (Port 8000)

**FAQ Sources:** `"document"` (auto-generated) | `"manual"` (admin-created)

**Manual FAQ CRUD Flow:**
1. Admin vào trang FAQ management (tích hợp trong `/admin/knowledge`)
2. Nhấn "Add FAQ" → nhập answer + multiple question variations
3. Frontend gửi `POST /kb/faqs`
   - Body: `{ answer, questions: ["Q1", "Q2", "Q3"], meta_data? }`
4. System lưu vào PostgreSQL + index vào Qdrant vector DB
5. FAQ xuất hiện trong danh sách
6. Admin edit FAQ → `PATCH /kb/faqs/{id}`
   - Body: `{ answer?, meta_data? }`
7. Admin xóa FAQ → `DELETE /kb/faqs/{id}`
   - Xóa khỏi cả PostgreSQL và Qdrant vector store
8. Admin xem danh sách → `GET /kb/faqs?skip=0&limit=50`

**Auto-generated FAQ Flow:**
1. Admin upload document với `auto_generate_faq=true`
2. Document ingestion pipeline:
   - Split document into chunks
   - LLM generates Q&A pairs from each chunk
   - Each FAQ stored with `source: "document"` + `document_id`
3. Generated FAQs appear in the list, admin can review/edit/delete

**Question Variations:**
- Mỗi FAQ có nhiều question variations (different ways to ask the same question)
- Variations được embed vào Qdrant để semantic search
- Khi user hỏi, system tìm kiếm vector match → trả về FAQ phù hợp nhất

**Endpoints:**

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/kb/faqs` | Query: `skip, limit` | `FAQResponse[]` | List all FAQs |
| POST | `/kb/faqs` | `FAQCreate { answer, questions: string[], meta_data? }` | `FAQResponse` | Tạo manual FAQ |
| GET | `/kb/faqs/{faq_id}` | — | `FAQResponse` | Get FAQ by ID |
| PATCH | `/kb/faqs/{faq_id}` | `FAQUpdate { answer?, meta_data? }` | `FAQResponse` | Update FAQ |
| DELETE | `/kb/faqs/{faq_id}` | — | 204 | Xóa FAQ (PostgreSQL + Qdrant) |
| GET | `/kb/faqs/manual` | Query: `skip, limit` | `FAQResponse[]` | List manual FAQs (legacy) |
| POST | `/kb/faqs/manual` | `ManualFAQCreate` | `FAQResponse` | Create manual FAQ (legacy) |

**FAQResponse Schema:**
```json
{
  "id": 1,
  "source": "document",
  "document_id": 5,
  "answer": "Để đăng ký học phần, sinh viên truy cập cổng thông tin...",
  "meta_data": {},
  "questions": [
    { "id": 1, "question": "Làm sao để đăng ký học phần?", "embedding_id": "vec-abc" },
    { "id": 2, "question": "Hướng dẫn đăng ký môn học", "embedding_id": "vec-def" }
  ],
  "created_at": "2026-05-08T10:00:00Z",
  "updated_at": "2026-05-08T10:00:00Z"
}
```

**Error paths:**
- 404: FAQ not found
- 422: Missing answer, empty questions array

---

### FLOW-31: Knowledge — Storage Management

**Trigger:** Admin quản lý KB storages (kho tài liệu)

**Service:** Knowledge Service (Port 8000)

**Flow:**
1. Admin tạo storage mới → `POST /kb/doc-storages/`
   - Body: `{ name, config? }`
   - Config: chunk_size, overlap, embedding_model
2. Danh sách storages → `GET /kb/doc-storages/?skip=0&limit=50`
3. Xem chi tiết → `GET /kb/doc-storages/{storage_id}`
4. Update → `PATCH /kb/doc-storages/{storage_id}`
5. Xóa → `DELETE /kb/doc-storages/{storage_id}`
   - Cascade: xóa tất cả documents thuộc storage đó

**Endpoints:**

| Method | Path | Request Body | Response | Description |
|--------|------|--------------|----------|-------------|
| POST | `/kb/doc-storages/` | `StorageCreate { name, config? }` | `StorageResponse` (201) | Tạo storage |
| GET | `/kb/doc-storages/` | Query: `skip, limit` | `StorageResponse[]` | List storages |
| GET | `/kb/doc-storages/{storage_id}` | — | `StorageResponse` | Chi tiết storage |
| PATCH | `/kb/doc-storages/{storage_id}` | `StorageUpdate { name?, description?, config? }` | `StorageResponse` | Update storage |
| DELETE | `/kb/doc-storages/{storage_id}` | — | 204 | Xóa storage (cascade) |

---

### FLOW-32: Agent — Admin Conversation Export for Topic Modeling

**Trigger:** Dashboard topic pipeline cần export hội thoại để phân tích

**Service:** Agent Service (Port 8002)

**Flow:**
1. Dashboard trigger topic pipeline → `POST /dashboard/topics/jobs`
2. Topic pipeline gọi Agent Service: `GET /api/agent/admin/conversations/messages?from_ts=1714521600&to_ts=1717113600&page=1&page_size=1000`
3. Agent Service lấy human messages từ LangGraph checkpoints
4. Trả về paginated messages với: user_id, thread_id, timestamp, content
5. Pipeline xử lý messages cho topic modeling (BERTopic)
6. Kết quả: missing_knowledge topics + popular_questions topics

**Endpoints:**

| Method | Path | Query Params | Response | Description |
|--------|------|--------------|----------|-------------|
| GET | `/api/agent/admin/conversations/messages` | `from_ts, to_ts, page, page_size` | `AdminConversationMessagesResponse { items, total, page, page_size }` | Export messages cho topic modeling |

**AdminConversationMessagesResponse Schema:**
```json
{
  "items": [
    {
      "user_id": "user-123",
      "thread_id": "thread-abc",
      "timestamp": 1714600000,
      "content": "Làm sao để đăng ký học phần?"
    }
  ],
  "total": 5000,
  "page": 1,
  "page_size": 1000
}
```

---

### FLOW-26: Map Editor — End-to-End Workflow

**Trigger:** Admin tạo bản đồ mới từ đầu đến khi user tìm được đường

**Full workflow:**
```
1. POST /wayfinder/api/buildings          → Tạo "Tòa A4"
2. POST /wayfinder/api/maps               → Upload ảnh "Tầng 1", gán building_id
3. POST /wayfinder/api/nodes              → Tạo node "Sảnh A" (0, 0)
4. POST /wayfinder/api/nodes              → Tạo node "Hành lang" (100, 0)
5. POST /wayfinder/api/nodes              → Tạo node "Phòng 201" (200, 0)
6. POST /wayfinder/api/nodes              → Tạo node "Cầu thang" (200, 100, type=stairs)
7. POST /wayfinder/api/edges              → Nối Sảnh A → Hành lang
8. POST /wayfinder/api/edges              → Nối Hành lang → Phòng 201
9. POST /wayfinder/api/edges              → Nối Hành lang → Cầu thang
10. POST /wayfinder/api/aliases           → Alias "Sảnh A" cho node 1
11. POST /wayfinder/api/aliases           → Alias "Phòng 201" cho node 3
12. POST /wayfinder/api/refresh-cache     → Refresh graph cache

--- TẦNG 2 ---
13. POST /wayfinder/api/maps              → Upload ảnh "Tầng 2", gán building_id
14. POST /wayfinder/api/nodes             → Tạo node "Cầu thang F2" (200, 100, type=stairs)
15. POST /wayfinder/api/nodes             → Tạo node "Phòng 301" (300, 100)
16. PATCH /wayfinder/api/nodes/{stairF1}  → linked_node_ids: [stairF2_id]
17. POST /wayfinder/api/edges             → Nối Cầu thang F2 → Phòng 301

--- CAMPUS MAP ---
18. POST /wayfinder/api/maps              → Tạo "Campus Map" (không building_id)
19. POST /wayfinder/api/nodes             → Tạo node "Cổng chính" (0, 0)
20. PATCH /wayfinder/api/nodes/{entrance} → linked_campus_node_id: [campus_gate_id]

--- TÌM ĐƯỜNG ---
21. GET /wayfinder/api/find?start=1&end=5 → Tìm đường Sảnh A → Phòng 301
    → Response: path qua cầu thang, instructions "Đi cầu thang lên tầng 2"
22. GET /wayfinder/api/query?q=từ Sảnh A đến Phòng 301 → Natural language query
```

---

### FLOW-27: Frontend Navigation Flow

**Trigger:** User truy cập trang web

**Bước:**
1. User vào `/` → Trang chủ với chat input, suggestions
2. Nhập câu hỏi → redirect `/chat?thread_id=...&message=...`
3. Trang chat hiển thị:
   - Messages list (user + assistant)
   - Streaming text (token by token)
   - Tool calls (nếu có)
   - Citations (nếu có)
   - MapPreview (nếu là route finding)
4. Sidebar hiển thị:
   - Thread history
   - New chat button
5. User có thể:
   - `/events` → Xem sự kiện
   - `/faq` → Xem FAQ
   - `/knowledge` → Xem kiến thức
   - `/history` → Xem lịch sử chat
   - `/profile` → Xem profile
   - `/pinned-post` → Xem bài viết ghim
6. Admin pages (`/admin/*`):
   - `/admin/faq` → Quản lý FAQ
   - `/admin/knowledge` → Quản lý knowledge
   - `/admin/missing-in-map` → Quản lý missing locations/routes
   - `/admin/pinned-post` → Quản lý pinned posts
   - `/admin/rating` → Xem ratings
   - `/admin/topic` → Quản lý topics

---

### FLOW-28: Logout

**Trigger:** User nhấn "Đăng xuất"

**Bước:**
1. Frontend gửi `POST /api/auth/logout` (body: `{ refresh_token }`)
2. API Gateway invalidate refresh_token trong DB
3. Frontend xóa `access_token`, `refresh_token`, `user` khỏi localStorage
4. Redirect về `/auth`

---

## 3. Database Schema (Tóm tắt)

### Wayfinder DB (SQLite)

| Table | Key Fields | Relationships |
|-------|-----------|---------------|
| `building` | id, name, description, real_image_url | 1:N → map |
| `map` | id, name, floor_level, scale_ratio, image_url, building_id | FK → building, 1:N → node |
| `node` | id, map_id, name, x, y, type, linked_node_ids, linked_campus_node_id, building_id, description, real_image_url | FK → map, 1:N → alias, 1:N → edge |
| `edge` | id, start_node_id, end_node_id, type, polyline, weight, bidirectional | FK → node (start, end) |
| `alias` | id, node_id, name | FK → node |
| `event` | id, name, description, start_date, end_date, start_time, end_time, location_name, node_id, organizer, category, is_active, created_at | FK → node |
| `missing_location` | id, name, building_name, floor_level, description, requested_by, status, resolved_node_id, resolved_at, resolved_by, admin_note, created_at | — |
| `missing_route` | id, start_name, start_building, start_floor, start_node_id, end_name, end_building, end_floor, end_node_id, reason, status, resolved_note, resolved_at, resolved_by, reported_by, created_at | — |

### Main DB (PostgreSQL)

| Table | Service |
|-------|---------|
| `user` | API Gateway |
| `thread` | Agent Service |
| `message` | Agent Service |
| `refresh_token` | API Gateway |
| `rating` | Dashboard |
| `pinned_post` | Dashboard |
| `topic` | Dashboard |
| `faq` | Agent Service |
| `knowledge_document` | Agent Service |

### Knowledge DB (PostgreSQL)

| Table | Key Fields | Relationships |
|-------|-----------|---------------|
| `document` | id, title, storage_id, status, is_formal_doc, file_path, file_size, mime_type, meta_data, created_at, updated_at | FK → doc_storage, 1:N → faq (auto-generated) |
| `doc_storage` | id, name, description, config (chunk_size, overlap, embedding_model), created_at | 1:N → document |
| `faq` | id, source ("document"\|"manual"), document_id, answer, meta_data, created_at, updated_at | FK → document (nullable for manual) |
| `faq_question` | id, faq_id, question, embedding_id | FK → faq, 1:N per FAQ |

---

## 4. Authentication & Authorization

### JWT Token Flow

```
┌──────┐         ┌────────────┐         ┌─────────────┐
│Client│         │API Gateway │         │   Database   │
└──┬───┘         └─────┬──────┘         └──────┬──────┘
   │ POST /auth/login   │                      │
   │───────────────────>│                      │
   │                    │ Verify credentials   │
   │                    │─────────────────────>│
   │                    │<─────────────────────│
   │                    │ Generate JWT         │
   │ 200 {access,refresh}                      │
   │<───────────────────│                      │
   │                    │                      │
   │ GET /protected + Bearer token             │
   │───────────────────>│                      │
   │                    │ Validate JWT         │
   │                    │─────────────────────>│
   │ 200 Data           │<─────────────────────│
   │<───────────────────│                      │
```

### Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — CRUD all resources, admin pages |
| **User** | Chat, view events, report missing, view maps |
| **Guest** | Public endpoints only (view maps, search) |

---

## 5. Error Handling Standard

| HTTP Code | Meaning | Client Action |
|-----------|---------|---------------|
| `400` | Bad Request — Validation failed | Show error message, ask user to fix input |
| `401` | Unauthorized — Invalid/expired token | Redirect to login, clear tokens |
| `404` | Not Found — Resource doesn't exist | Show "not found" message |
| `422` | Unprocessable Entity — Schema validation | Show field-level errors |
| `500` | Internal Server Error | Show generic error, retry |
| `502/503` | Service unavailable | Show maintenance message, retry |

### Frontend Retry Logic
- Max retries: 3
- Backoff: exponential (1s, 2s, 4s)
- Retryable: 408, 429, 5xx, network errors
- Not retryable: 400, 401, 403, 404, 422

---

## 6. Key Data Structures

### RouteResponse
```typescript
interface RouteResponse {
  map_id: number;
  path_coords: [number, number][];  // Polyline for rendering
  path_node_ids: number[];           // Node sequence
  total_distance_m: number;          // Total distance in meters
  instructions: Instruction[];       // Step-by-step directions
}

interface Instruction {
  step: number;
  text: string;          // Vietnamese instruction text
  action: string;        // start|straight|turn_left|turn_right|slight_left|slight_right|use_stairs|use_elevator|exit|entrance|arrive
  distance_m: number;    // Distance for this step
  coordinate: [number, number];  // [x, y] position
}
```

### Node Types
- `path` — Normal walking path
- `stairs` — Staircase (cross-floor)
- `elevator` — Elevator (cross-floor)
- `entrance` — Building entrance (building ↔ campus)

### Edge Types
- `walk` — Normal walking (factor: 1.0)
- `stairs` — Stairs (factor: 2.0)
- `elevator` — Elevator (factor: 1.5)
- `escalator` — Escalator (factor: 1.0)
- `restricted` — Restricted area (factor: 999.0)

---

## 7. E2E Test Scenarios Checklist

### Authentication
- [ ] E2E-AUTH-01: Register → Login → Access protected resource
- [ ] E2E-AUTH-02: Login → Token expires → Auto refresh → Retry
- [ ] E2E-AUTH-03: Login → Refresh token expires → Redirect to login
- [ ] E2E-AUTH-04: Google login → Access protected resource
- [ ] E2E-AUTH-05: Logout → Tokens cleared → Cannot access protected

### Map Editor
- [ ] E2E-EDITOR-01: Create building → Create map → Upload image
- [ ] E2E-EDITOR-02: Create nodes → Create edges → Verify graph
- [ ] E2E-EDITOR-03: Create aliases → Search alias → Verify results
- [ ] E2E-EDITOR-04: Link nodes (2-way) → Verify cross-floor connection
- [ ] E2E-EDITOR-05: Set linked_campus_node_id → Verify entrance/exit route
- [ ] E2E-EDITOR-06: Update scale_ratio → Verify edge weights recalculated
- [ ] E2E-EDITOR-07: Delete map → Verify file + nodes + edges + aliases deleted
- [ ] E2E-EDITOR-08: Clear map data → Verify only nodes/edges deleted

### Route Finding
- [ ] E2E-ROUTE-01: Find route same floor → Verify instructions + distance
- [ ] E2E-ROUTE-02: Find route cross-floor (stairs) → Verify "cầu thang" instruction
- [ ] E2E-ROUTE-03: Find route cross-floor (elevator) → Verify "thang máy" instruction
- [ ] E2E-ROUTE-04: Find route building → campus → Verify "ra khỏi tòa nhà"
- [ ] E2E-ROUTE-05: Find route campus → building → Verify "vào" instruction
- [ ] E2E-ROUTE-06: Query natural language "từ A đến B" → Verify route
- [ ] E2E-ROUTE-07: Query with ambiguity → Verify error message
- [ ] E2E-ROUTE-09: No path exists → Verify 404 error
- [ ] E2E-ROUTE-10: Invalid node IDs → Verify 400 error
- [ ] E2E-ROUTE-11: Refresh cache → Verify new nodes included
- [ ] E2E-ROUTE-12: Route with polyline edges → Verify correct distance

### Chatbot
- [ ] E2E-CHAT-01: Send message → Receive streaming response
- [ ] E2E-CHAT-02: Deep mode query → Receive RAG response with citations
- [ ] E2E-CHAT-03: Create thread → View history → Continue conversation
- [ ] E2E-CHAT-04: Delete thread → Verify history gone
- [ ] E2E-CHAT-05: Rename thread → Verify new title

### Events
- [ ] E2E-EVENT-01: Create event with node_id → Verify location info
- [ ] E2E-EVENT-02: Search events → Verify fuzzy matching
- [ ] E2E-EVENT-03: Upcoming events → Verify only future events
- [ ] E2E-EVENT-04: Update event → Verify changes
- [ ] E2E-EVENT-05: Delete event → Verify 404

### Missing Reports
- [ ] E2E-MISSING-01: Report missing location → Admin resolves → Verify status
- [ ] E2E-MISSING-02: Report missing route → Admin resolves → Verify status
- [ ] E2E-MISSING-03: Stats endpoint → Verify counts correct
- [ ] E2E-MISSING-04: Filter by status/building → Verify results

### Admin
- [ ] E2E-ADMIN-01: Get full map details → Verify nodes + edges + aliases
- [ ] E2E-ADMIN-02: Clear map → Verify data cleaned

### Dashboard — Ratings
- [ ] E2E-RATING-01: User like response → Verify rating created
- [ ] E2E-RATING-02: User dislike with comment → Verify comment saved
- [ ] E2E-RATING-03: Update existing rating (upsert by run_id)
- [ ] E2E-RATING-04: Admin filter ratings by date range + rating type
- [ ] E2E-RATING-05: Admin search ratings by keyword
- [ ] E2E-RATING-06: Admin delete rating → Verify removed
- [ ] E2E-RATING-07: Get agent stats → Verify like_percentage correct
- [ ] E2E-RATING-08: Non-admin access admin endpoint → Verify 403

### Dashboard — Pinned Posts
- [ ] E2E-PINNED-01: Admin create post → Verify in list
- [ ] E2E-PINNED-02: Admin reorder via drag-drop → Verify order saved
- [ ] E2E-PINNED-03: Admin update post → Verify changes
- [ ] E2E-PINNED-04: Admin delete post → Verify removed
- [ ] E2E-PINNED-05: Public list → Verify sorted by manual order
- [ ] E2E-PINNED-06: Admin filter by category → Verify results
- [ ] E2E-PINNED-07: Admin view stats → Verify counts correct

### Dashboard — Topic Pipeline
- [ ] E2E-TOPIC-01: Trigger pipeline job → Verify job created (202)
- [ ] E2E-TOPIC-02: Poll job status → Verify progress updates
- [ ] E2E-TOPIC-03: Job completes → Verify topics in list
- [ ] E2E-TOPIC-04: View topic questions → Verify pagination
- [ ] E2E-TOPIC-05: View topic trends (day/week/month) → Verify data points
- [ ] E2E-TOPIC-06: View topic keywords → Verify scores
- [ ] E2E-TOPIC-07: Pin topic → Verify pinned state updated
- [ ] E2E-TOPIC-08: Mark knowledge updated → Verify state
- [ ] E2E-TOPIC-09: Export CSV → Verify file downloaded
- [ ] E2E-TOPIC-10: Trigger while job running → Verify 409 conflict
- [ ] E2E-TOPIC-11: Invalid time_range → Verify 422 error

### Knowledge — Documents
- [ ] E2E-DOC-01: Upload normal document → Verify queued status
- [ ] E2E-DOC-02: Upload formal document (LightRAG) → Verify queued
- [ ] E2E-DOC-03: Upload with auto_generate_faq → Verify FAQs generated
- [ ] E2E-DOC-04: Document processing → Verify status transitions (pending → processing → completed)
- [ ] E2E-DOC-05: Document fails → Verify status = failed + error message
- [ ] E2E-DOC-06: Admin list with filters → Verify search, year, unit, type, class
- [ ] E2E-DOC-07: Download document file → Verify streaming
- [ ] E2E-DOC-08: Update document metadata → Verify changes
- [ ] E2E-DOC-09: Delete document → Verify delete_pending → deleted
- [ ] E2E-DOC-10: Delete while processing → Verify 409 conflict
- [ ] E2E-DOC-11: Sync formal document from LightRAG → Verify synced
- [ ] E2E-DOC-12: Upload invalid file type → Verify error

### Knowledge — FAQ
- [ ] E2E-FAQ-01: Create manual FAQ with multiple questions → Verify saved
- [ ] E2E-FAQ-02: Create FAQ with empty questions → Verify 422 error
- [ ] E2E-FAQ-03: Update FAQ answer → Verify changes
- [ ] E2E-FAQ-04: Delete FAQ → Verify removed from PostgreSQL + Qdrant
- [ ] E2E-FAQ-05: List manual FAQs → Verify source = "manual"
- [ ] E2E-FAQ-06: Document ingestion auto-generates FAQs → Verify source = "document"
- [ ] E2E-FAQ-07: FAQ question variations → Verify all stored
- [ ] E2E-FAQ-08: FAQ not found → Verify 404 error

### Knowledge — Storage
- [ ] E2E-STORAGE-01: Create storage → Verify 201 response
- [ ] E2E-STORAGE-02: List storages → Verify all returned
- [ ] E2E-STORAGE-03: Update storage config → Verify changes
- [ ] E2E-STORAGE-04: Delete storage → Verify cascade delete documents
- [ ] E2E-STORAGE-05: Storage not found → Verify 404 error

### Agent — Admin Conversation Export
- [ ] E2E-EXPORT-01: Export messages by time range → Verify pagination
- [ ] E2E-EXPORT-02: Export with no messages in range → Verify empty list
- [ ] E2E-EXPORT-03: Integration with topic pipeline → Verify data flow

### Voice (Mobile)
- [ ] E2E-VOICE-01: Speak → STT → API → TTS → Play audio
- [ ] E2E-VOICE-02: View chat history on mobile
- [ ] E2E-VOICE-03: Voice error handling
