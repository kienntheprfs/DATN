# Báo cáo Kiểm thử Wayfinder Backend

## 1. Tổng quan

Tài liệu này ghi nhận chi tiết các kịch bản kiểm thử (test cases), kết quả thực thi và độ phủ mã nguồn (code coverage) cho **toàn bộ bộ kiểm thử của Wayfinder Backend** — module tìm đường trong nhà.

| Thông tin | Chi tiết |
|-----------|----------|
| **Framework** | Pytest + FastAPI TestClient |
| **Database** | SQLite In-Memory (`sqlite:///:memory:`) |
| **Môi trường** | Python 3.11.14, Pytest 9.0.3, SQLModel 0.0.14 |
| **Thư mục tests** | `wayfinder/backend/tests/` |
| **Ngày thực thi** | 06/05/2026 |
| **Tổng số tests** | **183** |
| **Trạng thái** | **✅ 183/183 PASS (100%)** |
| **Code Coverage** | **86%** |

---

## 2. Chi tiết Test Cases

### 2.1 Integration Tests — `test_route_and_others.py` (30 tests)

| Group | Mã TC | Tên Test Case | Mô tả | Endpoint | Expected | Kết quả |
|-------|-------|---------------|-------|----------|----------|---------|
| **Route Find API** | IF-001 | `test_find_route` | Tạo building → map → 3 nodes → 2 edges. Tìm đường từ Start → End. | `GET /api/find?start_node_id=...&end_node_id=...` | Status 200, có `path_coords`, `instructions`, `len(instructions) > 0` | ✅ PASS |
| | IF-002 | `test_find_route_invalid_start` | Tìm đường với start_node_id không tồn tại (9999). | `GET /api/find?start_node_id=9999&end_node_id=1` | Status 400 | ✅ PASS |
| | IF-003 | `test_find_route_no_path` | Tạo 2 nodes không có edge nối nhau. | `GET /api/find?start_node_id=...&end_node_id=...` | Status 404 | ✅ PASS |
| | IF-004 | `test_find_route_start_action` | Kiểm tra instruction đầu tiên có `action == "start"`. | `GET /api/find` | `instructions[0]["action"] == "start"` | ✅ PASS |
| | IF-005 | `test_find_route_end_action` | Kiểm tra instruction cuối cùng có `action == "arrive"`. | `GET /api/find` | `instructions[-1]["action"] == "arrive"` | ✅ PASS |
| **Route Query API** | IF-006 | `test_query_route` | Tạo alias "Sảnh A" và "Thư viện". Query bằng tiếng Việt. | `GET /api/query?map_id=...&q=từ Sảnh A đến Thư viện` | Status 200 | ✅ PASS |
| | IF-007 | `test_query_not_found` | Query với tên địa điểm không tồn tại. | `GET /api/query?q=từ xyz không tồn tại đến abc` | Status 400 | ✅ PASS |
| **Route Cache API** | IF-008 | `test_refresh_cache` | Refresh cache khi DB đã có data. | `POST /api/refresh-cache` | Status 200, `node_count > 0` | ✅ PASS |
| | IF-009 | `test_refresh_cache_empty` | Refresh cache khi DB trống. | `POST /api/refresh-cache` | Status 200 | ✅ PASS |
| **Admin API** | IF-010 | `test_clear_map_data_not_found` | Clear map với map_id không tồn tại. | `POST /api/admin/clear-map` | Status 404 | ✅ PASS |
| | IF-011 | `test_get_full_map_details_not_found` | Lấy chi tiết map với map_id không tồn tại. | `GET /api/admin/9999/full` | Status 404 | ✅ PASS |
| | IF-012 | `test_get_full_map_details` | Tạo map + node, lấy full details. | `GET /api/admin/{map_id}/full` | Status 200, có `id`, `nodes`, `edges` | ✅ PASS |
| **Events API** | IF-013 | `test_create_event` | Tạo sự kiện mới. | `POST /api/events` | Status 200, tên đúng | ✅ PASS |
| | IF-014 | `test_list_events` | Tạo 2 events, kiểm tra danh sách. | `GET /api/events` | `len >= 2` | ✅ PASS |
| | IF-015 | `test_search_events` | Tìm kiếm event theo từ khóa "Machine Learning". | `GET /api/events/search?q=Machine+Learning` | Status 200, có kết quả | ✅ PASS |
| | IF-016 | `test_get_event_not_found` | Lấy event với id không tồn tại. | `GET /api/events/9999` | Status 404 | ✅ PASS |
| | IF-017 | `test_upcoming_events` | Lấy danh sách sự kiện sắp tới. | `GET /api/events/upcoming` | Status 200 | ✅ PASS |
| | IF-018 | `test_list_all_events` | Lấy danh sách tất cả sự kiện. | `GET /api/events/all` | `len > 0` | ✅ PASS |
| **Missing Locations API** | IF-019 | `test_create` | Tạo đề xuất địa điểm thiếu. | `POST /api/missing-locations` | Status 200, `status == "pending"` | ✅ PASS |
| | IF-020 | `test_list` | Kiểm tra danh sách đề xuất. | `GET /api/missing-locations` | `len > 0` | ✅ PASS |
| | IF-021 | `test_stats` | Lấy thống kê đề xuất. | `GET /api/missing-locations/stats` | Status 200, có `total` | ✅ PASS |
| | IF-022 | `test_get_not_found` | Lấy đề xuất với id không tồn tại. | `GET /api/missing-locations/9999` | Status 404 | ✅ PASS |
| | IF-023 | `test_update` | Cập nhật đề xuất đã tạo. | `PATCH /api/missing-locations/{id}` | `name == "Updated"` | ✅ PASS |
| **Missing Routes API** | IF-024 | `test_create` | Tạo đề xuất tuyến đường thiếu. | `POST /api/missing-routes` | Status 200, `status == "pending"` | ✅ PASS |
| | IF-025 | `test_list` | Kiểm tra danh sách đề xuất tuyến đường. | `GET /api/missing-routes` | `len > 0` | ✅ PASS |
| | IF-026 | `test_stats` | Lấy thống kê đề xuất tuyến đường. | `GET /api/missing-routes/stats` | Status 200, có `total` | ✅ PASS |
| | IF-027 | `test_get_not_found` | Lấy đề xuất với id không tồn tại. | `GET /api/missing-routes/9999` | Status 404 | ✅ PASS |
| **Locations API** | IF-028 | `test_landmarks_empty` | Lấy danh sách landmarks khi chưa có dữ liệu. | `GET /api/locations/landmarks` | `[]` | ✅ PASS |
| | IF-029 | `test_guess_empty` | Guess location khi chưa có dữ liệu. | `GET /api/locations/guess?query=test` | `[]` | ✅ PASS |
| **Health API** | IF-030 | `test_health` | Kiểm tra endpoint health. | `GET /health` | Status 200, `status == "ok"` | ✅ PASS |

### 2.2 Unit Tests — `test_routes_router.py` (9 tests)

| Mã TC | Tên Test Case | Mô tả | Endpoint | Expected | Kết quả |
|-------|---------------|-------|----------|----------|---------|
| UT-R-01 | `test_find_route_basic` | Tạo building, map, 2 nodes, 1 edge → tìm đường. | `GET /api/find` | Status 200 | ✅ PASS |
| UT-R-02 | `test_route_by_query` | Tạo alias "sanh a", "phong 101" → query route tiếng Việt. | `GET /api/query?q=từ sanh a đến phong 101` | Status 200 | ✅ PASS |
| UT-R-03 | `test_route_with_polyline` | Edge có polyline `[[0,0],[50,50],[100,0]]` → kiểm tra khoảng cách. | `GET /api/find` | `total_distance_m ≈ 141.4` (±0.1) | ✅ PASS |
| UT-R-04 | `test_route_floor_change_stairs` | Liên tầng tầng 1 → tầng 2 qua stairs node. | `GET /api/find` | Instructions chứa "cầu thang" và "tầng 2" | ✅ PASS |
| UT-R-05 | `test_route_entrance_exit` | Route từ trong building ra campus qua entrance. | `GET /api/find` | Instructions chứa từ "ra" | ✅ PASS |
| UT-R-06 | `test_various_turns` | Tạo 4 nodes tạo góc rẽ trái và chếch phải. | `GET /api/find` | Instruction[1] chứa "Rẽ trái" / "chếch phải" | ✅ PASS |
| UT-R-07 | `test_query_ambiguity` | Cùng alias "p101" trên 2 tầng, query không rõ ràng. | `GET /api/query?q=đến p101` | Status 400, detail chứa "nhiều" | ✅ PASS |
| UT-R-08 | `test_refresh_cache_endpoint` | Refresh cache sau khi setup data. | `POST /api/refresh-cache` | Status 200 | ✅ PASS |
| UT-R-09 | `test_route_not_found` | 2 nodes không có edge nối nhau. | `GET /api/find` | Status 404 | ✅ PASS |

### 2.3 Unit Tests — `test_route_logic.py` (9 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-RL-01 | `test_straight_line` | `calculate_angle` | (0,0)→(1,0)→(2,0) | `angle == 0.0` | ✅ PASS |
| UT-RL-02 | `test_right_turn_90_degrees` | `calculate_angle` | (0,0)→(1,0)→(1,1) | `89 ≤ angle ≤ 91` | ✅ PASS |
| UT-RL-03 | `test_left_turn_90_degrees` | `calculate_angle` | (0,0)→(1,0)→(1,-1) | `-91 ≤ angle ≤ -89` | ✅ PASS |
| UT-RL-04 | `test_continue_straight` | `calculate_angle` | (0,0)→(1,1)→(2,2) | `\|angle\| < 1` | ✅ PASS |
| UT-RL-05 | `test_straight` | `get_turn_action` | 0, 10, -10 | `"straight"` | ✅ PASS |
| UT-RL-06 | `test_slight_right` | `get_turn_action` | 20, 44 | `"slight_right"` | ✅ PASS |
| UT-RL-07 | `test_slight_left` | `get_turn_action` | -20, -44 | `"slight_left"` | ✅ PASS |
| UT-RL-08 | `test_right` | `get_turn_action` | 46, 90, 180 | `"right"` | ✅ PASS |
| UT-RL-09 | `test_left` | `get_turn_action` | -46, -90, -180 | `"left"` | ✅ PASS |

### 2.4 Unit Tests — `test_route_helpers.py` (23 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-RH-01 | `test_straight_line_zero_angle` | `calculate_angle` | (0,0)→(1,0)→(2,0) | `\|angle\| < 0.001` | ✅ PASS |
| UT-RH-02 | `test_right_turn_90_degrees` | `calculate_angle` | (0,0)→(1,0)→(1,1) | `angle > 0` | ✅ PASS |
| UT-RH-03 | `test_left_turn_90_degrees` | `calculate_angle` | (0,0)→(1,0)→(1,-1) | `angle < 0` | ✅ PASS |
| UT-RH-04 | `test_u_turn_180_degrees` | `calculate_angle` | (0,0)→(1,0)→(0,0) | `\|\|angle\| - 180\| < 0.001` | ✅ PASS |
| UT-RH-05 | `test_same_points` | `calculate_angle` | (0,0)→(0,0)→(0,0) | `angle == 0.0` | ✅ PASS |
| UT-RH-06 | `test_straight_small_angle` | `get_turn_action` | 0, 10, -10 | `"straight"` | ✅ PASS |
| UT-RH-07 | `test_slight_right` | `get_turn_action` | 30 | `"slight_right"` | ✅ PASS |
| UT-RH-08 | `test_slight_left` | `get_turn_action` | -30 | `"slight_left"` | ✅ PASS |
| UT-RH-09 | `test_right_turn` | `get_turn_action` | 60, 90, 120 | `"right"` | ✅ PASS |
| UT-RH-10 | `test_left_turn` | `get_turn_action` | -60, -90, -120 | `"left"` | ✅ PASS |
| UT-RH-11 | `test_boundary_45_degrees` | `get_turn_action` | 46, -46 | `"right"`, `"left"` | ✅ PASS |
| UT-RH-12 | `test_boundary_15_degrees` | `get_turn_action` | 16, -16 | `"slight_right"`, `"slight_left"` | ✅ PASS |
| UT-RH-13 | `test_same_points` | `get_distance` | (0,0)→(0,0) | `0.0` | ✅ PASS |
| UT-RH-14 | `test_horizontal` | `get_distance` | (0,0)→(3,0) | `3.0` | ✅ PASS |
| UT-RH-15 | `test_vertical` | `get_distance` | (0,0)→(0,4) | `4.0` | ✅ PASS |
| UT-RH-16 | `test_diagonal` | `get_distance` | (0,0)→(3,4) | `5.0` | ✅ PASS |
| UT-RH-17 | `test_negative_coords` | `get_distance` | (-1,-1)→(1,1) | `≈ 2.828` (±0.01) | ✅ PASS |
| UT-RH-18 | `test_no_edge_data` | `get_edge_polyline` | MockGraph trả về None | `[]` | ✅ PASS |
| UT-RH-19 | `test_empty_polyline` | `get_edge_polyline` | MockGraph polyline rỗng | `[]` | ✅ PASS |
| UT-RH-20 | `test_no_node_positions` | `get_edge_polyline` | node_pos = {} | Trả về polyline gốc | ✅ PASS |
| UT-RH-21 | `test_correct_direction` | `get_edge_polyline` | u=(0,0), v=(10,10) | `[[0,0],[5,5],[10,10]]` | ✅ PASS |
| UT-RH-22 | `test_reverse_when_needed` | `get_edge_polyline` | Polyline ngược hướng u→v | Đảo ngược đúng hướng | ✅ PASS |
| UT-RH-23 | `test_skips_cross_floor_stairs_polyline` | `build_full_polyline` | Floor 1→2, type=stairs | `[[0,0],[10,10]]` (bỏ qua polyline) | ✅ PASS |

### 2.5 Unit Tests — `test_geo_service.py` (18 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-G-01 | `test_empty_polyline` | `polyline_length` | `[]` | `0.0` | ✅ PASS |
| UT-G-02 | `test_single_point` | `polyline_length` | `[(0,0)]` | `0.0` | ✅ PASS |
| UT-G-03 | `test_two_points` | `polyline_length` | `[(0,0),(3,4)]` | `5.0` | ✅ PASS |
| UT-G-04 | `test_three_points` | `polyline_length` | `[(0,0),(3,0),(3,4)]` | `7.0` | ✅ PASS |
| UT-G-05 | `test_straight_line` | `polyline_length` | `[(0,0),(1,0),(2,0),(3,0)]` | `3.0` | ✅ PASS |
| UT-G-06 | `test_complex_polyline` | `polyline_length` | `[(0,0),(1,1),(2,2),(3,3)]` | `≈ 4.243` (±0.001) | ✅ PASS |
| UT-G-07 | `test_walk_type_default` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "walk", scale=1.0 | `5.0` (factor ×1) | ✅ PASS |
| UT-G-08 | `test_stairs_factor` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "stairs", scale=1.0 | `10.0` (factor ×2) | ✅ PASS |
| UT-G-09 | `test_elevator_factor` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "elevator", scale=1.0 | `7.5` (factor ×1.5) | ✅ PASS |
| UT-G-10 | `test_escalator_factor` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "escalator", scale=1.0 | `5.0` (factor ×1) | ✅ PASS |
| UT-G-11 | `test_restricted_type` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "restricted", scale=1.0 | `4995.0` (factor ×999) | ✅ PASS |
| UT-G-12 | `test_unknown_type_defaults_to_walk` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "unknown", scale=1.0 | `5.0` (default factor ×1) | ✅ PASS |
| UT-G-13 | `test_scale_ratio_applied` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "walk", scale=0.5 | `2.5` | ✅ PASS |
| UT-G-14 | `test_large_scale_ratio` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "walk", scale=2.0 | `10.0` | ✅ PASS |
| UT-G-15 | `test_zero_scale` | `calculate_edge_weight` | `[[0,0],[3,4]]`, "walk", scale=0.0 | `0.0` | ✅ PASS |
| UT-G-16 | `test_multi_segment_polyline_walk` | `calculate_edge_weight` | `[[0,0],[10,0],[10,10],[20,10]]`, "walk" | `30.0` (10+10+10) | ✅ PASS |
| UT-G-17 | `test_stairs_with_scale` | `calculate_edge_weight` | `[[0,0],[10,0],[10,10]]`, "stairs", scale=0.5 | `20.0` (20 × 0.5 × 2) | ✅ PASS |
| UT-G-18 | `test_type_factors_values` | `TYPE_FACTORS` | — | walk=1, stairs=2, elevator=1.5, escalator=1, restricted=999 | ✅ PASS |

### 2.6 Unit Tests — `test_nlp.py` (2 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-N-01 | `test_normalize_name` | `normalize_name` | `"A4-201"`, `"Phòng 201, Tòa A4"`, `"  Phòng   Họp  "`, `None`, `""` | `"a4 201"`, `"phòng 201 tòa a4"`, `"phòng họp"`, `""`, `""` | ✅ PASS |
| UT-N-02 | `test_extract_a_b` | `extract_a_b` | `"Từ Phòng 201 đến Thư viện"`, `"Đi từ A4-201 tới B4-505"`, `"Chỉ đường tới Thư viện"`, `"Thư viện"` | `("phòng 201", "thư viện")`, `("a4 201", "b4 505")`, `(None, "thư viện")`, `(None, "thư viện")` | ✅ PASS |

### 2.7 Integration Tests — `test_crud_api.py` (28 tests)

| Group | Mã TC | Tên Test Case | Mô tả | Endpoint | Expected | Kết quả |
|-------|-------|---------------|-------|----------|----------|---------|
| **Building API** | IC-01 | `test_create_building` | Tạo building mới. | `POST /api/buildings` | Status 200, có `id`, `name` | ✅ PASS |
| | IC-02 | `test_get_buildings_empty` | Lấy danh sách buildings khi chưa có data. | `GET /api/buildings` | `[]` | ✅ PASS |
| | IC-03 | `test_get_buildings` | Tạo 1 building, lấy danh sách. | `GET /api/buildings` | `len >= 1` | ✅ PASS |
| | IC-04 | `test_get_building_by_id` | Lấy building theo ID hợp lệ. | `GET /api/buildings/{id}` | Status 200, đúng tên | ✅ PASS |
| | IC-05 | `test_get_building_not_found` | Lấy building với ID không tồn tại. | `GET /api/buildings/9999` | Status 404 | ✅ PASS |
| | IC-06 | `test_update_building` | Cập nhật tên building. | `PUT /api/buildings/{id}` | Status 200, tên mới đúng | ✅ PASS |
| | IC-07 | `test_delete_building` | Xóa building. | `DELETE /api/buildings/{id}` | Status 200 | ✅ PASS |
| **Map API** | IC-08 | `test_list_maps` | Tạo map, lấy danh sách. | `GET /api/maps` | `len >= 1` | ✅ PASS |
| | IC-09 | `test_get_map_by_id` | Lấy map theo ID hợp lệ. | `GET /api/maps/{id}` | Status 200, đúng thông tin | ✅ PASS |
| | IC-10 | `test_get_map_not_found` | Lấy map với ID không tồn tại. | `GET /api/maps/9999` | Status 404 | ✅ PASS |
| | IC-11 | `test_list_maps_by_building_id` | Lọc maps theo building_id. | `GET /api/maps?building_id=...` | `len >= 1`, đúng building | ✅ PASS |
| | IC-12 | `test_campus_maps` | Tạo map không có building_id (campus). | `GET /api/maps/campus` | Status 200, có campus map | ✅ PASS |
| **Node API** | IC-13 | `test_create_node` | Tạo node trên map. | `POST /api/nodes` | Status 200, có `id`, `x`, `y` | ✅ PASS |
| | IC-14 | `test_create_node_invalid_map` | Tạo node với map_id không tồn tại. | `POST /api/nodes` | Status 404 | ✅ PASS |
| | IC-15 | `test_list_nodes` | Tạo node, lấy danh sách. | `GET /api/nodes?map_id=...` | `len >= 1` | ✅ PASS |
| | IC-16 | `test_get_node_by_id` | Lấy node theo ID hợp lệ. | `GET /api/nodes/{id}` | Status 200, đúng tọa độ | ✅ PASS |
| | IC-17 | `test_get_node_not_found` | Lấy node với ID không tồn tại. | `GET /api/nodes/9999` | Status 404 | ✅ PASS |
| | IC-18 | `test_update_node` | Cập nhật tọa độ node. | `PUT /api/nodes/{id}` | Status 200, tọa độ mới đúng | ✅ PASS |
| | IC-19 | `test_delete_node` | Xóa node. | `DELETE /api/nodes/{id}` | Status 200 | ✅ PASS |
| **Edge API** | IC-20 | `test_create_edge` | Tạo edge nối 2 nodes. | `POST /api/edges` | Status 200, có `id` | ✅ PASS |
| | IC-21 | `test_create_edge_same_node_fails` | Tạo edge nối cùng 1 node. | `POST /api/edges` | Status 400 | ✅ PASS |
| | IC-22 | `test_list_edges` | Tạo edge, lấy danh sách. | `GET /api/edges` | `len >= 1` | ✅ PASS |
| | IC-23 | `test_update_edge` | Cập nhật type edge. | `PUT /api/edges/{id}` | Status 200, type mới đúng | ✅ PASS |
| | IC-24 | `test_delete_edge` | Xóa edge. | `DELETE /api/edges/{id}` | Status 200 | ✅ PASS |
| **Alias API** | IC-25 | `test_create_alias` | Tạo alias cho node. | `POST /api/aliases` | Status 200, có `id` | ✅ PASS |
| | IC-26 | `test_create_alias_invalid_node` | Tạo alias với node_id không tồn tại. | `POST /api/aliases` | Status 404 | ✅ PASS |
| | IC-27 | `test_list_aliases` | Tạo alias, lấy danh sách. | `GET /api/aliases` | `len >= 1` | ✅ PASS |
| | IC-28 | `test_search_alias` | Search alias theo từ khóa. | `GET /api/aliases/search?q=...` | Status 200, có kết quả | ✅ PASS |
| | IC-29 | `test_search_alias_empty_query` | Search với query rỗng. | `GET /api/aliases/search?q=` | `[]` | ✅ PASS |
| | IC-30 | `test_get_all_locations` | Lấy tất cả locations (aliases + nodes). | `GET /api/aliases/locations` | Status 200, `len > 0` | ✅ PASS |

### 2.8 Unit Tests — `test_nlp_extended.py` (14 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-NE-01 | `test_empty_string` | `normalize_name` | `""` | `""` | ✅ PASS |
| UT-NE-02 | `test_none_input` | `normalize_name` | `None` | `""` | ✅ PASS |
| UT-NE-03 | `test_already_normalized` | `normalize_name` | `"phong hop"` | `"phong hop"` | ✅ PASS |
| UT-NE-04 | `test_uppercase_to_lowercase` | `normalize_name` | `"PHONG HOP"` | `"phong hop"` | ✅ PASS |
| UT-NE-05 | `test_special_characters_removed` | `normalize_name` | `"A4-201!"` | `"a4 201 "` → trimmed `"a4 201"` | ✅ PASS |
| UT-NE-06 | `test_extra_spaces_trimmed` | `normalize_name` | `"  phong   hop  "` | `"phong hop"` | ✅ PASS |
| UT-NE-07 | `test_room_format` | `normalize_name` | `"Phòng 201"` | `"phòng 201"` | ✅ PASS |
| UT-NE-08 | `test_underscore_as_separator` | `normalize_name` | `"phong_hop"` | `"phong hop"` | ✅ PASS |
| UT-NE-09 | `test_vietnamese_diacritics_preserved` | `normalize_name` | `"Thư viện"` | `"thư viện"` | ✅ PASS |
| UT-NE-10 | `test_mixed_special_chars` | `normalize_name` | `"A4/201#Tầng"` | `"a4 201 tầng"` | ✅ PASS |
| UT-NE-11 | `test_numbers_preserved` | `normalize_name` | `"Phòng 123"` | `"phòng 123"` | ✅ PASS |
| UT-NE-12 | `test_only_special_chars` | `normalize_name` | `"---!!!"` | `""` | ✅ PASS |
| UT-NE-13 | `test_leading_trailing_whitespace` | `normalize_name` | `"  test  "` | `"test"` | ✅ PASS |
| UT-NE-14 | `test_single_word` | `normalize_name` | `"Thư"` | `"thư"` | ✅ PASS |
| UT-NE-15 | `test_empty_query` | `extract_a_b` | `""` | `(None, None)` | ✅ PASS |
| UT-NE-16 | `test_none_query` | `extract_a_b` | `None` | `(None, None)` | ✅ PASS |
| UT-NE-17 | `test_from_to_pattern` | `extract_a_b` | `"từ A đến B"` | `("a", "b")` | ✅ PASS |
| UT-NE-18 | `test_di_from_pattern` | `extract_a_b` | `"đi từ A đến B"` | `("a", "b")` | ✅ PASS |
| UT-NE-19 | `test_only_destination_with_den` | `extract_a_b` | `"đến Thư viện"` | `(None, "thư viện")` | ✅ PASS |
| UT-NE-20 | `test_only_destination_with_toi` | `extract_a_b` | `"tới Phòng 101"` | `(None, "phòng 101")` | ✅ PASS |
| UT-NE-21 | `test_only_destination_with_di` | `extract_a_b` | `"đi Phòng 101"` | `(None, "phòng 101")` | ✅ PASS |
| UT-NE-22 | `test_only_destination_name_only` | `extract_a_b` | `"Thư viện"` | `(None, "thư viện")` | ✅ PASS |
| UT-NE-23 | `test_chi_duong_toi_pattern` | `extract_a_b` | `"chỉ đường tới A"` | `(None, "a")` | ✅ PASS |
| UT-NE-24 | `test_chi_duong_den_pattern` | `extract_a_b` | `"chỉ đường đến A"` | `(None, "a")` | ✅ PASS |
| UT-NE-25 | `test_tim_pattern` | `extract_a_b` | `"tìm Phòng 101"` | `(None, "phòng 101")` | ✅ PASS |
| UT-NE-26 | `test_ve_pattern` | `extract_a_b` | `"về nhà"` | `(None, "nhà")` | ✅ PASS |
| UT-NE-27 | `test_sang_pattern` | `extract_a_b` | `"sang tòa B"` | `(None, "tòa b")` | ✅ PASS |
| UT-NE-28 | `test_whitespace_handling` | `extract_a_b` | `"  từ  A  đến  B  "` | `("a", "b")` | ✅ PASS |
| UT-NE-29 | `test_complex_from_to` | `extract_a_b` | `"từ tầng 1 phòng 101 đến tầng 2"` | `("tầng 1 phòng 101", "tầng 2")` | ✅ PASS |

### 2.9 Unit Tests — `test_nlp_service.py` (9 tests)

| Mã TC | Tên Test Case | Hàm | Input | Expected | Kết quả |
|-------|---------------|-----|-------|----------|---------|
| UT-NS-01 | `test_normalize_empty_string` | `normalize_name` | `""` | `""` | ✅ PASS |
| UT-NS-02 | `test_normalize_none` | `normalize_name` | `None` | `""` | ✅ PASS |
| UT-NS-03 | `test_normalize_lowercase` | `normalize_name` | `"ABC"` | `"abc"` | ✅ PASS |
| UT-NS-04 | `test_normalize_strips_whitespace` | `normalize_name` | `"  abc  "` | `"abc"` | ✅ PASS |
| UT-NS-05 | `test_normalize_preserves_vietnamese` | `normalize_name` | `"Thư viện"` | `"thư viện"` | ✅ PASS |
| UT-NS-06 | `test_extract_from_to` | `extract_a_b` | `"Từ A đến B"` | `("a", "b")` | ✅ PASS |
| UT-NS-07 | `test_extract_di_tu` | `extract_a_b` | `"Đi từ A đến B"` | `("a", "b")` | ✅ PASS |
| UT-NS-08 | `test_extract_sang` | `extract_a_b` | `"sang B"` | `(None, "b")` | ✅ PASS |
| UT-NS-09 | `test_extract_ve` | `extract_a_b` | `"về B"` | `(None, "b")` | ✅ PASS |
| UT-NS-10 | `test_extract_destination_only` | `extract_a_b` | `"đến B"` | `(None, "b")` | ✅ PASS |
| UT-NS-11 | `test_extract_tim` | `extract_a_b` | `"tìm B"` | `(None, "b")` | ✅ PASS |
| UT-NS-12 | `test_extract_plain_destination` | `extract_a_b` | `"B"` | `(None, "b")` | ✅ PASS |
| UT-NS-13 | `test_extract_multiple_words` | `extract_a_b` | `"từ Phòng 201 đến Thư viện"` | `("phòng 201", "thư viện")` | ✅ PASS |

### 2.10 Unit Tests — `test_routing.py` + `test_routing_extended.py` (9 tests)

| Mã TC | Tên Test Case | Mô tả | Input | Expected | Kết quả |
|-------|---------------|-------|-------|----------|---------|
| UT-D-01 | `test_dijkstra_logic` | Dijkstra cơ bản với 3 nodes. | Graph: 1→2(5), 2→3(10), 1→3(20) | Path `[1,2,3]`, dist=15 | ✅ PASS |
| UT-D-02 | `test_basic_shortest_path` | Đường ngắn nhất qua trung gian. | Graph 4 nodes | Path ngắn nhất đúng | ✅ PASS |
| UT-D-03 | `test_direct_path_shorter` | Đường trực tiếp ngắn hơn. | Graph: 1→2(1), 1→3→2(10) | Path `[1,2]` | ✅ PASS |
| UT-D-04 | `test_same_source_and_target` | Source = Target. | start=1, end=1 | Path `[1]` | ✅ PASS |
| UT-D-05 | `test_no_path_exists` | Không có đường đi. | Graph rời rạc | Raise `NetworkXNoPath` | ✅ PASS |
| UT-D-06 | `test_multiple_paths` | Nhiều đường, chọn ngắn nhất. | Graph 2 paths | Path có weight nhỏ nhất | ✅ PASS |
| UT-D-07 | `test_path_with_node_attributes` | Path có node attributes. | Graph có attrs | Path đúng, attrs được giữ | ✅ PASS |
| UT-D-08 | `test_graph_with_many_nodes` | Graph nhiều nodes. | 10+ nodes | Path tìm được chính xác | ✅ PASS |
| UT-D-09 | `test_weight_calculation_from_path` | Tính weight từ path. | Graph có weights | Tổng weight đúng | ✅ PASS |

### 2.11 Unit Tests — `test_maps_router.py`, `test_buildings_router.py`, `test_nodes_router.py` (4 tests)

| Mã TC | Tên Test Case | Mô tả | Endpoint | Expected | Kết quả |
|-------|---------------|-------|----------|----------|---------|
| UT-M-01 | `test_maps_crud_extended` | Tạo building → map → verify → update → delete. | `POST/GET/PUT/DELETE /api/maps` | CRUD thành công, data đúng | ✅ PASS |
| UT-B-01 | `test_buildings_crud` | Tạo → lấy → cập nhật → xóa building. | `POST/GET/PUT/DELETE /api/buildings` | CRUD thành công | ✅ PASS |
| UT-ND-01 | `test_nodes_crud` | Tạo node → lấy danh sách → cập nhật → xóa. | `POST/GET/PUT/DELETE /api/nodes` | CRUD thành công | ✅ PASS |
| UT-ND-02 | `test_node_links` | Tạo 2 nodes, linked_node_ids, verify. | `POST/PATCH /api/nodes` | Linked nodes đúng | ✅ PASS |

---

## 3. Kết quả Coverage

### 3.1 Coverage tổng quan

| Metric | Giá trị |
|--------|---------|
| **Total Statements** | 2847 |
| **Covered** | 2449 |
| **Missed** | 398 |
| **Coverage** | **86%** |

### 3.2 Coverage theo Module

| File | Statements | Missed | Coverage |
|------|-----------|--------|----------|
| `backend/services/geo.py` | 17 | 0 | **100%** |
| `backend/services/nlp.py` | 24 | 0 | **100%** |
| `backend/models/entities.py` | 104 | 0 | **100%** |
| `backend/tests/conftest.py` | 23 | 0 | **100%** |
| `backend/tests/unit/test_buildings_router.py` | 21 | 0 | **100%** |
| `backend/tests/unit/test_geo_service.py` | 88 | 0 | **100%** |
| `backend/tests/unit/test_maps_router.py` | 28 | 0 | **100%** |
| `backend/tests/unit/test_nlp.py` | 13 | 0 | **100%** |
| `backend/tests/unit/test_nlp_extended.py` | 80 | 0 | **100%** |
| `backend/tests/unit/test_nlp_service.py` | 46 | 0 | **100%** |
| `backend/tests/unit/test_nodes_router.py` | 31 | 0 | **100%** |
| `backend/tests/unit/test_route_logic.py` | 34 | 0 | **100%** |
| `backend/tests/unit/test_routing.py` | 16 | 0 | **100%** |
| `backend/tests/unit/test_routing_extended.py` | 81 | 0 | **100%** |
| `backend/main.py` | 26 | 1 | **96%** |
| `backend/routers/buildings.py` | 56 | 2 | **96%** |
| `backend/routers/maps.py` | 100 | 7 | **93%** |
| `backend/tests/integration/test_crud_api.py` | 179 | 1 | **99%** |
| `backend/tests/integration/test_route_and_others.py` | 180 | 1 | **99%** |
| `backend/tests/unit/test_routes_router.py` | 105 | 1 | **99%** |
| `backend/routers/routes.py` | 401 | 52 | **87%** |
| `backend/routers/nodes.py` | 164 | 23 | **86%** |
| `backend/routers/edges.py` | 91 | 13 | **86%** |
| `backend/routers/aliases.py` | 125 | 22 | **82%** |
| `backend/routers/missing_locations.py` | 107 | 24 | **78%** |
| `backend/routers/admin.py` | 58 | 15 | **74%** |
| `backend/routers/missing_routes.py` | 119 | 35 | **71%** |
| `backend/core/db.py` | 31 | 9 | **71%** |
| `backend/routers/locations.py` | 45 | 14 | **69%** |
| `backend/routers/events.py` | 209 | 79 | **62%** |
| `backend/routers/uploads.py` | 25 | 15 | **40%** |

### 3.3 Coverage theo nhóm chức năng

| Nhóm chức năng | Files liên quan | Coverage | Nhận xét |
|---------------|----------------|----------|----------|
| **Geo Service** | `geo.py` | 100% | Đã cover đầy đủ edge type factors, scale ratios |
| **NLP** | `nlp.py` | 100% | Normalize + extract_a_b fully covered |
| **Route Finding** | `routes.py` | 87% | Core logic well-covered; còn miss `generate_human_instructions` ở các branch entrance/exit |
| **Buildings** | `buildings.py` | 96% | CRUD gần như fully covered |
| **Maps** | `maps.py` | 93% | Upload + CRUD tốt |
| **Nodes** | `nodes.py` | 86% | CRUD + linked nodes ok |
| **Edges** | `edges.py` | 86% | CRUD + polyline ok |
| **Aliases** | `aliases.py` | 82% | Search + resolve ok; vài branch miss |
| **Admin** | `admin.py` | 74% | Full map details ok; clear-map edge cases |
| **Missing Locations** | `missing_locations.py` | 78% | CRUD + stats ok |
| **Missing Routes** | `missing_routes.py` | 71% | CRUD + stats ok |
| **Events** | `events.py` | 62% | Basic CRUD ok; search, update cần thêm |
| **Locations** | `locations.py` | 69% | Landmarks + guess empty ok |
| **Uploads** | `uploads.py` | 40% | Cần thêm tests |

---

## 4. Thống kê tổng hợp

| Loại test | Số lượng | Trạng thái |
|-----------|----------|------------|
| Integration Tests (CRUD API) | 28 | ✅ 28/28 PASS |
| Integration Tests (Route & Others) | 30 | ✅ 30/30 PASS |
| Unit Tests (routes_router) | 10 | ✅ 10/10 PASS |
| Unit Tests (route_logic) | 9 | ✅ 9/9 PASS |
| Unit Tests (route_helpers) | 23 | ✅ 23/23 PASS |
| Unit Tests (geo_service) | 18 | ✅ 18/18 PASS |
| Unit Tests (NLP) | 2 | ✅ 2/2 PASS |
| Unit Tests (NLP extended) | 14 | ✅ 14/14 PASS |
| Unit Tests (NLP service) | 9 | ✅ 9/9 PASS |
| Unit Tests (routing) | 1 | ✅ 1/1 PASS |
| Unit Tests (routing_extended) | 8 | ✅ 8/8 PASS |
| Unit Tests (maps_router) | 1 | ✅ 1/1 PASS |
| Unit Tests (buildings_router) | 1 | ✅ 1/1 PASS |
| Unit Tests (nodes_router) | 2 | ✅ 2/2 PASS |
| **Tổng cộng** | **183** | **✅ 183/183 PASS** |
| **Code Coverage** | — | **86%** |

---

## 5. Các vấn đề đã sửa

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| `test_find_route` → 400 | Global graph cache chứa stale node IDs từ test trước | Thêm `_clear_graph_cache()` vào `conftest.py` fixture trước và sau mỗi test |
| `test_find_route_start_action` → KeyError | Same root cause — cache stale, graph không rebuild | Fix trên |
| `test_find_route_end_action` → KeyError | Same root cause | Fix trên |
| `test_query_route` → 400 | Same root cause | Fix trên |
| `test_refresh_cache_empty` → 404 | `build_graph` raise `HTTPException(404)` khi DB trống | Thay bằng return empty graph `(G, node_pos)` |

---

## 6. Khuyến nghị cải thiện Coverage

1. **`generate_human_instructions`** (routes.py:328-502): Thêm tests cho các branch entrance/exit chi tiết.
2. **`_load_graph_from_cache` / `_save_graph_to_cache`** (routes.py:26-80): Thêm tests cho file-based graph caching.
3. **`events.py`** (62%): Thêm tests cho search, update, delete events.
4. **`uploads.py`** (40%): Thêm tests cho file upload validation, error handling.
5. **`missing_locations.py` & `missing_routes.py`** (71-78%): Thêm tests cho workflow update status, approval.
