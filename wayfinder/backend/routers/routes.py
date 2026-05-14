import math
import json
import os
from typing import List, Optional, Tuple, Dict
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select
import networkx as nx

from backend.core.db import engine, get_session
from backend.models.entities import Map, Node, Edge, Alias

from backend.services.nlp import normalize_name, extract_a_b
from backend.services.geo import FIXED_COSTS
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
    # Fallback to node's own name (Skip if it's "New Node")
    node = session.get(Node, node_id)
    if node and node.name and node.name.lower() == "new node":
        return None
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
        return G, node_pos

    # Create map_id -> floor_level lookup
    map_floor = {m.id: m.floor_level for m in all_maps}

    for n in nodes:
        G.add_node(n.id)
        node_pos[n.id] = (n.x, n.y)
        G.nodes[n.id]["name"] = get_node_name(session, n.id)
        G.nodes[n.id]["map_id"] = n.map_id
        G.nodes[n.id]["floor"] = map_floor.get(n.map_id)
        G.nodes[n.id]["type"] = n.type
        node_map_info[n.id] = {"map_id": n.map_id, "floor": map_floor.get(n.map_id)}

    # 3. Load Edges from related maps
    edges = session.exec(
        select(Edge)
        .join(Node, Edge.start_node_id == Node.id)
        .where(Node.map_id.in_(related_map_ids))
    ).all()

    for e in edges:
        # Override weight for fixed cost types (stairs, elevator, entrance)
        # This ensures existing edges in DB get the new logic without migration
        weight = e.weight
        if e.type in FIXED_COSTS:
            weight = FIXED_COSTS[e.type]

        attr = {
            "weight": weight,
            "type": e.type,
            "polyline": e.polyline if e.polyline else [],
        }
        G.add_edge(e.start_node_id, e.end_node_id, **attr)

    return G, node_pos


# --- CORE LOGIC: GENERATE INSTRUCTIONS ---


def get_distance(p1, p2):
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def create_astar_heuristic(G: nx.Graph, node_pos: Dict):
    """
    Tạo heuristic function cho A* algorithm.
    Sử dụng Euclidean distance với floor penalty để ước lượng khoảng cách.

    Heuristic phải admissible (không bao giờ ước lượng quá cao) để A* đảm bảo
    tìm được đường ngắn nhất.
    """
    FLOOR_PENALTY = 20.0  # Conservative: stairs/elevator có weight=50

    def heuristic(u: int, v: int) -> float:
        u_pos = node_pos.get(u)
        v_pos = node_pos.get(v)

        if not u_pos or not v_pos:
            return 0.0

        euclidean_dist = get_distance(u_pos, v_pos)

        u_floor = G.nodes[u].get("floor")
        v_floor = G.nodes[v].get("floor")

        if u_floor is not None and v_floor is not None:
            floor_diff = abs(u_floor - v_floor)
            if floor_diff > 0:
                floor_penalty = floor_diff * FLOOR_PENALTY
                return euclidean_dist + floor_penalty

        return euclidean_dist

    return heuristic


def generate_human_instructions(
    G: nx.Graph, path_nodes: List[int], node_pos: Dict, map_scales: Dict[int, float]
) -> Tuple[List[Instruction], float]:
    """
    Tạo hướng dẫn đi bộ từ path_nodes.
    Tính toán khoảng cách chính xác theo scale của từng map.
    """
    instructions = []
    total_walk_distance_m = 0.0

    if len(path_nodes) < 2:
        return [], 0.0

    # Khởi tạo hướng dẫn bắt đầu
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

    cumulative_dist_m = 0.0
    
    for i in range(1, len(path_nodes) - 1):
        current_node = path_nodes[i]
        prev_node = path_nodes[i - 1]
        next_node = path_nodes[i + 1]

        u_data = G.nodes[prev_node]
        v_data = G.nodes[current_node]
        w_data = G.nodes[next_node]

        u_floor, v_floor, w_floor = u_data.get("floor"), v_data.get("floor"), w_data.get("floor")
        u_map, v_map, w_map = u_data.get("map_id"), v_data.get("map_id"), w_data.get("map_id")
        current_type = v_data.get("type")

        # Tính khoảng cách từ node trước đến node hiện tại
        is_transition_edge = (u_floor != v_floor) or (u_map != v_map)
        step_dist_m = 0.0
        if not is_transition_edge:
            # Đảm bảo map_id là int để map_scales.get hoạt động chính xác
            try:
                m_id = int(u_map) if u_map is not None else -1
            except:
                m_id = -1
            
            scale = map_scales.get(m_id, 1.0)
            px_dist = 0.0
            polyline = get_edge_polyline(G, prev_node, current_node, node_pos)
            if polyline:
                px_dist += get_distance(node_pos[prev_node], polyline[0])
                for j in range(len(polyline) - 1):
                    px_dist += get_distance(polyline[j], polyline[j + 1])
                px_dist += get_distance(polyline[-1], node_pos[current_node])
            else:
                px_dist = get_distance(node_pos[prev_node], node_pos[current_node])
            
            step_dist_m = px_dist * scale
            cumulative_dist_m += step_dist_m
            total_walk_distance_m += step_dist_m

        # Logic xác định hành động (rẽ, tầng, vào/ra...)
        is_floor_change = v_floor is not None and w_floor is not None and v_floor != w_floor
        is_exit = (current_type == "entrance" and v_floor is not None and w_floor is None)
        is_entrance = (current_type == "entrance" and u_floor is None and v_floor is not None)
        
        node_name = v_data.get("name")
        if node_name and node_name.lower() == "new node": node_name = None

        # HÀNH ĐỘNG: Chuyển tầng
        if is_floor_change:
            direction = "lên" if w_floor > v_floor else "xuống"
            edge_data = G.get_edge_data(current_node, next_node)
            edge_type = edge_data.get("type", "walk") if edge_data else "walk"
            
            dist_m = round(cumulative_dist_m, 1)
            dist_prefix = f"Đi {dist_m}m, " if dist_m > 0 else ""
            loc = f"đến {node_name}. " if node_name else ""
            
            text = f"{dist_prefix}{loc}Đi {'thang máy' if edge_type == 'elevator' else 'cầu thang'} {direction} Tầng {w_floor}"
            action = "use_elevator" if edge_type == 'elevator' else "use_stairs"
            
            instructions.append(Instruction(
                step=len(instructions)+1, text=text, action=action, 
                distance_m=dist_m, coordinate=node_pos[current_node]
            ))
            cumulative_dist_m = 0.0

        # HÀNH ĐỘNG: Vào/Ra tòa nhà
        elif is_exit or is_entrance:
            dist_m = round(cumulative_dist_m, 1)
            dist_prefix = f"Đi {dist_m}m, " if dist_m > 0 else ""
            
            building_name = node_name if node_name else "Tòa"
            text = f"{dist_prefix}Ra khỏi {building_name}" if is_exit else f"{dist_prefix}Đến lối vào. Vào {building_name}"
            action = "exit" if is_exit else "entrance"
            
            instructions.append(Instruction(
                step=len(instructions)+1, text=text, action=action, 
                distance_m=dist_m, coordinate=node_pos[current_node]
            ))
            cumulative_dist_m = 0.0

        # HÀNH ĐỘNG: Rẽ (Chỉ tạo instruction nếu rẽ hoặc nếu có tên node quan trọng)
        else:
            p1, p2, p3 = node_pos[prev_node], node_pos[current_node], node_pos[next_node]
            angle = calculate_angle(p1, p2, p3)
            turn = get_turn_action(angle)
            
            # Chỉ tạo instruction nếu rẽ đáng kể hoặc có tên node (phòng, cửa...)
            if turn != "straight" or node_name:
                dist_m = round(cumulative_dist_m, 1)
                
                # Skip if it's a straight instruction with 0.0m distance and no specific name
                if turn == "straight" and dist_m == 0.0 and not node_name:
                    continue

                dist_prefix = f"Đi {dist_m}m, " if dist_m > 0 else ""
                loc = f"đến {node_name}" if node_name else ""
                
                if turn == "left": text, action = f"{dist_prefix}{loc}. Rẽ trái", "turn_left"
                elif turn == "right": text, action = f"{dist_prefix}{loc}. Rẽ phải", "turn_right"
                elif turn == "slight_left": text, action = f"{dist_prefix}{loc}. Đi chếch trái", "slight_left"
                elif turn == "slight_right": text, action = f"{dist_prefix}{loc}. Đi chếch phải", "slight_right"
                else: text, action = f"{dist_prefix}{loc}. Đi thẳng", "straight"

                # Clean up leading dots or spaces
                text = text.replace("..", ".").replace(". .", ".").strip(". ")
                if text.startswith("đến "):
                    text = text.capitalize()

                if text:
                    instructions.append(Instruction(
                        step=len(instructions)+1, text=text, action=action, 
                        distance_m=dist_m, coordinate=node_pos[current_node]
                    ))
                    cumulative_dist_m = 0.0

    # Xử lý đoạn cuối cùng (từ last_prev đến end_node)
    end_node = path_nodes[-1]
    last_prev = path_nodes[-2]
    u_data, v_data = G.nodes[last_prev], G.nodes[end_node]
    
    if (u_data.get("floor") == v_data.get("floor")) and (u_data.get("map_id") == v_data.get("map_id")):
        try:
            m_id = int(u_data.get("map_id")) if u_data.get("map_id") is not None else -1
        except:
            m_id = -1
        scale = map_scales.get(m_id, 1.0)
        px_dist = 0.0
        polyline = get_edge_polyline(G, last_prev, end_node, node_pos)
        if polyline:
            px_dist += get_distance(node_pos[last_prev], polyline[0])
            for j in range(len(polyline) - 1): px_dist += get_distance(polyline[j], polyline[j + 1])
            px_dist += get_distance(polyline[-1], node_pos[end_node])
        else:
            px_dist = get_distance(node_pos[last_prev], node_pos[end_node])
        
        final_dist_m = px_dist * scale
        cumulative_dist_m += final_dist_m
        total_walk_distance_m += final_dist_m

    arrival_dist_m = round(cumulative_dist_m, 1)
    arrival_prefix = f"Đi {arrival_dist_m}m. " if arrival_dist_m > 0 else ""
    
    instructions.append(
        Instruction(
            step=len(instructions) + 1,
            text=f"{arrival_prefix}Đã đến {G.nodes[end_node].get('name', 'điểm đến')}",
            action="arrive",
            distance_m=arrival_dist_m,
            coordinate=node_pos[end_node],
        )
    )

    return instructions, total_walk_distance_m




from backend.services.search import find_best_nodes


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

    # 1. Lấy thông tin Map scales
    all_maps = session.exec(select(Map)).all()
    map_scales = {m.id: (m.scale_ratio if m.scale_ratio else 1.0) for m in all_maps}

    # 2. Build Graph & Tìm đường ngắn nhất
    G, node_pos = _get_global_graph(session)

    if start_node_id not in G or end_node_id not in G:
        raise HTTPException(
            status_code=400, detail="Start/End node không thuộc graph"
        )

    heuristic = create_astar_heuristic(G, node_pos)

    try:
        path_nodes = nx.astar_path(
            G,
            source=start_node_id,
            target=end_node_id,
            heuristic=heuristic,
            weight="weight",
        )
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="Không tìm thấy đường đi")

    # 3. Tạo hướng dẫn chi tiết
    instrs, total_dist_m = generate_human_instructions(G, path_nodes, node_pos, map_scales)

    return RouteResponse(
        map_id=start_node.map_id,
        path_coords=build_full_polyline(G, path_nodes, node_pos),
        path_node_ids=path_nodes,
        total_distance_m=round(total_dist_m, 2),
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
    map_id: Optional[int] = None,
    q: str = Query(..., description="Ví dụ: 'từ Sảnh A đến Thang máy'"),
    cx: Optional[float] = None,
    cy: Optional[float] = None,
    session: Session = Depends(get_session),
):
    # 1. Parse câu query
    start_txt, end_txt = extract_a_b(q)

    start_candidates = []
    end_candidates = []

    # 2. Tìm Start Node candidates
    if start_txt:
        start_candidates = find_best_nodes(session, start_txt, limit=10)
    elif cx is not None and cy is not None and map_id is not None:
        all_nodes = session.exec(select(Node).where(Node.map_id == map_id)).all()
        if all_nodes:
            all_nodes.sort(key=lambda n: math.hypot(n.x - cx, n.y - cy))
            # Mock SearchResult-like object for the ambiguity checker
            from collections import namedtuple
            SearchResultMock = namedtuple('SearchResultMock', ['node', 'score', 'name'])
            start_candidates = [SearchResultMock(node=all_nodes[0], score=100.0, name=all_nodes[0].name)]

    # 3. Tìm End Node candidates
    if end_txt:
        end_candidates = find_best_nodes(session, end_txt, limit=10)

    # Kiểm tra tính rõ ràng (ambiguity check)
    def check_ambiguity(candidates, name):
        if not candidates:
            return None, f"Không tìm thấy địa điểm '{name}'"

        # Nếu có nhiều hơn 1 kết quả và các kết quả hàng đầu có score quá sát nhau
        if len(candidates) > 1:
            score1 = candidates[0].score
            score2 = candidates[1].score
            # Nếu chênh lệch score < 15, coi là không rõ ràng (tăng lên 15 cho an toàn)
            if score1 - score2 < 15:
                # Liệt kê tất cả các địa điểm có điểm trên 80%
                relevant_candidates = [c for c in candidates if c.score >= 80]
                # Nếu không có cái nào trên 80, lấy top 3
                if not relevant_candidates:
                    relevant_candidates = candidates[:3]
                
                options = [
                    f"{c.name} (Tầng {session.get(Map, c.node.map_id).floor_level})"
                    for c in relevant_candidates
                ]
                return (
                    None,
                    f"Tìm thấy nhiều địa điểm '{name}': {', '.join(options)}. Vui lòng xác nhận chính xác hơn.",
                )

        return candidates[0].node.id, None

    start_id, start_err = check_ambiguity(
        start_candidates, start_txt or "vị trí của bạn"
    )
    end_id, end_err = check_ambiguity(end_candidates, end_txt or "điểm đến")

    if start_err or end_err:
        error_msg = ". ".join(filter(None, [start_err, end_err]))
        raise HTTPException(status_code=400, detail=error_msg)

    # 4. Tính toán đường đi
    all_maps = session.exec(select(Map)).all()
    map_scales = {m.id: (m.scale_ratio if m.scale_ratio else 1.0) for m in all_maps}

    G, node_pos = _get_global_graph(session)
    heuristic = create_astar_heuristic(G, node_pos)

    try:
        path_nodes = nx.astar_path(
            G, source=start_id, target=end_id, heuristic=heuristic, weight="weight"
        )
    except nx.NetworkXNoPath:
        raise HTTPException(
            status_code=404, detail="Không có đường đi giữa hai điểm này."
        )
    except nx.NodeNotFound:
        raise HTTPException(status_code=400, detail="Lỗi dữ liệu đồ thị.")

    instrs, total_dist_m = generate_human_instructions(G, path_nodes, node_pos, map_scales)

    return RouteResponse(
        map_id=start_candidates[0].node.map_id,
        path_coords=build_full_polyline(G, path_nodes, node_pos),
        path_node_ids=path_nodes,
        total_distance_m=round(total_dist_m, 2),
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
