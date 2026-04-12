import math
import json
import os
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
import time

router = APIRouter()

# --- GLOBAL GRAPH CACHE ---
_global_graph: Optional[nx.Graph] = None
_global_node_pos: Optional[Dict] = None
_graph_file = "data/graph_cache.json"


def _load_graph_from_cache() -> Tuple[Optional[nx.Graph], Optional[Dict]]:
    """Load graph from JSON file if exists"""
    if not os.path.exists(_graph_file):
        return None, None

    try:
        with open(_graph_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        G = nx.Graph()
        node_pos = {}

        # Load nodes
        for node_id, node_data in data["nodes"].items():
            G.add_node(int(node_id))
            for key, val in node_data.items():
                G.nodes[int(node_id)][key] = val
            node_pos[int(node_id)] = tuple(node_data["pos"])

        # Load edges
        for u, edges in data["edges"].items():
            for v, edge_data in edges.items():
                G.add_edge(int(u), int(v), **edge_data)

        return G, node_pos
    except Exception:
        return None, None


def _save_graph_to_cache(G: nx.Graph, node_pos: Dict):
    """Save graph to JSON file"""
    os.makedirs(os.path.dirname(_graph_file), exist_ok=True)

    nodes_data = {}
    for node_id in G.nodes:
        nodes_data[str(node_id)] = {
            "name": G.nodes[node_id].get("name"),
            "map_id": G.nodes[node_id].get("map_id"),
            "floor": G.nodes[node_id].get("floor"),
            "type": G.nodes[node_id].get("type"),
            "linked_node_ids": G.nodes[node_id].get("linked_node_ids"),
            "pos": list(node_pos[node_id]),
        }

    edges_data = {}
    for u, v in G.edges:
        edge_data = G.get_edge_data(u, v)
        if str(u) not in edges_data:
            edges_data[str(u)] = {}
        edges_data[str(u)][str(v)] = edge_data

    data = {"nodes": nodes_data, "edges": edges_data}

    with open(_graph_file, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _get_global_graph(session: Session) -> Tuple[nx.Graph, Dict]:
    """Get or build global graph for all floors"""
    global _global_graph, _global_node_pos

    if _global_graph is not None and _global_node_pos is not None:
        return _global_graph, _global_node_pos

    # Try load from cache file first
    _global_graph, _global_node_pos = _load_graph_from_cache()
    if _global_graph is not None and _global_node_pos is not None:
        return _global_graph, _global_node_pos

    # Build new graph
    _global_graph, _global_node_pos = build_graph(session)

    # Save to cache file
    _save_graph_to_cache(_global_graph, _global_node_pos)

    return _global_graph, _global_node_pos


def _clear_graph_cache():
    """Clear in-memory graph cache and delete cache file"""
    global _global_graph, _global_node_pos
    _global_graph = None
    _global_node_pos = None

    if os.path.exists(_graph_file):
        os.remove(_graph_file)

    return {"message": "Graph cache cleared"}


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
    path_node_ids: List[int]  # Danh sách node IDs theo thứ tự đường đi
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


def build_graph(session: Session) -> Tuple[nx.Graph, Dict]:
    """Tạo đồ thị NetworkX từ DB cho tất cả các tầng"""
    G = nx.Graph()
    node_pos = {}
    node_map_info = {}  # Store map_id and floor info for each node

    # Load all maps
    all_maps = session.exec(select(Map)).all()
    related_map_ids = [m.id for m in all_maps]

    # Load all nodes
    nodes = session.exec(select(Node).where(Node.map_id.in_(related_map_ids))).all()

    if not nodes:
        raise HTTPException(status_code=404, detail="No nodes found.")

    # Create map_id -> floor_level lookup
    map_floor = {m.id: m.floor_level for m in all_maps}

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
                    # Only add if edge doesn't exist (avoid duplicate with DB edges)
                    if not G.has_edge(n.id, linked_id):
                        G.add_edge(
                            n.id, linked_id, weight=50, type=conn_type, polyline=[]
                        )

    # 5. Add edges for linked_campus_node_id (entrance <-> campus connection)
    for n in nodes:
        campus_node_id = n.linked_campus_node_id
        if campus_node_id and campus_node_id in G.nodes:
            # Add edge from building entrance to campus
            if not G.has_edge(n.id, campus_node_id):
                G.add_edge(
                    n.id, campus_node_id, weight=10, type="entrance", polyline=[]
                )
            # Also add reverse edge from campus to building entrance
            if not G.has_edge(campus_node_id, n.id):
                G.add_edge(
                    campus_node_id, n.id, weight=10, type="entrance", polyline=[]
                )

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

    # Calculate total distance along the path
    for i in range(len(path_nodes) - 1):
        u = path_nodes[i]
        v = path_nodes[i + 1]
        polyline = get_edge_polyline(G, u, v, node_pos)

        # Add distance from u to first polyline point
        if polyline:
            total_dist_px += get_distance(node_pos[u], polyline[0])
            # Add distances between polyline points
            for j in range(len(polyline) - 1):
                total_dist_px += get_distance(polyline[j], polyline[j + 1])
            # Add distance from last polyline point to v
            total_dist_px += get_distance(polyline[-1], node_pos[v])
        else:
            total_dist_px += get_distance(node_pos[u], node_pos[v])

    # Start instruction
    start_node = path_nodes[0]
    instructions.append(
        Instruction(
            step=1,
            text=f"Bắt đầu từ {G.nodes[start_node]['name'] or 'điểm xuất phát'}",
            action="start",
            distance_m=0,
            coordinate=node_pos[start_node],
        )
    )

    # Iterate over path_nodes and generate instructions at each node
    cumulative_dist = 0.0
    last_building_name = None  # Track building name for exit/entrance

    for i in range(1, len(path_nodes) - 1):
        current_node = path_nodes[i]
        prev_node = path_nodes[i - 1]
        next_node = path_nodes[i + 1]

        current_floor = G.nodes[current_node].get("floor")
        next_floor = G.nodes[next_node].get("floor")
        current_type = G.nodes[current_node].get("type")
        current_map_id = G.nodes[current_node].get("map_id")

        # Calculate distance from previous node to current
        polyline = get_edge_polyline(G, prev_node, current_node, node_pos)
        if polyline:
            segment_dist = get_distance(node_pos[prev_node], polyline[0])
            for j in range(len(polyline) - 1):
                segment_dist += get_distance(polyline[j], polyline[j + 1])
            segment_dist += get_distance(polyline[-1], node_pos[current_node])
        else:
            segment_dist = get_distance(node_pos[prev_node], node_pos[current_node])
        cumulative_dist += segment_dist

        # Check for floor change
        is_floor_change = current_floor and next_floor and current_floor != next_floor

        # Check for exit (building -> campus)
        is_exit = False
        if (
            current_type == "entrance"
            and current_floor is not None
            and next_floor is None
        ):
            is_exit = True

        # Check for entrance (campus -> building)
        is_entrance = False
        prev_floor = G.nodes[prev_node].get("floor")
        if current_type == "entrance" and prev_floor is None and next_floor is not None:
            is_entrance = True

        # Get node name, hide "New Node"
        node_name = G.nodes[current_node].get("name")
        if node_name and node_name.lower() == "new node":
            node_name = None

        dist_m = round(cumulative_dist * scale, 1)

        # Check if just exited to campus (prev was building floor, now at campus)
        just_exited_to_campus = prev_floor is not None and current_floor is None

        # Check if just changed floor within building (prev floor != current floor)
        just_changed_floor = (
            prev_floor is not None
            and current_floor is not None
            and prev_floor != current_floor
        )

        if is_floor_change:
            direction = "lên" if next_floor > current_floor else "xuống"
            floor_text = f"Tầng {next_floor}"
            edge_data = G.get_edge_data(current_node, next_node)
            edge_type = edge_data.get("type", "walk") if edge_data else "walk"

            if edge_type == "elevator":
                text = f"Đi {dist_m}m. Đi thang máy {direction} {floor_text}"
                step_action = "use_elevator"
            else:
                text = f"Đi {dist_m}m. Đi cầu thang {direction} {floor_text}"
                step_action = "use_stairs"

            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

        elif just_changed_floor:
            # After floor change, just say we're at this node
            text = f"Tại {node_name or 'tòa'}"
            step_action = "straight"
            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

        elif is_exit:
            building_name = node_name if node_name else "Tòa"
            text = f"Ra {building_name}"
            step_action = "exit"
            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

        elif just_exited_to_campus:
            # At first campus node after exiting building
            text = "Ra khỏi tòa nhà"
            step_action = "straight"
            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

        elif is_entrance:
            # Get building name from current node
            building_name = node_name if node_name else "Tòa"
            text = f"Đi {dist_m}m. Vào {building_name}"
            step_action = "entrance"
            last_building_name = building_name
            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

        else:
            # Normal turn direction
            p1 = node_pos[prev_node]
            p2 = node_pos[current_node]
            p3 = node_pos[next_node]
            angle = calculate_angle(p1, p2, p3)
            turn_action = get_turn_action(angle)

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
                text = f"Đi bộ {dist_m}m. Đi thẳng"
                step_action = "straight"

            instructions.append(
                Instruction(
                    step=len(instructions) + 1,
                    text=text,
                    action=step_action,
                    distance_m=dist_m,
                    coordinate=node_pos[current_node],
                )
            )
            cumulative_dist = 0.0

    # Destination instruction
    end_node = path_nodes[-1]
    end_name = G.nodes[end_node].get("name", "điểm đến")
    end_type = G.nodes[end_node].get("type")

    # Calculate final distance
    if len(path_nodes) >= 2:
        last_prev = path_nodes[-2]
        polyline = get_edge_polyline(G, last_prev, end_node, node_pos)
        if polyline:
            final_dist = get_distance(node_pos[last_prev], polyline[0])
            for j in range(len(polyline) - 1):
                final_dist += get_distance(polyline[j], polyline[j + 1])
            final_dist += get_distance(polyline[-1], node_pos[end_node])
        else:
            final_dist = get_distance(node_pos[last_prev], node_pos[end_node])
        cumulative_dist += final_dist

    final_dist_m = round(cumulative_dist * scale, 1)

    # Check if last instruction was a floor change (stairs/elevator) and destination is stairs/elevator
    last_action = instructions[-1].action if instructions else None
    skip_arrival = False

    if end_type in ["stairs", "elevator"] and last_action in [
        "use_stairs",
        "use_elevator",
    ]:
        skip_arrival = True

    if skip_arrival:
        # Just update the last floor change instruction to indicate arrival
        last_instr = instructions[-1]
        direction = "lên" if "lên" in last_instr.text else "xuống"
        last_instr.text = f"Đã đến {end_name} ({direction})"
    else:
        instructions.append(
            Instruction(
                step=len(instructions) + 1,
                text=f"Đi {final_dist_m}m. Đã đến {end_name}",
                action="arrive",
                distance_m=final_dist_m,
                coordinate=node_pos[end_node],
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
    start_node_id: int,
    end_node_id: int,
    session: Session = Depends(get_session),
):
    # Get start node to determine scale
    start_node = session.get(Node, start_node_id)
    if not start_node:
        raise HTTPException(status_code=400, detail="Start node không tồn tại")

    # 1. Lấy thông tin Map để có scale (dùng map của start node)
    m = session.get(Map, start_node.map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại")
    scale = m.scale_ratio if m.scale_ratio else 1.0  # mét / pixel

    # 2. Build Graph & Tìm đường ngắn nhất (Dijkstra)
    G, node_pos = _get_global_graph(session)

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
        map_id=start_node.map_id,
        path_coords=build_full_polyline(G, path_nodes, node_pos),
        path_node_ids=path_nodes,
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
            edge_data = G.get_edge_data(node_id, next_node_id)
            edge_type = edge_data.get("type") if edge_data else None

            # Get floor info for both nodes
            current_floor = G.nodes[node_id].get("floor")
            next_floor = G.nodes[next_node_id].get("floor")
            is_cross_floor = (
                current_floor is not None
                and next_floor is not None
                and current_floor != next_floor
            )

            # Skip polyline only for cross-floor edges (stairs/elevator between floors)
            # For same-floor edges to stairs/elevator, still include polyline
            if edge_type in ["stairs", "elevator"] and is_cross_floor:
                continue

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

    G, node_pos = _get_global_graph(session)

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
        path_node_ids=path_nodes,
        total_distance_m=round(total_px * scale, 2),
        instructions=instrs,
    )


@router.post("/refresh-cache")
def refresh_graph_cache(session: Session = Depends(get_session)):
    """Xóa cache và rebuild graph mới từ database"""
    _clear_graph_cache()
    # Rebuild and cache
    G, node_pos = _get_global_graph(session)
    return {
        "message": "Graph cache đã được cập nhật",
        "node_count": G.number_of_nodes(),
    }
