"""Extended unit tests for routing logic."""

import networkx as nx
import pytest


class TestDijkstraExtended:
    def test_basic_shortest_path(self):
        G = nx.Graph()
        G.add_node(1, name="A", pos=(0, 0))
        G.add_node(2, name="B", pos=(0, 5))
        G.add_node(3, name="C", pos=(10, 5))
        G.add_edge(1, 2, weight=5)
        G.add_edge(2, 3, weight=10)
        G.add_edge(1, 3, weight=20)
        path = nx.shortest_path(G, source=1, target=3, weight="weight")
        assert path == [1, 2, 3]
        total_dist = 0
        for i in range(len(path) - 1):
            total_dist += G[path[i]][path[i + 1]]["weight"]
        assert total_dist == 15

    def test_direct_path_shorter(self):
        G = nx.Graph()
        G.add_node(1)
        G.add_node(2)
        G.add_node(3)
        G.add_edge(1, 2, weight=10)
        G.add_edge(2, 3, weight=10)
        G.add_edge(1, 3, weight=5)
        path = nx.shortest_path(G, source=1, target=3, weight="weight")
        assert path == [1, 3]

    def test_same_source_and_target(self):
        G = nx.Graph()
        G.add_node(1)
        path = nx.shortest_path(G, source=1, target=1, weight="weight")
        assert path == [1]

    def test_no_path_exists(self):
        G = nx.Graph()
        G.add_node(1)
        G.add_node(2)
        with pytest.raises(nx.NetworkXNoPath):
            nx.shortest_path(G, source=1, target=2, weight="weight")

    def test_multiple_paths(self):
        G = nx.Graph()
        G.add_node(1)
        G.add_node(2)
        G.add_node(3)
        G.add_node(4)
        G.add_edge(1, 2, weight=1)
        G.add_edge(2, 4, weight=1)
        G.add_edge(1, 3, weight=1)
        G.add_edge(3, 4, weight=10)
        path = nx.shortest_path(G, source=1, target=4, weight="weight")
        assert path == [1, 2, 4]

    def test_path_with_node_attributes(self):
        G = nx.Graph()
        G.add_node(1, name="Start", floor=1, type="path")
        G.add_node(2, name="Middle", floor=1, type="stairs")
        G.add_node(3, name="End", floor=2, type="path")
        G.add_edge(1, 2, weight=5, type="walk")
        G.add_edge(2, 3, weight=50, type="stairs")
        path = nx.shortest_path(G, source=1, target=3, weight="weight")
        assert path == [1, 2, 3]
        assert G.nodes[1]["name"] == "Start"
        assert G.nodes[3]["floor"] == 2

    def test_graph_with_many_nodes(self):
        G = nx.Graph()
        for i in range(10):
            G.add_node(i)
        for i in range(9):
            G.add_edge(i, i + 1, weight=1)
        G.add_edge(0, 9, weight=100)
        path = nx.shortest_path(G, source=0, target=9, weight="weight")
        assert len(path) == 10
        assert path == list(range(10))

    def test_weight_calculation_from_path(self):
        G = nx.Graph()
        G.add_node(1)
        G.add_node(2)
        G.add_node(3)
        G.add_edge(1, 2, weight=3.5)
        G.add_edge(2, 3, weight=2.5)
        path = nx.shortest_path(G, source=1, target=3, weight="weight")
        total = sum(G[path[i]][path[i + 1]]["weight"] for i in range(len(path) - 1))
        assert total == 6.0
