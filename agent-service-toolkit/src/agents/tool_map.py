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
    from_location: str,
    to_location: str,
) -> str:
    """Tìm đường đi từ địa điểm xuất phát đến địa điểm đến (đa tầng).

    IMPORTANT: Đầu vào PHẢI là tên cụ thể của địa điểm thực tế trong trường.
    - from_location: Phải là tên Phòng/Tòa/Tầng cụ thể (VD: "Phòng 101 Tòa B4", "Thư viện Tầng 1", "Căn tin Khu A"). KHÔNG dùng "vị trí hiện tại", "đây", "tôi đang ở".
    - to_location: Phải là tên địa điểm cụ thể (VD: "Phòng họp A Tầng 2", "Phòng đào tạo Tòa B3"). KHÔNG dùng "điểm đến", "đó", "nơi đó".

    Returns:
        JSON string containing route data for frontend rendering.
    """
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

    from_lower = from_location.lower().strip()
    to_lower = to_location.lower().strip()

    if any(p in from_lower for p in generic_patterns):
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
    if any(p in to_lower for p in generic_patterns):
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
        # Search start location (all floors) - increase limit
        start_response = requests.get(
            f"{WAYFINDER_API}/api/aliases/search",
            params={"q": from_location, "limit": 20},
            timeout=10,
        )
        start_response.raise_for_status()
        start_results = start_response.json()

        # Search end location (all floors) - increase limit
        end_response = requests.get(
            f"{WAYFINDER_API}/api/aliases/search",
            params={"q": to_location, "limit": 20},
            timeout=10,
        )
        end_response.raise_for_status()
        end_results = end_response.json()

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
            if parts:
                return f"{item['name']} ({', '.join(parts)})"
            return item["name"]

        # Check if we have multiple candidates - show options for user to confirm
        if len(start_results) > 1 or len(end_results) > 1:
            start_opts = [format_location(r) for r in start_results[:5]]
            end_opts = [format_location(r) for r in end_results[:5]]

            # If we have good match (high score), use it directly
            if start_results[0].get("score", 0) >= 70 and len(start_results) == 1:
                start_node_id = start_results[0]["node_id"]
                start_display = format_location(start_results[0])
            elif start_results[0].get("score", 0) >= 50:
                # Show top matches and use the best one
                start_node_id = start_results[0]["node_id"]
                start_display = format_location(start_results[0])
            else:
                # Low confidence - ask user
                return json.dumps(
                    {
                        "type": "route",
                        "status": "needs_confirmation",
                        "message": f"Tìm thấy nhiều địa điểm có thể là '{from_location}'. Vui lòng xác nhận hoặc cung cấp thông tin cụ thể hơn.",
                        "start_name": from_location,
                        "end_name": to_location,
                        "start_options": start_opts,
                        "end_options": end_opts,
                    }
                )

            if end_results[0].get("score", 0) >= 70 and len(end_results) == 1:
                end_node_id = end_results[0]["node_id"]
                end_display = format_location(end_results[0])
            elif end_results[0].get("score", 0) >= 50:
                end_node_id = end_results[0]["node_id"]
                end_display = format_location(end_results[0])
            else:
                return json.dumps(
                    {
                        "type": "route",
                        "status": "needs_confirmation",
                        "message": f"Tìm thấy nhiều địa điểm có thể là '{to_location}'. Vui lòng xác nhận hoặc cung cấp thông tin cụ thể hơn.",
                        "start_name": start_display,
                        "end_name": to_location,
                        "start_options": [start_display],
                        "end_options": end_opts,
                    }
                )
        else:
            start_node_id = start_results[0]["node_id"]
            end_node_id = end_results[0]["node_id"]
            start_display = format_location(start_results[0])
            end_display = format_location(end_results[0])

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


find_route: Any = tool(find_route_func)
find_route.name = "FindRoute"

report_missing_location_tool: Any = tool(report_missing_location)
report_missing_location_tool.name = "ReportMissingLocation"

report_missing_route_tool: Any = tool(report_missing_route)
report_missing_route_tool.name = "ReportMissingRoute"

map_tools = [find_route, report_missing_location_tool, report_missing_route_tool]
