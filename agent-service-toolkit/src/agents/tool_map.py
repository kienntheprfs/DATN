from typing import Optional, Any
import json

import requests
from langchain_core.tools import tool


WAYFINDER_API = "http://127.0.0.1:8004"


def find_route_func(
    from_location: str,
    to_location: str,
) -> str:
    """Tìm đường đi từ địa điểm xuất phát đến địa điểm đến (đa tầng). Tự động tìm kiếm và xử lý nếu có nhiều kết quả."""
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

        # Validate results
        if not start_results:
            return f"Không tìm thấy địa điểm xuất phát '{from_location}'. Hãy thử tìm kiếm với tên ngắn hơn (ví dụ: 'Phòng 1' thay vì 'Phòng 1 - Tòa B4')."

        if not end_results:
            return f"Không tìm thấy địa điểm đến '{to_location}'. Hãy thử tìm kiếm với tên ngắn hơn (ví dụ: 'Phòng 2' thay vì 'Phòng 2 - Tòa B4')."

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
                confirm_msg = f"""Tìm thấy nhiều địa điểm có thể là '{from_location}'. Vui lòng xác nhận hoặc cung cấp thông tin cụ thể hơn:

Địa điểm xuất phát:
{chr(10).join(f"- {opt}" for opt in start_opts)}

Địa điểm đến:
{chr(10).join(f"- {opt}" for opt in end_opts)}

Hãy cho biết chính xác địa điểm (ví dụ: "Phòng 1 Tòa B4 Tầng 1" hoặc "Tòa B4")"""
                return confirm_msg

            if end_results[0].get("score", 0) >= 70 and len(end_results) == 1:
                end_node_id = end_results[0]["node_id"]
                end_display = format_location(end_results[0])
            elif end_results[0].get("score", 0) >= 50:
                end_node_id = end_results[0]["node_id"]
                end_display = format_location(end_results[0])
            else:
                confirm_msg = f"""Tìm thấy nhiều địa điểm có thể là '{to_location}'. Vui lòng xác nhận hoặc cung cấp thông tin cụ thể hơn:

Địa điểm xuất phát: {start_display}
Địa điểm đến:
{chr(10).join(f"- {opt}" for opt in end_opts)}

Hãy cho biết chính xác địa điểm (ví dụ: "Phòng 2 Tòa B4 Tầng 2")"""
                return confirm_msg
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
            return f"Không tìm được đường từ '{start_display}' đến '{end_display}'."
        if route_response.status_code == 400:
            return f"Lỗi: {route_response.json().get('detail', 'Node không hợp lệ')}"

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

        # Get all maps data for multi-floor route
        route_maps = []
        for map_id in sorted(maps_in_route):
            map_response = requests.get(f"{WAYFINDER_API}/api/maps/{map_id}", timeout=10)
            if map_response.status_code == 200:
                map_info = map_response.json()
                # Get nodes for this map
                nodes_response = requests.get(
                    f"{WAYFINDER_API}/api/nodes", params={"map_id": map_id}, timeout=10
                )
                nodes = nodes_response.json() if nodes_response.status_code == 200 else []
                # Get edges for this map
                edges_response = requests.get(
                    f"{WAYFINDER_API}/api/edges", params={"map_id": map_id}, timeout=10
                )
                edges = edges_response.json() if edges_response.status_code == 200 else []

                route_maps.append({"map": map_info, "nodes": nodes, "edges": edges})

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
        return f"Lỗi tìm đường: {str(e)}"


find_route: Any = tool(find_route_func)
find_route.name = "FindRoute"

map_tools = [find_route]
