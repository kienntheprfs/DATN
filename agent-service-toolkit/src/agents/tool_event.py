from typing import Optional, Any
import json

import requests
from langchain_core.tools import tool


WAYFINDER_API = "http://127.0.0.1:8000"


def search_events_func(
    query: str,
    limit: int = 5,
) -> str:
    """Tìm kiếm sự kiện theo từ khóa. Trả về thông tin sự kiện bao gồm tên, thời gian, địa điểm và hướng dẫn đường đi nếu có."""
    try:
        # Search events
        response = requests.get(
            f"{WAYFINDER_API}/api/events/search",
            params={"q": query, "limit": limit},
            timeout=10,
        )
        response.raise_for_status()
        events = response.json()

        if not events:
            return f"Không tìm thấy sự kiện nào liên quan đến '{query}'."

        # Format response
        result_parts = []
        for idx, event in enumerate(events, 1):
            location_parts = []
            if event.get("location_name"):
                location_parts.append(event["location_name"])
            if event.get("building_name"):
                location_parts.append(event["building_name"])
            if event.get("floor_level") is not None:
                location_parts.append(f"Tầng {event['floor_level']}")

            location_str = " - ".join(location_parts) if location_parts else "Chưa có địa điểm"

            time_str = event.get("start_date", "")
            if event.get("start_time"):
                time_str += f" lúc {event['start_time']}"
            if event.get("end_time"):
                time_str += f" - {event['end_time']}"

            desc = event.get("description", "")
            desc_preview = desc[:100] + "..." if len(desc) > 100 else desc

            event_info = f"""{idx}. {event["name"]}
   📅 {time_str}
   📍 {location_str}
   👤 {event.get("organizer", "N/A")}
   📝 {desc_preview}"""

            if event.get("node_id"):
                event_info += f"\n   🗺️ Có thể chỉ đường đến đây!"

            result_parts.append(event_info)

        return f"""Tìm thấy {len(events)} sự kiện liên quan:

{chr(10).join(result_parts)}

Bạn có thể hỏi "chỉ đường đến sự kiện [tên]" để được hướng dẫn."""

    except requests.RequestException as e:
        return f"Lỗi tìm kiếm sự kiện: {str(e)}"


def get_upcoming_events_func(
    limit: int = 5,
) -> str:
    """Lấy danh sách các sự kiện sắp diễn ra."""
    try:
        response = requests.get(
            f"{WAYFINDER_API}/api/events/upcoming",
            params={"limit": limit},
            timeout=10,
        )
        response.raise_for_status()
        events = response.json()

        if not events:
            return "Hiện không có sự kiện nào sắp diễn ra."

        result_parts = []
        for idx, event in enumerate(events, 1):
            location_parts = []
            if event.get("location_name"):
                location_parts.append(event["location_name"])
            if event.get("building_name"):
                location_parts.append(event["building_name"])
            if event.get("floor_level") is not None:
                location_parts.append(f"Tầng {event['floor_level']}")

            location_str = " - ".join(location_parts) if location_parts else "Chưa có địa điểm"

            time_str = event.get("start_date", "")
            if event.get("start_time"):
                time_str += f" lúc {event['start_time']}"

            event_info = f"{idx}. {event['name']} - {time_str} @ {location_str}"
            result_parts.append(event_info)

        return f"""📅 Các sự kiện sắp diễn ra:

{chr(10).join(result_parts)}"""

    except requests.RequestException as e:
        return f"Lỗi lấy danh sách sự kiện: {str(e)}"


def get_event_detail_func(
    event_id: int,
) -> str:
    """Lấy thông tin chi tiết của một sự kiện theo ID."""
    try:
        response = requests.get(
            f"{WAYFINDER_API}/api/events/{event_id}",
            timeout=10,
        )
        response.raise_for_status()
        event = response.json()

        location_parts = []
        if event.get("location_name"):
            location_parts.append(event["location_name"])
        if event.get("building_name"):
            location_parts.append(event["building_name"])
        if event.get("floor_level") is not None:
            location_parts.append(f"Tầng {event['floor_level']}")

        location_str = " - ".join(location_parts) if location_parts else "Chưa có địa điểm"

        time_str = event.get("start_date", "")
        if event.get("start_time"):
            time_str += f" lúc {event['start_time']}"
        if event.get("end_time"):
            time_str += f" - {event['end_time']}"

        result = f"""📋 Chi tiết sự kiện: {event["name"]}

📅 Thời gian: {time_str}
📍 Địa điểm: {location_str}
👤 Ban tổ chức: {event.get("organizer", "N/A")}
📝 Mô tả: {event.get("description", "Không có mô tả")}"""

        if event.get("node_id"):
            result += "\n\n🗺️ Sự kiện này có vị trí trên bản đồ. Bạn có thể hỏi 'chỉ đường đến đây' để được hướng dẫn."

        return result

    except requests.RequestException as e:
        return f"Lỗi lấy thông tin sự kiện: {str(e)}"


search_events: Any = tool(search_events_func)
search_events.name = "SearchEvents"

get_upcoming_events: Any = tool(get_upcoming_events_func)
get_upcoming_events.name = "GetUpcomingEvents"

get_event_detail: Any = tool(get_event_detail_func)
get_event_detail.name = "GetEventDetail"

event_tools = [search_events, get_upcoming_events, get_event_detail]
