import streamlit as st
import requests
import json
from typing import Optional, List, Dict, Any


def render_map_interface():
    """Render the map interface in Streamlit sidebar"""

    st.sidebar.markdown("---")
    st.sidebar.subheader("🗺️ Bản đồ & Chỉ đường")

    # Map selection
    try:
        response = requests.get("http://127.0.0.1:8000/maps")
        if response.status_code == 200:
            maps_data = response.json()
            if maps_data.get("items"):
                map_options = {f"{m['name']} (ID: {m['id']})": m["id"] for m in maps_data["items"]}
                selected_map_name = st.sidebar.selectbox(
                    "Chọn bản đồ:", options=list(map_options.keys()), key="map_selector"
                )

                if selected_map_name:
                    selected_map_id = map_options[selected_map_name]
                    st.session_state.selected_map_id = selected_map_id

                    # Display map info
                    map_info = next(m for m in maps_data["items"] if m["id"] == selected_map_id)
                    st.sidebar.info(f"Kích thước: {map_info['width']}x{map_info['height']}px")

                    # Show map image
                    if st.sidebar.button("Hiển thị bản đồ"):
                        show_map_image(selected_map_id)

                    # Route search
                    st.sidebar.subheader("🔍 Tìm đường")
                    route_query = st.sidebar.text_input(
                        "Nhập địa điểm cần tìm:",
                        key="route_query",
                        placeholder="VD: 'đến thư viện', 'tìm canteen'",
                    )

                    # Current position (optional)
                    use_current_pos = st.sidebar.checkbox("Sử dụng vị trí hiện tại")
                    if use_current_pos:
                        col1, col2 = st.sidebar.columns(2)
                        current_x = col1.number_input("X:", value=0.0, key="current_x")
                        current_y = col2.number_input("Y:", value=0.0, key="current_y")
                    else:
                        current_x = current_y = None

                    if st.sidebar.button("Tìm đường", key="search_route"):
                        if route_query:
                            search_and_display_route(
                                selected_map_id, route_query, current_x, current_y
                            )
                        else:
                            st.sidebar.warning("Vui lòng nhập địa điểm cần tìm")
            else:
                st.sidebar.warning("Không có bản đồ nào có sẵn")
        else:
            st.sidebar.error("Không thể kết nối đến dịch vụ bản đồ")
    except Exception as e:
        st.sidebar.error(f"Lỗi: {str(e)}")


def show_map_image(map_id: int):
    """Display the map image in main area"""
    try:
        # Get map info
        response = requests.get(f"http://127.0.0.1:8000/maps/{map_id}")
        if response.status_code == 200:
            map_info = response.json()

            # Display map image
            image_url = f"http://127.0.0.1:8000{map_info['image_url']}"
            st.image(image_url, caption=f"Bản đồ: {map_info['name']}", use_column_width=True)

            # Get and display nodes
            nodes_response = requests.get(f"http://127.0.0.1:8000/nodes/map/{map_id}/with-aliases")
            if nodes_response.status_code == 200:
                nodes = nodes_response.json()

                if nodes:
                    st.subheader("📍 Các điểm trên bản đồ")

                    # Create searchable node list
                    node_data = []
                    for node in nodes:
                        aliases = [alias["name"] for alias in node.get("aliases", [])]
                        landmark = "🏛️" if node.get("is_landmark") else "📍"
                        node_info = {
                            "id": node["id"],
                            "x": node["x"],
                            "y": node["y"],
                            "name": f"{landmark} Node #{node['id']}",
                            "aliases": aliases,
                            "is_landmark": node.get("is_landmark", False),
                        }
                        node_data.append(node_info)

                    # Display nodes in expandable format
                    for node in node_data:
                        with st.expander(f"{node['name']} ({node['x']}, {node['y']})"):
                            if node["aliases"]:
                                st.write("**Biệt danh:**")
                                for alias in node["aliases"]:
                                    st.write(f"• {alias}")
                            else:
                                st.write("_Không có biệt danh_")

                            # Quick route buttons
                            if st.button(f"Tìm đường đến đây", key=f"route_to_{node['id']}"):
                                query = f"đến node {node['id']}"
                                if node["aliases"]:
                                    query = f"đến {node['aliases'][0]}"
                                search_and_display_route(map_id, query)
                else:
                    st.info("Không có điểm nào trên bản đồ này")
    except Exception as e:
        st.error(f"Lỗi khi hiển thị bản đồ: {str(e)}")


def search_and_display_route(
    map_id: int, query: str, current_x: Optional[float] = None, current_y: Optional[float] = None
):
    """Search for route and display results"""
    try:
        payload = {"map_id": map_id, "q": query}
        if current_x is not None and current_y is not None:
            payload["cx"] = current_x
            payload["cy"] = current_y

        response = requests.post(
            "http://127.0.0.1:8000/route",
            json=payload,
            headers={"Content-Type": "application/json"},
        )

        if response.status_code == 200:
            result = response.json()
            display_route_results(result, query)
        else:
            st.error(f"Không tìm được đường: {response.text}")

            # Try to provide suggestions
            try:
                search_response = requests.get(
                    f"http://127.0.0.1:8000/nodes/search", params={"map_id": map_id, "q": query}
                )
                if search_response.status_code == 200:
                    suggestions = search_response.json()
                    if suggestions:
                        st.subheader("💡 Gợi ý:")
                        for suggestion in suggestions[:5]:
                            aliases = [
                                alias["name"] for alias in suggestion.get("matching_aliases", [])
                            ]
                            if aliases:
                                st.write(f"• Thử tìm: **{aliases[0]}**")
            except:
                pass

    except Exception as e:
        st.error(f"Lỗi khi tìm đường: {str(e)}")


def display_route_results(route_data: Dict[str, Any], query: str):
    """Display route search results"""

    st.success(f"✅ Tìm đường thành công cho: '{query}'")

    # Route summary
    col1, col2 = st.columns(2)
    with col1:
        st.metric("Tổng độ dài", f"~{route_data.get('length_px', 0) / 100:.1f}m")
    with col2:
        st.metric("Số bước", len(route_data.get("instructions", [])))

    # Instructions
    if route_data.get("instructions"):
        st.subheader("🗺️ Hướng dẫn chi tiết")

        for idx, instruction in enumerate(route_data["instructions"], 1):
            distance_m = instruction.get("distance_px", 0) / 100

            # Create instruction card
            with st.container():
                col1, col2 = st.columns([1, 5])
                with col1:
                    st.markdown(f"### {idx}")
                with col2:
                    st.write(instruction["text"])
                    st.caption(
                        f"Khoảng cách: ~{distance_m:.1f}m | Loại: {instruction.get('kind', 'N/A')}"
                    )

                st.divider()

    # Route visualization (if we have polyline)
    if route_data.get("polyline"):
        st.subheader("📍 Tọa độ đường đi")
        polyline = route_data["polyline"]

        # Display as JSON
        with st.expander("Xem tọa độ chi tiết"):
            st.json(polyline)

        # Simple statistics
        if isinstance(polyline, list) and len(polyline) > 0:
            st.info(
                f"Đường đi có {len(polyline)} điểm, từ ({polyline[0][0]}, {polyline[0][1]}) đến ({polyline[-1][0]}, {polyline[-1][1]})"
            )


def add_map_tools_to_agent():
    """Add map-related tools to the agent interface"""

    # This function can be called to integrate map tools with existing agents
    if "map_tools_enabled" not in st.session_state:
        st.session_state.map_tools_enabled = True

    # Add map tools info to sidebar
    st.sidebar.markdown("---")
    st.sidebar.subheader("🛠️ Công cụ bản đồ")
    st.sidebar.info("Các công cụ bản đồ đã được tích hợp:")
    st.sidebar.write("• GetMaps - Lấy danh sách bản đồ")
    st.sidebar.write("• GetMapNodes - Lấy các điểm trên bản đồ")
    st.sidebar.write("• SearchRoute - Tìm đường đi")
    st.sidebar.write("• SearchNodes - Tìm kiếm điểm")
    st.sidebar.write("• CalculateDistance - Tính khoảng cách")
