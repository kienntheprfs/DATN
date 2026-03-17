from typing import Optional, Any

import requests
from langchain_core.tools import tool


WAYFINDER_API = "http://127.0.0.1:8000/api"


def find_route_func(
    from_location: str,
    to_location: str,
) -> str:
    """Tìm đường đi từ địa điểm xuất phát đến địa điểm đến (đa tầng). Tự động tìm kiếm và xử lý nếu có nhiều kết quả."""
    try:
        # Search start location (all floors)
        start_response = requests.get(
            f"{WAYFINDER_API}/search",
            params={"q": from_location, "limit": 5},
            timeout=10,
        )
        start_response.raise_for_status()
        start_results = start_response.json()

        # Search end location (all floors)
        end_response = requests.get(
            f"{WAYFINDER_API}/search",
            params={"q": to_location, "limit": 5},
            timeout=10,
        )
        end_response.raise_for_status()
        end_results = end_response.json()

        # Validate results
        if not start_results:
            return f"Không tìm thấy địa điểm xuất phát '{from_location}'."

        if not end_results:
            return f"Không tìm thấy địa điểm đến '{to_location}'."

        # Get node_ids
        start_node_id = start_results[0]["node_id"]
        end_node_id = end_results[0]["node_id"]

        # Group by name to detect duplicates in different buildings
        def group_by_name(results):
            groups = {}
            for r in results:
                name = r["name"]
                if name not in groups:
                    groups[name] = []
                groups[name].append(r)
            return groups

        start_groups = group_by_name(start_results)
        end_groups = group_by_name(end_results)

        # Check if any name has multiple buildings
        def has_multi_building(groups):
            for name, items in groups.items():
                if len(items) > 1:
                    return True
            return False

        # If multiple matches in different buildings, ask for clarification
        if has_multi_building(start_groups) or has_multi_building(end_groups):
            start_opts = []
            for name, items in start_groups.items():
                if len(items) > 1:
                    for item in items:
                        location_info = []
                        if item.get("building_name"):
                            location_info.append(item["building_name"])
                        if item.get("floor"):
                            location_info.append(f"Tầng {item['floor']}")
                        location_str = " - ".join(location_info) if location_info else "Campus"
                        start_opts.append(f"- {name} ({location_str})")
                else:
                    start_opts.append(f"- {items[0]['name']}")

            end_opts = []
            for name, items in end_groups.items():
                if len(items) > 1:
                    for item in items:
                        location_info = []
                        if item.get("building_name"):
                            location_info.append(item["building_name"])
                        if item.get("floor"):
                            location_info.append(f"Tầng {item['floor']}")
                        location_str = " - ".join(location_info) if location_info else "Campus"
                        end_opts.append(f"- {name} ({location_str})")
                else:
                    end_opts.append(f"- {items[0]['name']}")

            confirm_msg = f"""Có nhiều địa điểm trùng tên ở các tòa/tầng khác nhau, vui lòng xác nhận:

Điểm xuất phát '{from_location}':
{chr(10).join(start_opts)}

Điểm đến '{to_location}':
{chr(10).join(end_opts)}

Hãy cho biết TÊN và VỊ TRÍ (ví dụ: "Tòa A3" hoặc "Nhà vệ sinh Tòa B4 Tầng 1")"""

            return confirm_msg

        # Find route (multi-floor)
        route_response = requests.get(
            f"{WAYFINDER_API}/find",
            params={"start_node_id": start_node_id, "end_node_id": end_node_id},
            timeout=30,
        )

        if route_response.status_code == 404:
            return f"Không tìm được đường từ '{start_results[0]['name']}' đến '{end_results[0]['name']}'."
        if route_response.status_code == 400:
            return f"Lỗi: {route_response.json().get('detail', 'Node không hợp lệ')}"

        route_response.raise_for_status()
        result = route_response.json()

        instructions = [f"{ins['step']}. {ins['text']}" for ins in result.get("instructions", [])]
        instructions_text = "\n".join(instructions)

        return f"""Tìm đường từ '{start_results[0]["name"]}' đến '{end_results[0]["name"]}'
Tổng khoảng cách: {result.get("total_distance_m", 0):.1f}m

Hướng dẫn:
{instructions_text}"""

    except requests.RequestException as e:
        return f"Lỗi tìm đường: {str(e)}"


find_route: Any = tool(find_route_func)
find_route.name = "FindRoute"

map_tools = [find_route]
