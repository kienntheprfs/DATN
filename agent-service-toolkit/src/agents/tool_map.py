import json
import math
from typing import List, Dict, Any, Optional

import requests
from langchain_core.tools import BaseTool, tool


def get_maps_func() -> str:
    """Lấy danh sách tất cả các bản đồ có sẵn."""
    try:
        response = requests.get("http://127.0.0.1:8000/maps")
        response.raise_for_status()
        data = response.json()

        if not data.get("items"):
            return "Không có bản đồ nào có sẵn."

        maps_info = []
        for map_item in data["items"]:
            maps_info.append(f"ID: {map_item['id']}, Tên: {map_item['name']}")

        return "Danh sách bản đồ:\n" + "\n".join(maps_info)

    except Exception as e:
        return f"Lỗi khi lấy danh sách bản đồ: {str(e)}"


def get_map_nodes_func(map_id: int) -> str:
    """Lấy danh sách các node (điểm) trên một bản đồ cụ thể."""
    try:
        response = requests.get(f"http://127.0.0.1:8000/nodes/map/{map_id}/with-aliases")
        response.raise_for_status()
        nodes = response.json()

        if not nodes:
            return f"Không có node nào trên bản đồ ID {map_id}."

        nodes_info = []
        for node in nodes:
            aliases = [alias["name"] for alias in node.get("aliases", [])]
            alias_str = f" (Biệt danh: {', '.join(aliases)})" if aliases else ""
            landmark_str = " [Landmark]" if node.get("is_landmark") else ""
            nodes_info.append(f"Node #{node['id']}: ({node['x']}, {node['y']}){landmark_str}{alias_str}")

        return f"Các node trên bản đồ ID {map_id}:\n" + "\n".join(nodes_info)

    except Exception as e:
        return f"Lỗi khi lấy nodes của bản đồ {map_id}: {str(e)}"


def search_route_func(map_id: int, query: str, current_x: Optional[float] = None, current_y: Optional[float] = None) -> str:
    """Tìm đường đi dựa trên câu truy vấn."""
    try:
        payload = {"map_id": map_id, "q": query}
        if current_x is not None and current_y is not None:
            payload["cx"] = current_x
            payload["cy"] = current_y

        response = requests.post("http://127.0.0.1:8000/route", json=payload, headers={"Content-Type": "application/json"})
        response.raise_for_status()
        result = response.json()

        # Format instructions
        instructions = []
        for idx, ins in enumerate(result.get("instructions", []), 1):
            distance_m = ins.get("distance_px", 0) / 100  # Assuming 100px = 1m
            instructions.append(f"{idx}. {ins['text']} (~{distance_m:.1f}m)")

        # Format route info
        route_info = f"""
Tìm đường thành công!
Tổng độ dài: ~{result.get('length_px', 0) / 100:.1f}m
Hướng dẫn:
{chr(10).join(instructions)}

Tọa độ đường đi: {result.get('polyline', [])}
        """.strip()

        return route_info

    except Exception as e:
        return f"Lỗi khi tìm đường: {str(e)}"


def search_nodes_func(map_id: int, query: str) -> str:
    """Tìm kiếm node theo tên hoặc biệt danh."""
    try:
        response = requests.get(f"http://127.0.0.1:8000/nodes/search", params={"map_id": map_id, "q": query})
        response.raise_for_status()
        results = response.json()

        if not results:
            return f"Không tìm thấy node nào khớp với '{query}' trên bản đồ ID {map_id}."

        search_results = []
        for node in results:
            aliases = [alias["name"] for alias in node.get("matching_aliases", [])]
            alias_str = f" (Khớp với: {', '.join(aliases)})" if aliases else ""
            search_results.append(f"Node #{node['id']}: ({node['x']}, node['y']){alias_str}")

        return f"Kết quả tìm kiếm cho '{query}':\n" + "\n".join(search_results)

    except Exception as e:
        return f"Lỗi khi tìm kiếm node: {str(e)}"


def calculate_distance_func(x1: float, y1: float, x2: float, y2: float) -> str:
    """Tính khoảng cách giữa hai điểm."""
    distance_px = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    distance_m = distance_px / 100  # Assuming 100px = 1m
    return f"Khoảng cách: {distance_px:.1f}px (~{distance_m:.1f}m)"


# Create tools
get_maps: BaseTool = tool(get_maps_func)
get_maps.name = "GetMaps"

get_map_nodes: BaseTool = tool(get_map_nodes_func)
get_map_nodes.name = "GetMapNodes"

search_route: BaseTool = tool(search_route_func)
search_route.name = "SearchRoute"

search_nodes: BaseTool = tool(search_nodes_func)
search_nodes.name = "SearchNodes"

calculate_distance: BaseTool = tool(calculate_distance_func)
calculate_distance.name = "CalculateDistance"

# List of all map tools
map_tools = [get_maps, get_map_nodes, search_route, search_nodes, calculate_distance]
