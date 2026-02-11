from typing import List, Optional, Dict, Tuple
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select
import networkx as nx

from backend.core.db import engine
from backend.models.entities import Map, Node, Alias
from backend.services.graph import build_graph_for_map
from backend.utils.geo import (
    merge_polylines,
    polyline_length,
    angle_signed,
    signed_turn_angle_screen,
    polyline_length,
    merge_polys_with_tol,
    orient_polyline_to_uv,
    initial_heading_text_from_angle,
    heading_angle_from_polyline,
    dedupe_polyline,
)
from backend.utils.nlp import extract_a_b
from backend.utils.norm import normalize_name
from rapidfuzz import process, fuzz
import math

router = APIRouter()


def get_session():
    with Session(engine) as session:
        yield session


# ------- Models -------


class RouteRequest(BaseModel):
    map_id: int
    start_id: Optional[int] = None
    end_id: Optional[int] = None
    # Nếu không có start/end, có thể truyền câu q + (cx, cy) để xác định "điểm của tôi"
    q: Optional[str] = None
    cx: Optional[float] = None
    cy: Optional[float] = None


class Instruction(BaseModel):
    kind: str  # "straight" | "left" | "right"
    text: str
    at_index: int  # index trong polyline hợp nhất (điểm "rẽ")
    distance_px: float


class RouteResponse(BaseModel):
    path_node_ids: List[int]
    polyline: List[List[float]]
    length_px: float
    instructions: List[Instruction]


# ------- Helpers -------


def best_alias_for_node(session: Session, node_id: int) -> str:
    als = session.exec(select(Alias).where(Alias.node_id == node_id)).all()
    if not als:
        return f"điểm #{node_id}"
    als.sort(key=lambda a: (-a.weight, a.id))
    return als[0].name


MIN_FUZZY_SCORE = 90
# (Giữ nguyên các imports và các hàm khác)


def find_best_alias_node(
    session: Session,
    map_id: int,
    query: str,
    cx: Optional[float] = None,
    cy: Optional[float] = None,
) -> Optional[int]:
    """
    Tìm node_id theo tên (alias) gần đúng, sử dụng fuzz.WRatio và ngưỡng 95
    để tăng độ nghiêm ngặt và tránh nhầm lẫn giữa các từ/tên ngắn.
    """
    norm_q = normalize_name(query)

    # Lấy toàn bộ alias và node cho map_id
    aliases = session.exec(select(Alias, Node).where(Alias.node_id == Node.id).where(Node.map_id == map_id)).all()

    if not aliases:
        return None

    # id -> tên chuẩn hoá; và map id -> (Alias, Node)
    choices = {a.id: normalize_name(a.name) for (a, _n) in aliases}
    by_id = {a.id: (a, n) for (a, n) in aliases}

    # 1. Tìm kiếm mờ: Dùng fuzz.WRatio và yêu cầu score >= 95
    # fuzz.WRatio giúp xử lý độ dài chuỗi khác nhau tốt hơn token_set_ratio.
    best = process.extract(
        norm_q, choices, scorer=fuzz.WRatio, limit=5, score_cutoff=MIN_FUZZY_SCORE  # <--- THAY ĐỔI CHÍNH: Dùng WRatio  # <-- THAY ĐỔI: Nên đặt MIN_FUZZY_SCORE = 95
    )

    cand = []
    for choice_value, score, choice_key in best:
        pair = by_id.get(choice_key)
        if pair:
            # Không cần kiểm tra Simple Ratio phụ vì WRatio đã nghiêm ngặt hơn
            _a, n = pair
            cand.append((n, score))

    if not cand:
        # Không có alias nào khớp với ngưỡng score cao
        return None

    # 2. Xử lý ưu tiên (Giữ nguyên logic gốc)

    # Nếu có vị trí (cx,cy), ưu tiên node gần nhất
    if cx is not None and cy is not None:
        cand.sort(key=lambda t: math.hypot(t[0].x - cx, t[0].y - cy))
        return cand[0][0].id

    # Ngược lại, chọn node có score cao nhất
    cand.sort(key=lambda t: (-t[1], t[0].id))
    return cand[0][0].id


def turn_text(angle: float, thresh: float = 70.0):
    if angle > +thresh:
        return ("right", "rẽ phải")
    elif angle < -thresh:
        return ("left", "rẽ trái")
    else:
        return ("straight", "đi thẳng")


def nearest_landmark_name_v2(
    session: Session,
    map_id: int,
    prev_x: float,  # Tọa độ điểm trước chỗ rẽ
    prev_y: float,
    x: float,  # Tọa độ chỗ rẽ
    y: float,
    radius: float = 50.0,  # Đã tăng radius lên 100.0 theo yêu cầu
) -> Optional[str]:
    """
    Tìm landmark gần 1 điểm, chỉ chọn landmark nằm về hướng người sắp đi tới.
    Trả tên alias 'đẹp' nhất nếu có.
    """

    # 1. Tính toán vectơ hướng đi TỚI chỗ rẽ (A -> B)
    dx_current = x - prev_x
    dy_current = y - prev_y
    # Nếu đang ở điểm bắt đầu (không có prev_x/y), ta không lọc hướng (trường hợp này hiếm khi xảy ra ở turn node)
    is_heading_valid = dx_current != 0.0 or dy_current != 0.0

    nodes = session.exec(select(Node).where(Node.map_id == map_id).where(Node.is_landmark == True)).all()
    best = None
    best_d = None

    # Lặp qua các landmark
    for n in nodes:
        d = math.hypot(n.x - x, n.y - y)

        # Kiểm tra bán kính
        if d > radius:
            continue

        # 2. Lọc theo Hướng (nếu có hướng hợp lệ)
        if is_heading_valid:
            # Vectơ từ chỗ rẽ (B) đến Landmark (L): V_BL
            dx_to_lm = n.x - x
            dy_to_lm = n.y - y

            # Tính tích vô hướng (Dot Product)
            # Dot(V_AB, V_BL) > 0 nghĩa là Landmark L nằm về phía TRƯỚC của hướng đi V_AB
            dot_product = dx_current * dx_to_lm + dy_current * dy_to_lm

            # Nếu tích vô hướng âm, tức là landmark nằm ở phía sau hoặc góc lớn hơn 90 độ
            if dot_product < 0:
                continue

        # 3. Cập nhật landmark gần nhất và nằm đúng hướng
        if best is None or d < best_d:
            best = n
            best_d = d

    if not best:
        return None

    # Lấy alias có weight cao nhất
    aliases = session.exec(select(Alias).where(Alias.node_id == best.id)).all()
    if not aliases:
        return f"điểm {best.id}"
    aliases.sort(key=lambda a: (-a.weight, a.id))
    return aliases[0].name


def build_instructions(
    session: Session,
    map_id: int,
    merged: List[List[float]],
    start_id: Optional[int] = None,
    end_id: Optional[int] = None,
) -> List[Instruction]:
    instr: List[Instruction] = []

    # ----------------------------------------------------
    # Tính toán độ dài đoạn đường (seg_len) SỚM
    # ----------------------------------------------------
    seg_len = [0.0]
    for i in range(1, len(merged)):
        d = math.hypot(merged[i][0] - merged[i - 1][0], merged[i][1] - merged[i - 1][1])
        seg_len.append(d)

    # ----------------------------------------------------
    # 1. Start Instruction
    # ----------------------------------------------------
    if start_id is not None:
        start_name = best_alias_for_node(session, start_id)
        instr.append(
            Instruction(
                kind="start",
                text=f"Bắt đầu tại {start_name}",
                at_index=0,
                distance_px=0.0,
            )
        )
    else:
        instr.append(Instruction(kind="start", text="Bắt đầu hành trình", at_index=0, distance_px=0.0))

    # Xử lý trường hợp không đủ điểm
    if len(merged) < 2:
        dest_name = best_alias_for_node(session, end_id) if end_id is not None else "điểm đích"
        instr.append(Instruction(kind="arrive", text=f"Đã đến {dest_name}", at_index=0, distance_px=0.0))
        return instr

    # ----------------------------------------------------
    # 2. Initial Heading (Hướng ban đầu) - Giữ nguyên logic cũ
    # ----------------------------------------------------
    ang = heading_angle_from_polyline([(float(x), float(y)) for x, y in merged], min_dist=25.0)
    heading_txt = initial_heading_text_from_angle(ang)

    # Tìm node/landmark rẽ đầu tiên
    first_turn_index = next(
        (i for i in range(1, len(merged) - 1) if turn_text(signed_turn_angle_screen(tuple(merged[i - 1]), tuple(merged[i]), tuple(merged[i + 1])))[0] != "straight"),
        len(merged) - 1,
    )

    initial_text = f"Hướng ban đầu của bạn sẽ đi theo bản đồ là {heading_txt}"

    # Nếu có ít nhất một điểm rẽ
    if first_turn_index < len(merged) - 1:
        dist_to_first_turn = sum(seg_len[1 : first_turn_index + 1])
        first_turn_pos = merged[first_turn_index]

        # SỬ DỤNG V2 và RADIUS 100.0 (chỉ tìm phía trước)
        first_lm = nearest_landmark_name_v2(session, map_id, merged[first_turn_index - 1][0], merged[first_turn_index - 1][1], first_turn_pos[0], first_turn_pos[1], radius=100.0)

        if first_lm:
            # Ưu tiên Landmark cho hướng dẫn ban đầu
            initial_text = f"Hướng ban đầu là {heading_txt}. Đi thẳng đến khu vực {first_lm}."
        else:
            # Fallback (chỉ báo khoảng cách đến chỗ rẽ đầu tiên)
            initial_text = f"Hướng ban đầu là {heading_txt}."

    instr.append(Instruction(kind="heading", text=initial_text, at_index=1, distance_px=0.0))

    # Nếu chỉ có 2 điểm => đi thẳng là xong
    if len(merged) == 2:
        total = polyline_length([(x, y) for x, y in merged])
        dest_name = best_alias_for_node(session, end_id) if end_id is not None else "điểm đích"
        instr.append(Instruction(kind="straight", text=f"Đi thẳng khoảng {int(total)} px cho đến khi bạn đến {dest_name}", at_index=1, distance_px=total))
        instr.append(Instruction(kind="arrive", text=f"Đã đến {dest_name}", at_index=1, distance_px=0.0))
        return instr

    # ----------------------------------------------------
    # 3. Tính toán và tạo Instructions cho các đoạn rẽ (ĐÃ CẬP NHẬT LOGIC)
    # ----------------------------------------------------
    turns = []  # Thêm 'lm_source'
    MIN_DISTANCE_BETWEEN_TURNS = 10.0

    for i in range(1, len(merged) - 1):
        a = signed_turn_angle_screen(tuple(merged[i - 1]), tuple(merged[i]), tuple(merged[i + 1]))
        kind, phrase = turn_text(a)
        if kind == "straight":
            continue

        if turns:
            # Nếu đã có turn, kiểm tra xem nó có quá gần turn trước không
            last_turn_i = turns[-1]["i"]
            dist_from_last_turn = sum(seg_len[last_turn_i + 1 : i + 1])
            if dist_from_last_turn < MIN_DISTANCE_BETWEEN_TURNS:
                continue

        prev_pos = merged[i - 1]
        current_pos = merged[i]

        lm = None
        lm_source = None  # 'ahead' (trước) hoặc 'behind' (sau)

        # 1. TÌM LANDMARK PHÍA TRƯỚC (Ưu tiên - Radius 100.0)
        lm_ahead = nearest_landmark_name_v2(session, map_id, prev_pos[0], prev_pos[1], current_pos[0], current_pos[1], radius=150.0)

        if lm_ahead:
            lm = lm_ahead
            lm_source = "ahead"
        else:
            # 2. TÌM LANDMARK VỪA ĐI QUA (Fallback - Đảo ngược hướng, Radius 150.0)
            # Vectơ B->A sẽ lọc Landmark nằm phía sau A (vừa đi qua)
            lm_behind = nearest_landmark_name_v2(session, map_id, current_pos[0], current_pos[1], prev_pos[0], prev_pos[1], radius=150.0)
            if lm_behind:
                lm = lm_behind
                lm_source = "behind"

        turns.append({"i": i, "kind": kind, "phrase": phrase, "lm": lm, "lm_source": lm_source})

    prev_idx = 0
    for t in turns:
        i = t["i"]
        dist_before = sum(seg_len[prev_idx + 1 : i + 1])

        # Tùy chỉnh câu chữ hướng dẫn tại điểm rẽ dựa trên lm_source
        if t["lm"]:
            if t["lm_source"] == "ahead":
                # Trường hợp ƯU TIÊN: Landmark nằm ở phía TRƯỚC chỗ rẽ
                text = f"Đi thẳng khoảng {int(dist_before)} px. Khi đến khu vực {t['lm']}, {t['phrase']}."
            elif t["lm_source"] == "behind":
                # Trường hợp FALLBACK: Landmark vừa đi QUA (phía sau)
                text = f"Đi thẳng khoảng {int(dist_before)} px Ngay sau khi đi qua {t['lm']}, {t['phrase']}."
        else:
            # Trường hợp CUỐI: Không tìm thấy Landmark nào
            text = f"Đi thẳng khoảng {int(dist_before)} px, sau đó {t['phrase']}."

        # Thêm vào instructions
        instr.append(Instruction(kind=t["kind"], text=text, at_index=i, distance_px=dist_before))
        prev_idx = i

    # ----------------------------------------------------
    # 4. Đoạn thẳng cuối cùng (Tail Segment)
    # ----------------------------------------------------
    tail_dist = sum(seg_len[prev_idx + 1 : len(merged)])
    dest_name = best_alias_for_node(session, end_id) if end_id is not None else "điểm đích"

    if tail_dist > 1e-6:
        # Nếu đoạn cuối dài, kết hợp nó với điểm đích
        instr.append(
            Instruction(
                kind="straight",
                text=f"Tiếp tục đi thẳng khoảng {int(tail_dist)} px, bạn sẽ đến {dest_name}.",
                at_index=len(merged) - 1,
                distance_px=tail_dist,
            )
        )

    # ----------------------------------------------------
    # 5. Arrive Instruction
    # ----------------------------------------------------
    instr.append(
        Instruction(
            kind="arrive",
            text=f"Bạn đã đến {dest_name}.",
            at_index=len(merged) - 1,
            distance_px=0.0,
        )
    )

    return instr


def compute_route(session: Session, map_id: int, start_id: int, end_id: int) -> RouteResponse:
    G, node_pos = build_graph_for_map(session, map_id)
    if start_id not in G.nodes or end_id not in G.nodes:
        raise HTTPException(
            status_code=400,
            detail="start_id hoặc end_id không thuộc map hoặc không tồn tại.",
        )

    try:
        path_nodes: List[int] = nx.shortest_path(G, source=start_id, target=end_id, weight="weight")
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="Không có đường đi giữa hai điểm.")

    # Lấy polyline theo từng cạnh và ORIENT theo chiều u->v
    oriented_polys: List[List[List[float]]] = []
    for i in range(1, len(path_nodes)):
        u, v = path_nodes[i - 1], path_nodes[i]
        data = G.get_edge_data(u, v)
        if not data or "polyline" not in data:
            raise HTTPException(status_code=500, detail="Thiếu polyline trên cạnh.")
        raw = data["polyline"]  # [[x,y], ...]
        # Định hướng polyline theo node_pos[u] -> node_pos[v]
        u_pos = (float(node_pos[u][0]), float(node_pos[u][1]))
        v_pos = (float(node_pos[v][0]), float(node_pos[v][1]))
        oriented = orient_polyline_to_uv([(float(x), float(y)) for x, y in raw], u_pos, v_pos)
        oriented_polys.append([[p[0], p[1]] for p in oriented])

    # Ghép có tolerance (tránh lệch 1-2 px)
    merged = merge_polys_with_tol([[(x, y) for x, y in poly] for poly in oriented_polys], tol=10.0)
    merged = [[float(x), float(y)] for (x, y) in merged]

    merged = dedupe_polyline([(x, y) for x, y in merged], tol=10.0)
    merged = [[float(x), float(y)] for (x, y) in merged]

    total_len = polyline_length([(x, y) for x, y in merged])
    directions = build_instructions(session, map_id, merged, start_id=start_id, end_id=end_id)

    return RouteResponse(
        path_node_ids=path_nodes,
        polyline=merged,
        length_px=total_len,
        instructions=directions,
    )


# ------- Endpoints -------


@router.post("/route", response_model=RouteResponse)
def route_api(payload: RouteRequest, session: Session = Depends(get_session)):
    m = session.get(Map, payload.map_id)
    if not m:
        raise HTTPException(status_code=404, detail="Map không tồn tại.")

    # Nếu đã có start/end id => đi thẳng
    if payload.start_id and payload.end_id:
        return compute_route(session, payload.map_id, payload.start_id, payload.end_id)

    # Nếu không có, cho phép q + (cx,cy)
    if not payload.q:
        raise HTTPException(status_code=400, detail="Thiếu q hoặc start_id/end_id.")
    a_txt, b_txt = extract_a_b(payload.q)
    if b_txt is None and a_txt is None:
        raise HTTPException(status_code=400, detail="Không trích xuất được điểm đầu/cuối từ câu hỏi.")

    # Tìm node bắt đầu
    start_id = payload.start_id
    end_id = payload.end_id

    if start_id is None and a_txt:
        start_id = find_best_alias_node(session, payload.map_id, a_txt, payload.cx, payload.cy)
    if end_id is None and b_txt:
        end_id = find_best_alias_node(session, payload.map_id, b_txt, payload.cx, payload.cy)

    # Nếu chỉ có 'đến B' => cần cx,cy để chọn điểm gần nhất làm 'điểm của tôi'
    if start_id is None and a_txt is None:
        if payload.cx is None or payload.cy is None:
            raise HTTPException(
                status_code=400,
                detail="Cần cx,cy (vị trí của bạn) khi chỉ cung cấp điểm đích.",
            )
        # tạo node giả lập gần nhất (chọn node thật gần nhất làm start)
        nodes = session.exec(select(Node).where(Node.map_id == payload.map_id)).all()
        if not nodes:
            raise HTTPException(status_code=400, detail="Map chưa có node.")
        nodes.sort(key=lambda n: math.hypot(n.x - payload.cx, n.y - payload.cy))
        start_id = nodes[0].id

    if start_id is None or end_id is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm được node tương ứng với tên (có thể quá mơ hồ).",
        )

    return compute_route(session, payload.map_id, start_id, end_id)


@router.get("/nl-route", response_model=RouteResponse)
def nl_route(
    map_id: int = Query(...),
    q: str = Query(..., description="Câu hỏi: 'từ A đến B'..."),
    cx: Optional[float] = Query(None),
    cy: Optional[float] = Query(None),
    session: Session = Depends(get_session),
):
    payload = RouteRequest(map_id=map_id, q=q, cx=cx, cy=cy)
    return route_api(payload, session)
