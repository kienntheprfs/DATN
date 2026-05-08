import networkx as nx
import pytest

def test_dijkstra_logic():
    # TC-UNIT-02: Kiểm tra logic tính toán đường đi ngắn nhất
    G = nx.Graph()
    # Thêm nodes
    G.add_node(1, name="A", pos=(0, 0))
    G.add_node(2, name="B", pos=(0, 5))
    G.add_node(3, name="C", pos=(10, 5))
    
    # Thêm edges với trọng số (weight = distance)
    G.add_edge(1, 2, weight=5)
    G.add_edge(2, 3, weight=10)
    G.add_edge(1, 3, weight=20) # Đường trực tiếp dài hơn
    
    # Tìm đường từ 1 đến 3
    path = nx.shortest_path(G, source=1, target=3, weight="weight")
    
    assert path == [1, 2, 3]
    
    # Tính tổng quãng đường
    total_dist = 0
    for i in range(len(path)-1):
        total_dist += G[path[i]][path[i+1]]['weight']
    
    assert total_dist == 15
