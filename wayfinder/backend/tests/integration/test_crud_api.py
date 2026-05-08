"""Integration tests for CRUD APIs (Buildings, Maps, Nodes, Edges, Aliases)."""

import pytest


def _building(client, name="Test Building"):
    return client.post("/api/buildings", json={"name": name}).json()


def _map(client, building_id=None, name="Tầng 1", floor=1, scale=1.0):
    data = {"name": name, "scale_ratio": str(scale), "floor_level": str(floor)}
    if building_id:
        data["building_id"] = str(building_id)
    return client.post(
        "/api/maps", data=data, files={"file": ("map.png", b"fake", "image/png")}
    ).json()


def _node(client, map_id, name="Node", x=0, y=0, aliases=None):
    payload = {"map_id": map_id, "name": name, "x": x, "y": y}
    if aliases:
        payload["aliases"] = aliases
    return client.post("/api/nodes", json=payload).json()


def _edge(client, start_id, end_id, edge_type="walk", polyline=None):
    payload = {"start_node_id": start_id, "end_node_id": end_id, "type": edge_type}
    if polyline:
        payload["polyline"] = polyline
    return client.post("/api/edges", json=payload).json()


class TestBuildingAPI:
    def test_create_building(self, integration_client):
        c = integration_client
        data = _building(c, "Tòa A4")
        assert data["name"] == "Tòa A4"
        assert "id" in data

    def test_get_buildings_empty(self, integration_client):
        assert integration_client.get("/api/buildings").json() == []

    def test_get_buildings(self, integration_client):
        c = integration_client
        _building(c, "A")
        _building(c, "B")
        assert len(c.get("/api/buildings").json()) == 2

    def test_get_building_by_id(self, integration_client):
        c = integration_client
        b = _building(c, "C6")
        resp = c.get(f"/api/buildings/{b['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "C6"

    def test_get_building_not_found(self, integration_client):
        assert integration_client.get("/api/buildings/9999").status_code == 404

    def test_update_building(self, integration_client):
        c = integration_client
        b = _building(c, "Old")
        resp = c.patch(
            f"/api/buildings/{b['id']}", json={"name": "New", "description": "Updated"}
        )
        assert resp.json()["name"] == "New"

    def test_delete_building(self, integration_client):
        c = integration_client
        b = _building(c, "DeleteMe")
        c.delete(f"/api/buildings/{b['id']}")
        assert c.get(f"/api/buildings/{b['id']}").status_code == 404


class TestMapAPI:
    def test_list_maps(self, integration_client):
        c = integration_client
        b = _building(c, "MapBld")
        _map(c, b["id"])
        assert len(c.get("/api/maps").json()) >= 1

    def test_get_map_by_id(self, integration_client):
        c = integration_client
        b = _building(c, "GetMapBld")
        m = _map(c, b["id"])
        assert c.get(f"/api/maps/{m['id']}").json()["name"] == "Tầng 1"

    def test_get_map_not_found(self, integration_client):
        assert integration_client.get("/api/maps/9999").status_code == 404

    def test_list_maps_by_building_id(self, integration_client):
        c = integration_client
        b = _building(c, "FilterBld")
        _map(c, b["id"])
        assert len(c.get(f"/api/maps?building_id={b['id']}").json()) >= 1

    def test_campus_maps(self, integration_client):
        c = integration_client
        _map(c, building_id=None, name="Campus")
        assert isinstance(c.get("/api/maps/campus").json(), list)


class TestNodeAPI:
    def _setup_map(self, c):
        b = _building(c, "NodeBld")
        return _map(c, b["id"])

    def test_create_node(self, integration_client):
        c = integration_client
        m = self._setup_map(c)
        n = _node(c, m["id"], "Phòng 201", 100, 200, ["Room 201"])
        assert n["name"] == "Phòng 201"
        assert n["x"] == 100
        assert len(n["aliases"]) == 1

    def test_create_node_invalid_map(self, integration_client):
        c = integration_client
        resp = c.post(
            "/api/nodes", json={"map_id": 9999, "name": "Bad", "x": 0, "y": 0}
        )
        assert resp.status_code == 404

    def test_list_nodes(self, integration_client):
        c = integration_client
        m = self._setup_map(c)
        _node(c, m["id"], "N1", 0, 0)
        _node(c, m["id"], "N2", 10, 10)
        assert len(c.get(f"/api/nodes?map_id={m['id']}").json()) >= 2

    def test_get_node_by_id(self, integration_client):
        c = integration_client
        m = self._setup_map(c)
        n = _node(c, m["id"], "GetMe", 5, 5)
        assert c.get(f"/api/nodes/{n['id']}").json()["name"] == "GetMe"

    def test_get_node_not_found(self, integration_client):
        assert integration_client.get("/api/nodes/9999").status_code == 404

    def test_update_node(self, integration_client):
        c = integration_client
        m = self._setup_map(c)
        n = _node(c, m["id"], "Old", 0, 0)
        resp = c.patch(f"/api/nodes/{n['id']}", json={"name": "New", "x": 50})
        assert resp.json()["name"] == "New"
        assert resp.json()["x"] == 50

    def test_delete_node(self, integration_client):
        c = integration_client
        m = self._setup_map(c)
        n = _node(c, m["id"], "DeleteMe", 0, 0)
        c.delete(f"/api/nodes/{n['id']}")
        assert c.get(f"/api/nodes/{n['id']}").status_code == 404


class TestEdgeAPI:
    def _setup_nodes(self, c):
        b = _building(c, "EdgeBld")
        m = _map(c, b["id"])
        n1 = _node(c, m["id"], "E1", 0, 0)
        n2 = _node(c, m["id"], "E2", 10, 10)
        return m, n1, n2

    def test_create_edge(self, integration_client):
        c = integration_client
        m, n1, n2 = self._setup_nodes(c)
        e = _edge(c, n1["id"], n2["id"])
        assert e["start_node_id"] == n1["id"]
        assert e["end_node_id"] == n2["id"]
        assert e["weight"] > 0

    def test_create_edge_same_node_fails(self, integration_client):
        c = integration_client
        _, n1, _ = self._setup_nodes(c)
        resp = c.post(
            "/api/edges", json={"start_node_id": n1["id"], "end_node_id": n1["id"]}
        )
        assert resp.status_code == 400

    def test_list_edges(self, integration_client):
        c = integration_client
        m, n1, n2 = self._setup_nodes(c)
        _edge(c, n1["id"], n2["id"])
        assert len(c.get(f"/api/edges?map_id={m['id']}").json()) >= 1

    def test_update_edge(self, integration_client):
        c = integration_client
        m, n1, n2 = self._setup_nodes(c)
        e = _edge(c, n1["id"], n2["id"])
        resp = c.patch(f"/api/edges/{e['id']}", json={"type": "stairs"})
        assert resp.json()["type"] == "stairs"

    def test_delete_edge(self, integration_client):
        c = integration_client
        m, n1, n2 = self._setup_nodes(c)
        e = _edge(c, n1["id"], n2["id"])
        resp = c.delete(f"/api/edges/{e['id']}")
        assert resp.status_code == 200


class TestAliasAPI:
    def _setup_node(self, c):
        b = _building(c, "AliasBld")
        m = _map(c, b["id"])
        return _node(c, m["id"], "AliasNode", 100, 100)

    def test_create_alias(self, integration_client):
        c = integration_client
        n = self._setup_node(c)
        resp = c.post("/api/aliases", json={"node_id": n["id"], "name": "Phòng Họp"})
        assert resp.json()["name"] == "Phòng Họp"

    def test_create_alias_invalid_node(self, integration_client):
        c = integration_client
        resp = c.post("/api/aliases", json={"node_id": 9999, "name": "Bad"})
        assert resp.status_code == 404

    def test_list_aliases(self, integration_client):
        c = integration_client
        n = self._setup_node(c)
        c.post("/api/aliases", json={"node_id": n["id"], "name": "A1"})
        c.post("/api/aliases", json={"node_id": n["id"], "name": "A2"})
        assert len(c.get(f"/api/aliases?node_id={n['id']}").json()) >= 2

    def test_search_alias(self, integration_client):
        c = integration_client
        n = self._setup_node(c)
        c.post("/api/aliases", json={"node_id": n["id"], "name": "Phòng Thư Viện"})
        assert len(c.get("/api/aliases/search?q=Thư+Viện").json()) > 0

    def test_search_alias_empty_query(self, integration_client):
        assert integration_client.get("/api/aliases/search?q=").json() == []

    def test_get_all_locations(self, integration_client):
        c = integration_client
        self._setup_node(c)
        assert len(c.get("/api/aliases/all").json()) > 0
