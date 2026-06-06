# Sơ đồ Sequence Chi tiết Luồng Tìm Đường (Wayfinding Flow) - BK-TBOT

Tài liệu này mô tả chi tiết luồng xử lý tìm đường của hệ thống **BK-TBOT**, bắt đầu từ điểm kích hoạt tại Agent Map (`agent_map.py`), thông qua công cụ tìm đường `FindRoute` (`tool_map.py`), tới dịch vụ Backend **Wayfinder API** sử dụng giải thuật tìm kiếm A* và thư viện so khớp chuỗi `rapidfuzz`.

---

## 1. Sơ đồ Sequence (Mermaid Diagram)

Sơ đồ dưới đây mô tả tuần tự các bước từ khi sinh viên gửi yêu cầu cho đến khi hệ thống vẽ đường đi và hiển thị chỉ dẫn chi tiết trên giao diện.

```mermaid
sequenceDiagram
    autonumber
    actor User as Sinh viên (User)
    participant Agent as Agent Map (agent_map.py)
    participant Tool as Tool FindRoute (tool_map.py)
    participant API as Wayfinder API (FastAPI)
    participant Algo as NetworkX (A* Solver)
    database DB as Database (wayfinding.db)

    User->>Agent: Gửi câu hỏi (VD: "chỉ đường từ sảnh B4 đến phòng họp A")
    
    rect rgb(240, 248, 255)
        note right of Agent: Bước 1: Kiểm tra an toàn đầu vào
        Agent->>Agent: Gọi LlamaGuard kiểm tra nội dung
        alt Phát hiện nội dung không an toàn (UNSAFE)
            Agent-->>User: Trả về thông điệp chặn cảnh báo an toàn
        end
    end

    Agent->>Tool: Gọi find_route_func(from_location, to_location)

    rect rgb(255, 240, 245)
        note right of Tool: Bước 2: Tìm kiếm ngữ nghĩa & Fuzzy Search
        Tool->>API: GET /api/aliases/search?q={from_location}
        API->>DB: Truy vấn tất cả Node & Alias
        DB-->>API: Danh sách nodes, aliases
        API->>API: Chạy find_best_nodes() (Fuzzy matching bằng rapidfuzz WRatio)
        API-->>Tool: Trả về danh sách ứng viên (start_results) kèm score
        
        Tool->>API: GET /api/aliases/search?q={to_location}
        API->>DB: Truy vấn Node & Alias
        DB-->>API: Danh sách nodes, aliases
        API->>API: So khớp fuzzy matching
        API-->>Tool: Trả về danh sách ứng viên (end_results) kèm score
    end

    rect rgb(245, 245, 220)
        note right of Tool: Bước 3: Phân giải lỗi nhập nhằng (Ambiguity Resolution)
        alt TRƯỜNG HỢP 1: Không tìm thấy địa điểm (start_results hoặc end_results rỗng)
            Tool->>API: POST /api/missing-locations (Tự động báo cáo địa điểm thiếu)
            Tool-->>Agent: Trả về lỗi "start_not_found" / "end_not_found"
            Agent-->>User: Đề xuất người dùng nhập lại hoặc mô tả thêm
        
        else TRƯỜNG HỢP 2: Tìm thấy nhiều kết quả (Ambiguous Nodes)
            note over Tool: Điểm số chênh lệch giữa Top 1 & Top 2 thấp (< 20 và score < 98)
            Tool-->>Agent: Trả về status: "needs_confirmation" kèm các options
            Agent-->>User: Hiển thị các lựa chọn cho người dùng xác nhận (kèm ID)
            User->>Agent: Chọn địa điểm chính xác (gửi kèm ID cụ thể)
            Agent->>Tool: Gọi lại find_route_func(from_node_id, to_node_id)
            note over Tool: Bỏ qua fuzzy search, truy cập trực tiếp bằng ID
        end
    end

    rect rgb(240, 255, 240)
        note right of Tool: Bước 4: Tính toán đường đi tối ưu (A* Pathfinding)
        Tool->>API: GET /api/find?start_node_id={X}&end_node_id={Y}
        API->>API: _get_global_graph() (Lấy hoặc xây dựng đồ thị tổng thể từ DB)
        
        alt Đồ thị chưa cache
            API->>DB: Truy vấn Node & Edge trên toàn bộ các Map
            DB-->>API: Dữ liệu nodes, edges
            API->>API: Xây dựng đồ thị NetworkX, lưu cache JSON
        end

        API->>Algo: Chạy nx.astar_path(G, source, target, heuristic, weight="weight")
        note over Algo: Sử dụng Euclidean distance + Floor Penalty làm heuristic
        
        alt Không tìm thấy đường đi (đồ thị không liên thông)
            Algo-->>API: Quăng lỗi nx.NetworkXNoPath
            API->>DB: POST /api/missing-routes (Ghi nhận đứt gãy đồ thị)
            API-->>Tool: HTTP 404 Not Found
            Tool-->>Agent: Trả về lỗi "route_not_found"
            Agent-->>User: Báo lỗi và thông báo đã gửi phản hồi cho admin
        
        else Tìm thấy đường đi thành công
            Algo-->>API: Trả về danh sách path_node_ids
            API->>API: generate_human_instructions() (Sinh chỉ dẫn rẽ, đi thẳng, thang máy...)
            API->>API: build_full_polyline() (Lắp ghép tọa độ đường đi chi tiết)
            API-->>Tool: Trả về RouteResponse (path_coords, instructions, total_distance)
        end
    end

    rect rgb(253, 245, 230)
        note right of Tool: Bước 5: Xử lý bản đồ đa tầng (Multi-floor rendering)
        Tool->>Tool: Đọc danh sách path_node_ids, kiểm tra maps_in_route
        alt Tuyến đường đi qua nhiều tầng (is_multi_floor = True)
            loop Với mỗi map_id trong tuyến đường
                Tool->>API: GET /api/maps/{map_id} (Lấy thông tin ảnh bản đồ)
                Tool->>API: GET /api/nodes?map_id={map_id} (Lấy các node trên map này)
                Tool->>API: GET /api/edges?map_id={map_id} (Lấy các edge kết nối)
            end
            Tool->>Tool: Tổng hợp route_maps theo từng tầng
        end
    end

    Tool-->>Agent: Trả về JSON kết quả tìm đường (success)
    Agent->>Agent: Định dạng lời thoại hướng dẫn thân thiện kèm thông tin vẽ bản đồ
    Agent-->>User: Phản hồi lời chỉ dẫn kèm bản đồ trực quan vẽ đường đi (đa tầng)
```

---

## 2. Giải thích Chi tiết các Giai đoạn trong Luồng

### Giai đoạn 1: Kích hoạt từ Agent Map
Khi người dùng gửi câu hỏi liên quan đến chỉ đường hoặc vị trí:
1. **LlamaGuard Kiểm duyệt:** Trước tiên, nội dung trò chuyện được gửi qua `LlamaGuard` để kiểm tra các danh mục an toàn thông tin (chặn các prompt độc hại, spam).
2. **Kích hoạt LLM (Agent Map):** Nếu an toàn, `agent_map.py` (sử dụng LangGraph) sẽ xử lý tin nhắn. Hệ thống prompt chỉ dẫn LLM gọi tool `FindRoute` khi nhận diện được ý định (intent) tìm đường của sinh viên.

### Giai đoạn 2: Tìm kiếm ngữ nghĩa & Fuzzy Search
Khi tool `FindRoute` được gọi với tên địa điểm dạng văn bản tự do:
1. Tool gửi request `GET /api/aliases/search?q=...` đến Backend.
2. Tại Backend, hàm `find_best_nodes` trong `search.py` thực hiện:
   * **Chuẩn hóa chuỗi:** Chuyển về chữ thường, loại bỏ dấu tiếng Việt thông qua hàm `normalize_name`.
   * **Chặn từ khóa chung:** Loại bỏ các từ khóa quá chung chung (như "tòa", "phòng", "đây", "đó") để tránh trường hợp tìm kiếm subset bị tính điểm ảo.
   * **Fuzzy matching:** Sử dụng thư viện `rapidfuzz` để so khớp từ khóa với tên gốc của Node cũng như tất cả các tên gọi khác (Alias) của nó.
     * Thuật toán chính: `fuzz.WRatio` để so khớp cụm từ linh hoạt.
     * Cơ chế cộng điểm (Tie-breaker): `fuzz.ratio` để ưu tiên các kết quả có độ dài chuỗi gần với truy vấn của người dùng hơn.
   * **Lọc ngưỡng:** Chỉ giữ lại các ứng viên có điểm số (score) lớn hơn `50`.

### Giai đoạn 3: Phân giải lỗi nhập nhằng (Ambiguity Check) và Hỏi lại
1. **Tự động báo cáo địa điểm thiếu:** Nếu danh sách tìm kiếm điểm đi hoặc điểm đến trống, hệ thống sẽ tự động gọi API `POST /api/missing-locations` để ghi nhận lỗi vị trí vào CSDL. Điều này giúp đội ngũ quản trị nhanh chóng phát hiện các phòng/địa điểm sinh viên hay hỏi nhưng hệ thống chưa cập nhật.
2. **Thuật toán Phân giải Nhập nhằng (`get_best_node`):**
   * Nếu chỉ có 1 kết quả duy nhất $\rightarrow$ Xác định đó là node cần tìm.
   * Nếu có nhiều kết quả:
     * Nếu điểm của kết quả hàng đầu (Top 1) cực kỳ cao ($\ge 98\%$) và chênh lệch so với Top 2 $\ge 5\%$, hoặc chênh lệch điểm số giữa Top 1 và Top 2 $\ge 20\%$, hệ thống tự động chọn Top 1.
     * Ngược lại, hệ thống nhận định đây là trường hợp **nhập nhằng (ambiguity)** (Ví dụ: "phòng họp A" ở tầng 1 và tầng 2 đều đạt điểm tương đương).
3. **Luồng hỏi lại (Clarification Loop):**
   * Hệ thống trả về trạng thái `needs_confirmation` kèm danh sách các gợi ý.
   * Agent hiển thị các phương án này dưới dạng danh sách chọn lựa kèm theo `[ID: ...]` ẩn.
   * Khi người dùng xác nhận lựa chọn, ở lượt chat tiếp theo Agent sẽ gọi lại `FindRoute` với tham số `from_node_id` hoặc `to_node_id` cụ thể, bỏ qua bước tìm kiếm fuzzy search để đi thẳng đến bước tính đường đi.

### Giai đoạn 4: Tính toán đường đi tối ưu (A* Pathfinding)
Khi đã xác định được ID của hai node xuất phát ($X$) và đích đến ($Y$):
1. **Xây dựng Đồ thị (Global Graph):** Backend lấy đồ thị giao thông đa tầng từ in-memory cache hoặc đọc từ file cache JSON (`data/graph_cache.json`). Nếu chưa có, Backend sẽ đọc toàn bộ bảng `Node` và `Edge` từ database và dựng đồ thị bằng thư viện `networkx`.
2. **Thuật toán A\* với Custom Heuristic:**
   * Backend chạy thuật toán `nx.astar_path` tìm đường đi ngắn nhất.
   * Hàm heuristic (`create_astar_heuristic`) tính khoảng cách Euclid giữa tọa độ $(x, y)$ của hai node, đồng thời áp dụng một khoản phạt chuyển tầng (Floor Penalty, mặc định là `20.0` đơn vị khoảng cách cho mỗi tầng chênh lệch). Điều này đảm bảo thuật toán A* sẽ ưu tiên đi cùng tầng trước khi chọn phương án leo thang bộ hoặc thang máy trừ khi thực sự cần thiết.
3. **Sinh chỉ dẫn ngôn ngữ tự nhiên (`generate_human_instructions`):**
   * Duyệt qua chuỗi node kết quả để tính toán góc rẽ bằng hàm lượng giác (`calculate_angle` dựa trên 3 node liên tiếp).
   * Dựa vào góc để sinh ra các hành động cụ thể: Rẽ trái/phải (`turn_left`/`turn_right`), đi chếch trái/phải (`slight_left`/`slight_right`), đi thẳng (`straight`).
   * Tự động phát hiện các cạnh chuyển tầng (thang máy `use_elevator`, thang bộ `use_stairs`) và lối ra vào tòa nhà (`exit`/`entrance`) để phát sinh chỉ dẫn tương ứng (Ví dụ: *"Đi 10m đến Cầu thang bộ. Đi cầu thang lên Tầng 2"*).
4. **Xử lý Đứt gãy đồ thị:** Nếu hai node không có đường nối thông với nhau (đồ thị không liên thông), Backend trả về lỗi 404 và tự động gọi `POST /api/missing-routes` để ghi nhận lỗi đứt gãy kết nối đồ thị vào CSDL để quản trị viên sửa bản đồ.

### Giai đoạn 5: Xử lý Đa tầng (Multi-floor rendering)
Để frontend có thể vẽ bản đồ riêng cho từng tầng khi người dùng đi xuyên tầng:
1. `FindRoute` kiểm tra xem các node trên đường đi có thuộc nhiều `map_id` khác nhau không.
2. Nếu có (`is_multi_floor = True`), tool sẽ gom nhóm các node và edge nằm trên cùng một bản đồ (`map_id`) và gọi API lấy chi tiết cấu trúc đồ thị cục bộ của tầng đó gửi kèm trong payload trả về. Điều này cho phép frontend vẽ các đoạn đường nét đứt, nét liền hoặc chuyển đổi tab bản đồ tầng 1, tầng 2 một cách mượt mà cho sinh viên.
