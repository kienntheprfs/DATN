from typing import Optional, Any
import json

import requests
from langchain_core.tools import tool


WAYFINDER_API = "http://127.0.0.1:8004"


def _report_missing_location_internal(
    name: str,
    building_name: Optional[str] = None,
    floor_level: Optional[int] = None,
    description: Optional[str] = None,
):
    """Report a missing location to the database (internal helper)."""
    try:
        payload = {
            "name": name,
            "building_name": building_name,
            "floor_level": floor_level,
            "description": description,
        }
        response = requests.post(
            f"{WAYFINDER_API}/api/missing-locations",
            json=payload,
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None


def _report_missing_route_internal(
    start_name: str,
    start_building: Optional[str] = None,
    start_floor: Optional[int] = None,
    end_name: Optional[str] = None,
    end_building: Optional[str] = None,
    end_floor: Optional[int] = None,
    reason: Optional[str] = None,
):
    """Report a missing route to the database (internal helper)."""
    try:
        payload = {
            "start_name": start_name,
            "start_building": start_building,
            "start_floor": start_floor,
            "end_name": end_name,
            "end_building": end_building,
            "end_floor": end_floor,
            "reason": reason,
        }
        response = requests.post(
            f"{WAYFINDER_API}/api/missing-routes",
            json=payload,
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        return None
    except Exception:
        return None


def report_missing_location(
    location_name: str,
    building_name: Optional[str] = None,
    floor_level: Optional[int] = None,
    description: Optional[str] = None,
) -> str:
    """Báo cáo địa điểm bị thiếu trong hệ thống bản đồ. Dùng khi người dùng phản ánh hoặc không tìm thấy địa điểm nào đó.

    Args:
        location_name: Tên địa điểm bị thiếu (VD: "Phòng họp A", "Căn tin tầng 2")
        building_name: Tên tòa nhà nếu biết (VD: "Tòa B4", "Khu A")
        floor_level: Số tầng nếu biết
        description: Mô tả thêm về địa điểm hoặc ngữ cảnh báo cáo
    """
    result = _report_missing_location_internal(
        name=location_name,
        building_name=building_name,
        floor_level=floor_level,
        description=description,
    )
    if result:
        return f"Đã ghi nhận báo cáo địa điểm '{location_name}'. Cảm ơn bạn đã phản hồi, chúng tôi sẽ cập nhật sớm nhất có thể."
    return f"Không thể gửi báo cáo cho '{location_name}'. Vui lòng thử lại sau."


def report_missing_route(
    start_location: str,
    end_location: str,
    start_building: Optional[str] = None,
    end_building: Optional[str] = None,
    reason: Optional[str] = None,
) -> str:
    """Báo cáo tuyến đường bị thiếu hoặc không thể tìm được. Dùng khi người dùng phản ánh hoặc không tìm được đường giữa 2 điểm.

    Args:
        start_location: Tên địa điểm xuất phát
        end_location: Tên địa điểm đến
        start_building: Tên tòa nhà xuất phát nếu biết
        end_building: Tên tòa nhà đến nếu biết
        reason: Lý do/ngữ cảnh báo cáo (VD: "đi qua khu vực đang thi công", "thiếu cầu thang kết nối")
    """
    result = _report_missing_route_internal(
        start_name=start_location,
        start_building=start_building,
        end_name=end_location,
        end_building=end_building,
        reason=reason,
    )
    if result:
        return f"Đã ghi nhận báo cáo tuyến đường từ '{start_location}' đến '{end_location}'. Cảm ơn bạn đã phản hồi, chúng tôi sẽ kiểm tra và cập nhật sớm nhất có thể."
    return f"Không thể gửi báo cáo cho tuyến đường này. Vui lòng thử lại sau."


def find_route_func(
    from_location: Optional[str] = None,
    to_location: Optional[str] = None,
    from_node_id: Optional[int] = None,
    to_node_id: Optional[int] = None,
) -> str:
    """Tìm đường đi từ địa điểm xuất phát đến địa điểm đến (đa tầng).

    IMPORTANT: Bạn có thể truyền tên địa điểm HOẶC ID cụ thể (nếu đã biết từ bước xác nhận trước đó).
    - from_location: Tên Phòng/Tòa/Tầng (VD: "Phòng 101 Tòa B4").
    - to_location: Tên địa điểm đến (VD: "Phòng họp A").
    - from_node_id: ID của node xuất phát (nếu đã có từ bước xác nhận).
    - to_node_id: ID của node đến (nếu đã có từ bước xác nhận).

    Returns:
        JSON string containing route data for frontend rendering.
    """
    if not from_node_id and not from_location:
        return json.dumps({"status": "error", "message": "Thiếu thông tin điểm đi."})
    if not to_node_id and not to_location:
        return json.dumps({"status": "error", "message": "Thiếu thông tin điểm đến."})

    generic_patterns = [
        "vị trí hiện tại",
        "điểm đến",
        "đây",
        "đó",
        "tôi đang ở",
        "nơi đó",
        "current location",
        "destination",
        "here",
        "there",
    ]

    from_lower = from_location.lower().strip() if from_location else ""
    to_lower = to_location.lower().strip() if to_location else ""

    if from_location and any(p in from_lower for p in generic_patterns):
        return json.dumps(
            {
                "type": "route",
                "status": "error",
                "error_type": "unknown_start",
                "message": "Chưa xác định được vị trí xuất phát. Bạn đang ở đâu? Vui lòng cung cấp tên cụ thể (ví dụ: 'Phòng 101 Tòa B4' hoặc 'Tầng 1 - Khu A').",
                "start_name": from_location,
                "end_name": to_location,
            }
        )
    if to_location and any(p in to_lower for p in generic_patterns):
        return json.dumps(
            {
                "type": "route",
                "status": "error",
                "error_type": "unknown_end",
                "message": "Chưa xác định được điểm đến. Bạn muốn đi đâu? Vui lòng cung cấp tên cụ thể (ví dụ: 'Phòng họp A' hoặc 'Thư viện').",
                "start_name": from_location,
                "end_name": to_location,
            }
        )


    try:
        # Search start location (if ID not provided)
        start_results = []
        if from_node_id:
            # Get node info to have a display name
            resp = requests.get(f"{WAYFINDER_API}/api/nodes/{from_node_id}", timeout=5)
            if resp.status_code == 200:
                n = resp.json()
                start_results = [{
                    "node_id": n["id"],
                    "name": n["name"],
                    "score": 100.0,
                    "map_id": n["map_id"]
                }]
                # Try to get building/floor info for display
                m_resp = requests.get(f"{WAYFINDER_API}/api/maps/{n['map_id']}", timeout=5)
                if m_resp.status_code == 200:
                    m = m_resp.json()
                    start_results[0]["floor"] = m.get("floor_level")
                    if m.get("building_id"):
                        b_resp = requests.get(f"{WAYFINDER_API}/api/buildings/{m['building_id']}", timeout=5)
                        if b_resp.status_code == 200:
                            start_results[0]["building_name"] = b_resp.json().get("name")
        else:
            start_response = requests.get(
                f"{WAYFINDER_API}/api/aliases/search",
                params={"q": from_location, "limit": 20},
                timeout=10,
            )
            start_results = start_response.json() if start_response.status_code == 200 else []

        # Search end location (if ID not provided)
        end_results = []
        if to_node_id:
            resp = requests.get(f"{WAYFINDER_API}/api/nodes/{to_node_id}", timeout=5)
            if resp.status_code == 200:
                n = resp.json()
                end_results = [{
                    "node_id": n["id"],
                    "name": n["name"],
                    "score": 100.0,
                    "map_id": n["map_id"]
                }]
                m_resp = requests.get(f"{WAYFINDER_API}/api/maps/{n['map_id']}", timeout=5)
                if m_resp.status_code == 200:
                    m = m_resp.json()
                    end_results[0]["floor"] = m.get("floor_level")
                    if m.get("building_id"):
                        b_resp = requests.get(f"{WAYFINDER_API}/api/buildings/{m['building_id']}", timeout=5)
                        if b_resp.status_code == 200:
                            end_results[0]["building_name"] = b_resp.json().get("name")
        else:
            end_response = requests.get(
                f"{WAYFINDER_API}/api/aliases/search",
                params={"q": to_location, "limit": 20},
                timeout=10,
            )
            end_results = end_response.json() if end_response.status_code == 200 else []


        # Report missing locations if not found in DB
        if not start_results:
            _report_missing_location_internal(
                name=from_location,
                building_name=None,
                floor_level=None,
                description=f"Người dùng tìm đường từ '{from_location}' đến '{to_location}' nhưng không tìm thấy địa điểm xuất phát",
            )

        if not end_results:
            _report_missing_location_internal(
                name=to_location,
                building_name=None,
                floor_level=None,
                description=f"Người dùng tìm đường từ '{from_location}' đến '{to_location}' nhưng không tìm thấy địa điểm đến",
            )

        if not start_results:
            return json.dumps(
                {
                    "type": "route",
                    "status": "error",
                    "error_type": "start_not_found",
                    "message": f"Không tìm thấy địa điểm xuất phát '{from_location}'. Bạn có thể cung cấp thông tin cụ thể hơn không? (Ví dụ: 'Phòng 1 Tòa B4' hoặc 'Tầng 1 - Khu A')",
                    "start_name": from_location,
                    "end_name": to_location,
                }
            )
        if not end_results:
            return json.dumps(
                {
                    "type": "route",
                    "status": "error",
                    "error_type": "end_not_found",
                    "message": f"Không tìm thấy địa điểm đến '{to_location}'. Bạn có thể cung cấp thông tin cụ thể hơn không? (Ví dụ: 'Phòng 2 Tòa B4' hoặc 'Thư viện Tầng 3')",
                    "start_name": from_location,
                    "end_name": to_location,
                }
            )

        # Helper to format location string
        def format_location(item):
            parts = []
            if item.get("building_name"):
                parts.append(item["building_name"])
            if item.get("floor") is not None:
                parts.append(f"Tầng {item['floor']}")
            
            display = item['name']
            if parts:
                display += f" ({', '.join(parts)})"
            
            # Luôn đính kèm ID để Agent có thể dùng chính xác trong bước sau
            return f"{display} [ID: {item['node_id']}]"


        # Ambiguity check helper
        def get_best_node(results, location_name):
            if not results:
                return None, None, None
            
            # If only one result, use it
            if len(results) == 1:
                return results[0]["node_id"], format_location(results[0]), None
            
            # If multiple results, check if the first one is clearly better
            score1 = results[0].get("score", 0)
            score2 = results[1].get("score", 0)
            
            # If chênh lệch score >= 20, assume the first one is correct
            if score1 - score2 >= 20:
                return results[0]["node_id"], format_location(results[0]), None
            
            # Otherwise, it's ambiguous
            opts = [format_location(r) for r in results[:3]]
            return None, None, opts

        start_node_id, start_display, start_opts = get_best_node(start_results, from_location)
        end_node_id, end_display, end_opts = get_best_node(end_results, to_location)

        if not start_node_id or not end_node_id:
            return json.dumps({
                "type": "route",
                "status": "needs_confirmation",
                "message": "Tìm thấy nhiều địa điểm phù hợp. Vui lòng chọn địa điểm chính xác:",
                "start_name": from_location,
                "end_name": to_location,
                "start_options": start_opts if not start_node_id else [start_display],
                "end_options": end_opts if not end_node_id else [end_display],
            })

        # Find route (multi-floor)
        route_response = requests.get(
            f"{WAYFINDER_API}/api/find",
            params={"start_node_id": start_node_id, "end_node_id": end_node_id},
            timeout=30,
        )

        if route_response.status_code == 404:
            _report_missing_route_internal(
                start_name=start_display,
                end_name=end_display,
                reason="disconnected_graph",
            )
            return json.dumps(
                {
                    "type": "route",
                    "status": "error",
                    "error_type": "route_not_found",
                    "message": f"Không tìm được đường từ '{start_display}' đến '{end_display}'. Hệ thống đã ghi nhận vấn đề này và sẽ xử lý sớm.",
                    "start_name": start_display,
                    "end_name": end_display,
                }
            )
        if route_response.status_code == 400:
            return json.dumps(
                {
                    "type": "route",
                    "status": "error",
                    "error_type": "invalid_node",
                    "message": f"Lỗi: {route_response.json().get('detail', 'Node không hợp lệ')}",
                    "start_name": start_display,
                    "end_name": end_display,
                }
            )

        route_response.raise_for_status()
        result = route_response.json()

        # Check if route spans multiple floors
        path_node_ids = result.get("path_node_ids", [])

        # Get all maps involved in the route
        all_maps_response = requests.get(f"{WAYFINDER_API}/api/maps", timeout=10)
        all_maps = all_maps_response.json() if all_maps_response.status_code == 200 else []

        # Get node info to determine which map each node belongs to
        maps_in_route = set()
        nodes_in_route = []

        for node_id in path_node_ids:
            node_response = requests.get(f"{WAYFINDER_API}/api/nodes/{node_id}", timeout=10)
            if node_response.status_code == 200:
                node_data = node_response.json()
                if node_data.get("map_id"):
                    maps_in_route.add(node_data["map_id"])
                nodes_in_route.append(node_data)

        is_multi_floor = len(maps_in_route) > 1

        # Get only nodes/edges on the path (not all)
        route_maps = []
        path_node_set = set(path_node_ids)

        for map_id in sorted(maps_in_route):
            map_response = requests.get(f"{WAYFINDER_API}/api/maps/{map_id}", timeout=10)
            if map_response.status_code != 200:
                continue
            map_info = map_response.json()

            # Get nodes on this map that are in our path
            nodes_response = requests.get(
                f"{WAYFINDER_API}/api/nodes", params={"map_id": map_id}, timeout=10
            )
            all_nodes = nodes_response.json() if nodes_response.status_code == 200 else []
            path_nodes = [n for n in all_nodes if n.get("id") in path_node_set]

            # Get edges that connect path nodes on this map
            path_node_ids_set = set(n["id"] for n in path_nodes)
            edges_response = requests.get(
                f"{WAYFINDER_API}/api/edges", params={"map_id": map_id}, timeout=10
            )
            all_edges = edges_response.json() if edges_response.status_code == 200 else []
            path_edges = [
                e
                for e in all_edges
                if e.get("start_node_id") in path_node_ids_set
                and e.get("end_node_id") in path_node_ids_set
            ]

            route_maps.append({"map": map_info, "nodes": path_nodes, "edges": path_edges})

        # Get primary map info
        map_id = result.get("map_id", 1)
        map_response = requests.get(f"{WAYFINDER_API}/api/maps/{map_id}", timeout=10)
        map_data = (
            map_response.json()
            if map_response.status_code == 200
            else {"id": map_id, "name": "Bản đồ", "image_url": "", "scale_ratio": 1.0}
        )

        # Return structured JSON for frontend rendering
        response_data = {
            "type": "route",
            "status": "success",
            "start_name": start_display,
            "end_name": end_display,
            "map": map_data,
            "path_coords": result.get("path_coords", []),
            "path_node_ids": path_node_ids,
            "total_distance_m": result.get("total_distance_m", 0),
            "instructions": result.get("instructions", []),
            "is_multi_floor": is_multi_floor,
        }

        if is_multi_floor:
            response_data["route_maps"] = route_maps
            response_data["floor_count"] = len(maps_in_route)

        return json.dumps(response_data)

    except requests.RequestException as e:
        return json.dumps(
            {
                "type": "route",
                "status": "error",
                "error_type": "request_error",
                "message": f"Lỗi tìm đường: {str(e)}",
                "start_name": from_location,
                "end_name": to_location,
            }
        )

def guess_location_by_description_func(description: str) -> str:
    """Gợi ý vị trí dựa trên mô tả hoặc tên (Sử dụng fuzzy matching). 
    Dùng khi người dùng mô tả vị trí của họ (VD: "Tôi đang ở gần thang máy tòa B4")."""
    try:
        response = requests.get(
            f"{WAYFINDER_API}/api/locations/guess",
            params={"query": description, "limit": 5},
            timeout=10,
        )
        if response.status_code == 200:
            results = response.json()
            if not results:
                return "Không tìm thấy địa điểm nào khớp với mô tả của bạn."
            
            return json.dumps({
                "type": "location_guess",
                "status": "success",
                "results": results
            }, ensure_ascii=False)
        return "Lỗi khi tìm kiếm địa điểm."
    except Exception as e:
        return f"Lỗi kết nối: {str(e)}"

def get_landmark_images_func() -> str:
    """Lấy danh sách các địa điểm nổi bật có hình ảnh thực tế để người dùng nhận diện vị trí.
    Dùng khi người dùng không biết mình đang ở đâu và cần gợi ý bằng hình ảnh."""
    try:
        response = requests.get(
            f"{WAYFINDER_API}/api/locations/landmarks",
            timeout=10,
        )
        if response.status_code == 200:
            results = response.json()
            return json.dumps({
                "type": "landmarks",
                "status": "success",
                "landmarks": results
            }, ensure_ascii=False)
        return "Lỗi khi lấy danh sách địa điểm nổi bật."
    except Exception as e:
        return f"Lỗi kết nối: {str(e)}"

guess_location_by_description: Any = tool(guess_location_by_description_func)
guess_location_by_description.name = "GuessLocationByDescription"

get_landmark_images: Any = tool(get_landmark_images_func)
get_landmark_images.name = "GetLandmarkImages"



find_route: Any = tool(find_route_func)
find_route.name = "FindRoute"

report_missing_location_tool: Any = tool(report_missing_location)
report_missing_location_tool.name = "ReportMissingLocation"

report_missing_route_tool: Any = tool(report_missing_route)
report_missing_route_tool.name = "ReportMissingRoute"

map_tools = [
    find_route, 
    report_missing_location_tool, 
    report_missing_route_tool,
    guess_location_by_description,
    get_landmark_images
]
