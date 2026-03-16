import math
from typing import List, Optional, Tuple, Dict
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
import networkx as nx

from backend.core.db import engine
from backend.models.entities import Map, Node, Edge, Alias

from backend.services.nlp import normalize_name, extract_a_b
from rapidfuzz import process, fuzz
import math

router = APIRouter()


# --- DEPENDENCY ---
def get_session():
    with Session(engine) as session:
        yield session


# --- MODELS ---
class Instruction(BaseModel):
    step: int
    text: str  # Câu hướng dẫn: "Rẽ trái tại Phòng Họp"
    action: str  # "straight", "left", "right", "elevator", "stairs", "arrive"
    distance_m: float  # Khoảng cách của bước này (mét)
    coordinate: List[float]  # Tọa độ điểm xảy ra hành động [x, y]


class RouteResponse(BaseModel):
    map_id: int
    path_coords: List[List[float]]  # Polyline tổng để vẽ lên bản đồ
    total_distance_m: float
    instructions: List[Instruction]


# --- MATH & GEO HELPERS ---


def calculate_angle(
    p1: Tuple[float, float], p2: Tuple[float, float], p3: Tuple[float, float]
) -> float:
    """
    Tính góc tạo bởi 3 điểm p1 -> p2 -> p3.
    Trả về độ (degrees). Dương là rẽ phải, Âm là rẽ trái (trong hệ tọa độ màn hình y hướng xuống).
    """
    # Vector v1 (p1 -> p2)
    v1x, v1y = p2[0] - p1[0], p2[1] - p1[1]
    # Vector v2 (p2 -> p3)
    v2x, v2y = p3[0] - p2[0], p3[1] - p2[1]

    # Góc định hướng dùng atan2
    angle1 = math.atan2(v1y, v1x)
    angle2 = math.atan2(v2y, v2x)

    angle_diff = math.degrees(angle2 - angle1)

    # Chuẩn hóa về [-180, 180]
    while angle_diff <= -180:
        angle_diff += 360
    while angle_diff > 180:
        angle_diff -= 360

    return angle_diff


def get_turn_action(angle: float) -> str:
    """Xác định hành động dựa trên góc rẽ"""
    if angle > 45:
        return "right"  # Rẽ phải
    if angle < -45:
        return "left"  # Rẽ trái
    if angle > 15:
        return "slight_right"  # Chếch phải
    if angle < -15:
        return "slight_left"  # Chếch trái
    return "straight"


# --- DATABASE HELPERS ---


def get_node_name(session: Session, node_id: int) -> Optional[str]:
    """Tìm tên Alias của node (lấy cái đầu tiên), fallback về node name"""
    alias = session.exec(select(Alias).where(Alias.node_id == node_id)).first()
    if alias:
        return alias.name
    # Fallback to node's own name
    node = session.get(Node, node_id)
    return node.name if node else None


def build_graph(session: Session, map_id: int) -> Tuple[nx.Graph, Dict]:
    """Tạo đồ thị NetworkX từ DB, bao gồm cả nodes liên kết qua các tầng"""
    G = nx.Graph()
    node_pos = {}
    node_map_info = {}  # Store map_id and floor info for each node

    # 1. Load all maps that are related (same building or campus)
    # First get the base map to find related maps
    base_map = session.get(Map, map_id)
    if not base_map:
        raise HTTPException(status_code=404, detail="Map not found")

    # Get all maps in the same building, or all maps if this is a campus map
    if base_map.building_id:
        related_maps = session.exec(
            select(Map).where(Map.building_id == base_map.building_id)
        ).all()
    else:
        # Campus map - get all maps
        related_maps = session.exec(select(Map)).all()

    related_map_ids = [m.id for m in related_maps]

    # 2. Load all nodes from related maps
    nodes = session.exec(select(Node).where(Node.map_id.in_(related_map_ids))).all()

    if not nodes:
        raise HTTPException(status_code=404, detail="No nodes found.")

    # Create map_id -> floor_level lookup
    map_floor = {m.id: m.floor_level for m in related_maps}

    for n in nodes:
        G.add_node(n.id)
        node_pos[n.id] = (n.x, n.y)
        G.nodes[n.id]["name"] = get_node_name(session, n.id)
        G.nodes[n.id]["map_id"] = n.map_id
        G.nodes[n.id]["floor"] = map_floor.get(n.map_id)
        G.nodes[n.id]["type"] = n.type
        G.nodes[n.id]["linked_node_ids"] = n.linked_node_ids or []
        node_map_info[n.id] = {"map_id": n.map_id, "floor": map_floor.get(n.map_id)}

    # 3. Load Edges from related maps
    edges = session.exec(
        select(Edge)
        .join(Node, Edge.start_node_id == Node.id)
        .where(Node.map_id.in_(related_map_ids))
    ).all()

    for e in edges:
        attr = {
            "weight": e.weight,
            "type": e.type,
            "polyline": e.polyline if e.polyline else [],
        }
        G.add_edge(e.start_node_id, e.end_node_id, **attr)

    # 4. Add edges for linked nodes (cross-floor connections)
    for n in nodes:
        if n.linked_node_ids:
            for linked_id in n.linked_node_ids:
                if linked_id in G.nodes:
                    # Determine connection type based on node types
                    if n.type in ["stairs", "elevator"] or G.nodes[linked_id].get(
                        "type"
                    ) in ["stairs", "elevator"]:
                        conn_type = (
                            n.type
                            if n.type in ["stairs", "elevator"]
                            else G.nodes[linked_id].get("type", "stairs")
                        )
                    else:
                        conn_type = "stairs"  # Default for floor transitions

                    # Add edge with high weight (stairs/elevator takes longer)
                    G.add_edge(n.id, linked_id, weight=50, type=conn_type, polyline=[])

    return G, node_pos


# --- CORE LOGIC: GENERATE INSTRUCTIONS ---


def get_distance(p1, p2):
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def generate_human_instructions(
    G: nx.Graph, path_nodes: List[int], node_pos: Dict, scale: float
) -> Tuple[List[Instruction], float]:
    instructions = []
    total_dist_px = 0.0

    if len(path_nodes) < 2:
        return [], 0.0

    # Build full path with all intermediate points from polylines
    full_path_points = []  # List of [x, y] coordinates

    for i in range(len(path_nodes) - 1):
        u = path_nodes[i]
        v = path_nodes[i + 1]

        # Add start node (only for first segment)
        if i == 0:
            full_path_points.append(node_pos[u])

        # Get edge data with correct direction
        edge_data = G.get_edge_data(u, v)
        polyline = get_edge_polyline(G, u, v, node_pos)

        # Add intermediate polyline points (skip first/last if same as current end)
        if polyline:
            for idx, p in enumerate(polyline):
                if isinstance(p, list) and len(p) >= 2:
                    # Skip if same as last added point
                    if full_path_points and (
                        abs(full_path_points[-1][0] - p[0]) < 0.1
                        and abs(full_path_points[-1][1] - p[1]) < 0.1
                    ):
                        continue
                    full_path_points.append([p[0], p[1]])

        # Add end node if not duplicate
        if not full_path_points or (
            abs(full_path_points[-1][0] - node_pos[v][0]) >= 0.1
            or abs(full_path_points[-1][1] - node_pos[v][1]) >= 0.1
        ):
            full_path_points.append(node_pos[v])

    # Calculate total distance
    for i in range(len(full_path_points) - 1):
        total_dist_px += get_distance(full_path_points[i], full_path_points[i + 1])

    # Generate instructions based on full path points (detailed)
    instructions.append(
        Instruction(
            step=1,
            text=f"Bắt đầu từ {G.nodes[path_nodes[0]]['name'] or 'điểm xuất phát'}",
            action="start",
            distance_m=0,
            coordinate=full_path_points[0],
        )
    )

    # Generate detailed instructions by iterating over full_path_points
    for i in range(1, len(full_path_points) - 1):
        p1 = full_path_points[i - 1]
        p2 = full_path_points[i]
        p3 = full_path_points[i + 1]

        # Find which edge this point belongs to by checking coordinates
        edge_idx = 0
        point_count = 0
        for ei in range(len(path_nodes) - 1):
            u = path_nodes[ei]
            v = path_nodes[ei + 1]
            polyline = get_edge_polyline(G, u, v, node_pos)

            # Count: start node + polyline points + end node
            count = 1 + len(polyline) + 1
            if point_count + count > i:
                edge_idx = ei
                break
            point_count += count - 1  # overlap at nodes

        # Check for floor transition at the NEXT edge (when we arrive at a node that transitions to a different floor)
        # This happens when p2 (current point) is a node that has floor transition
        current_node = None
        for ni, node_id in enumerate(path_nodes):
            if (
                abs(node_pos[node_id][0] - p2[0]) < 1
                and abs(node_pos[node_id][1] - p2[1]) < 1
            ):
                current_node = node_id
                break

        # Check if current node is an entrance and transitions to/from campus
        is_exit = False
        is_entrance = False
        if current_node:
            current_floor = G.nodes[current_node].get("floor")
            current_type = G.nodes[current_node].get("type")

            # Look for next edge from this node
            if edge_idx < len(path_nodes) - 1:
                next_v = path_nodes[edge_idx + 1]
                next_floor = G.nodes[next_v].get("floor")
                next_type = G.nodes[next_v].get("type")

                # Exit: current is building floor, next is campus (None)
                if (
                    current_floor is not None
                    and next_floor is None
                    and current_type == "entrance"
                ):
                    is_exit = True
                # Entrance: current is campus (None), next is building floor
                elif (
                    current_floor is None
                    and next_floor is not None
                    and next_type == "entrance"
                ):
                    is_entrance = True

        # Check for floor change within building (not campus)
        u = path_nodes[edge_idx]
        v = path_nodes[edge_idx + 1]
        current_floor = G.nodes[u].get("floor")
        next_floor = G.nodes[v].get("floor")

        is_floor_change = current_floor and next_floor and current_floor != next_floor

        if is_floor_change:
            direction = "lên" if next_floor and next_floor > current_floor else "xuống"
            floor_text = f"Tầng {next_floor}" if next_floor else "tầng mới"
            edge_data = G.get_edge_data(u, v)
            edge_type = edge_data.get("type", "walk") if edge_data else "walk"

            if edge_type == "elevator":
                text = f"Đi thang máy {direction} {floor_text}"
                step_action = "use_elevator"
            else:
                text = f"Đi cầu thang {direction} {floor_text}"
                step_action = "use_stairs"

            dist_px = get_distance(p1, p2)
            dist_m = round(dist_px * scale, 1)
        elif is_exit:
            node_name = (
                G.nodes[current_node].get("name", "cửa ra")
                if current_node
                else "cửa ra"
            )
            text = f"Ra {node_name}"
            step_action = "exit"
            dist_px = get_distance(p1, p2)
            dist_m = round(dist_px * scale, 1)
        elif is_entrance:
            node_name = (
                G.nodes[current_node].get("name", "cửa vào")
                if current_node
                else "cửa vào"
            )
            # Find next floor
            next_v = path_nodes[edge_idx + 1]
            target = G.nodes[next_v].get("floor")
            if target:
                text = f"Vào {node_name}, Tầng {target}"
            else:
                text = f"Vào {node_name}"
            step_action = "entrance"
            dist_px = get_distance(p1, p2)
            dist_m = round(dist_px * scale, 1)
        else:
            # Normal turn detection
            angle = calculate_angle(p1, p2, p3)
            turn_action = get_turn_action(angle)

            dist_px = get_distance(p1, p2)
            dist_m = round(dist_px * scale, 1)

            if turn_action == "left":
                text = f"Đi bộ {dist_m}m. Rẽ trái"
                step_action = "turn_left"
            elif turn_action == "right":
                text = f"Đi bộ {dist_m}m. Rẽ phải"
                step_action = "turn_right"
            elif turn_action == "slight_left":
                text = f"Đi bộ {dist_m}m. Đi chếch trái"
                step_action = "slight_left"
            elif turn_action == "slight_right":
                text = f"Đi bộ {dist_m}m. Đi chếch phải"
                step_action = "slight_right"
            else:
                text = f"Đi bộ {dist_m}m"
                step_action = "straight"

        instructions.append(
            Instruction(
                step=len(instructions) + 1,
                text=text,
                action=step_action,
                distance_m=dist_m,
                coordinate=p2,
            )
        )

    # Handle special case: direct floor change (only 2 nodes in path)
    if len(full_path_points) == 2 and len(path_nodes) == 2:
        u = path_nodes[0]
        v = path_nodes[1]
        current_floor = G.nodes[u].get("floor")
        next_floor = G.nodes[v].get("floor")

        if current_floor and next_floor and current_floor != next_floor:
            edge_data = G.get_edge_data(u, v)
            edge_type = edge_data.get("type", "walk") if edge_data else "walk"
            direction = "lên" if next_floor > current_floor else "xuống"
            floor_text = f"Tầng {next_floor}"

            if edge_type == "elevator":
                text = f"Đi thang máy {direction} {floor_text}"
                step_action = "use_elevator"
            else:
                text = f"Đi cầu thang {direction} {floor_text}"
                step_action = "use_stairs"

            # Replace the arrive instruction with floor change
            instructions[-1] = Instruction(
                step=len(instructions),
                text=text,
                action=step_action,
                distance_m=round(total_dist_px * scale, 1),
                coordinate=full_path_points[-1],
            )

            # Prepend start instruction
            start_instr = Instruction(
                step=1,
                text=f"Bắt đầu từ {G.nodes[path_nodes[0]]['name'] or 'điểm xuất phát'}",
                action="start",
                distance_m=0,
                coordinate=full_path_points[0],
            )
            # Re-number all instructions
            new_instructions = [start_instr]
            for idx, instr in enumerate(instructions):
                new_instructions.append(
                    Instruction(
                        step=idx + 2,
                        text=instr.text,
                        action=instr.action,
                        distance_m=instr.distance_m,
                        coordinate=instr.coordinate,
                    )
                )
            instructions = new_instructions

    # Final instruction
    end_node = path_nodes[-1]
    end_name = G.nodes[end_node].get("name", "điểm đến")
    instructions.append(
        Instruction(
            step=len(instructions) + 1,
            text=f"Đã đến {end_name}",
            action="arrive",
            distance_m=0,
            coordinate=full_path_points[-1],
        )
    )

    return instructions, total_dist_px


def find_best_alias_node(
    session: Session,
    map_id: int,
    query: str,
    cx: Optional[float] = None,
    cy: Optional[float] = None,
) -> Optional[int]:
    """
    Tìm node_id dựa trên text search.
    Sử dụng RapidFuzz để so khớp gần đúng.
    """
    norm_q = normalize_name(query)

    # Lấy tất cả Alias của map này
    aliases = session.exec(
        select(Alias, Node)
        .join(Node, Alias.node_id == Node.id)
        .where(Node.map_id == map_id)
    ).all()

    if not aliases:
        return None

    # Tạo dict để fuzzy search: {id: norm_name}
    choices = {a.id: normalize_name(a.name) for (a, _n) in aliases}

    # Tìm top 5 kết quả giống nhất
    # process.extract trả về list [(name, score, key), ...]
    best_matches = process.extract(
        norm_q, choices, scorer=fuzz.token_set_ratio, limit=5
    )

    candidates = []
    # aliases_by_id = {a.id: (a, n) for a, n in aliases} # Map nhanh

    # Lọc những kết quả có độ khớp > 50 (để tránh lấy bừa)
    valid_keys = [res[2] for res in best_matches if res[1] > 50]

    if not valid_keys:
        return None

    # Lấy thông tin Node của các candidate
    for a, n in aliases:
        if a.id in valid_keys:
            candidates.append(n)

    if not candidates:
        return None

    # Nếu có tọa độ người dùng (cx, cy), ưu tiên Node gần nhất trong số các kết quả trùng tên
    # Ví dụ: Có 2 cái "Nhà vệ sinh", chọn cái gần người dùng nhất.
    if cx is not None and cy is not None:
        candidates.sort(key=lambda n: math.hypot(n.x - cx, n.y - cy))
        return candidates[0].id

    # Nếu không có tọa độ, trả về kết quả khớp nhất (thường là cái đầu tiên fuzzy trả về)
    # Ở đây ta lấy cái đầu tiên trong list candidates (đã được lọc)
    return candidates[0].id


# --- API ENDPOINT ---


@router.get("/find", response_model=RouteResponse)
def find_route(
    map_id: int,
    start_node_id: int,
    end_node_id: int,
    session: Session = Depends(get_session),
):
    # 1. Lấy thông tin Map để có scale
    m = session.get(Map, map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại")
    scale = m.scale_ratio if m.scale_ratio else 1.0  # mét / pixel

    # 2. Build Graph & Tìm đường ngắn nhất (Dijkstra)
    G, node_pos = build_graph(session, map_id)

    if start_node_id not in G or end_node_id not in G:
        raise HTTPException(
            status_code=400, detail="Start/End node không thuộc map này"
        )

    try:
        path_nodes = nx.shortest_path(
            G, source=start_node_id, target=end_node_id, weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="Không tìm thấy đường đi")

    # 3. Tạo hướng dẫn chi tiết
    instrs, total_px = generate_human_instructions(G, path_nodes, node_pos, scale)

    return RouteResponse(
        map_id=map_id,
        path_coords=build_full_polyline(G, path_nodes, node_pos),
        total_distance_m=round(total_px * scale, 2),
        instructions=instrs,
    )


def get_edge_polyline(G, u: int, v: int, node_pos: Dict) -> List:
    """Lấy polyline đúng hướng từ u -> v, tự động đảo ngược nếu cần"""
    edge_data = G.get_edge_data(u, v)
    if not edge_data:
        return []

    polyline = edge_data.get("polyline", [])
    if not polyline:
        return []

    u_pos = node_pos.get(u)
    v_pos = node_pos.get(v)

    if not u_pos or not v_pos:
        return polyline

    first_point = polyline[0]
    last_point = polyline[-1]

    dist_first_to_u = get_distance(first_point, u_pos)
    dist_first_to_v = get_distance(first_point, v_pos)

    if dist_first_to_v < dist_first_to_u:
        return list(reversed(polyline))

    return polyline


def build_full_polyline(G, path_nodes: List[int], node_pos: Dict) -> List[List[float]]:
    """Tạo polyline tổng từ path_nodes, tự động xử lý hướng đúng"""
    full_polyline = []
    for i, node_id in enumerate(path_nodes):
        # Add node if not duplicate
        if not full_polyline or (
            abs(full_polyline[-1][0] - node_pos[node_id][0]) >= 0.1
            or abs(full_polyline[-1][1] - node_pos[node_id][1]) >= 0.1
        ):
            full_polyline.append([node_pos[node_id][0], node_pos[node_id][1]])

        if i < len(path_nodes) - 1:
            next_node_id = path_nodes[i + 1]
            polyline = get_edge_polyline(G, node_id, next_node_id, node_pos)
            for p in polyline:
                if isinstance(p, list) and len(p) >= 2:
                    # Skip if duplicate with last point
                    if full_polyline and (
                        abs(full_polyline[-1][0] - p[0]) < 0.1
                        and abs(full_polyline[-1][1] - p[1]) < 0.1
                    ):
                        continue
                    full_polyline.append([p[0], p[1]])

    return full_polyline


@router.get("/query", response_model=RouteResponse)
def route_by_query(
    map_id: int,
    q: str = Query(..., description="Ví dụ: 'từ Sảnh A đến Thang máy'"),
    cx: Optional[float] = None,
    cy: Optional[float] = None,
    session: Session = Depends(get_session),
):
    # 1. Parse câu query
    start_txt, end_txt = extract_a_b(q)

    start_id = None
    end_id = None

    # 2. Tìm Start Node ID
    if start_txt:
        # Nếu người dùng nói "Từ A..."
        start_id = find_best_alias_node(session, map_id, start_txt, cx, cy)
    elif cx is not None and cy is not None:
        # Nếu người dùng không nói "Từ đâu", lấy vị trí hiện tại (cx, cy)
        # Tìm node gần nhất với cx, cy
        all_nodes = session.exec(select(Node).where(Node.map_id == map_id)).all()
        if all_nodes:
            # Sort theo khoảng cách
            all_nodes.sort(key=lambda n: math.hypot(n.x - cx, n.y - cy))
            start_id = all_nodes[0].id

    # 3. Tìm End Node ID
    if end_txt:
        end_id = find_best_alias_node(session, map_id, end_txt, cx, cy)

    # Error handling chi tiết
    errors = []
    if not start_id:
        source_desc = start_txt if start_txt else "vị trí của bạn"
        errors.append(f"Không tìm thấy điểm đi '{source_desc}'")
    if not end_id:
        dest_desc = end_txt if end_txt else "điểm đến"
        errors.append(f"Không tìm thấy điểm đến '{dest_desc}'")

    if errors:
        raise HTTPException(status_code=404, detail=". ".join(errors))

    # 4. Tính toán đường đi (Sử dụng lại logic của hàm find_route cũ nhưng gọi nội bộ)
    # Copy logic từ find_route hoặc tách logic find_route ra hàm riêng để tái sử dụng
    # Ở đây mình viết lại đoạn gọi logic cho gọn:

    m = session.get(Map, map_id)
    scale = m.scale_ratio if m and m.scale_ratio else 1.0

    G, node_pos = build_graph(session, map_id)

    try:
        path_nodes = nx.shortest_path(
            G, source=start_id, target=end_id, weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(
            status_code=404, detail="Không có đường đi giữa hai điểm này."
        )
    except nx.NodeNotFound:
        raise HTTPException(status_code=400, detail="Lỗi dữ liệu đồ thị.")

    # Tạo hướng dẫn
    instrs, total_px = generate_human_instructions(G, path_nodes, node_pos, scale)

    return RouteResponse(
        map_id=map_id,
        path_coords=build_full_polyline(G, path_nodes, node_pos),
        total_distance_m=round(total_px * scale, 2),
        instructions=instrs,
    )
