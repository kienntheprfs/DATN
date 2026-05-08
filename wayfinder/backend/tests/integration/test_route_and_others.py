"""Integration tests for route finding, admin, events, missing_locations, missing_routes, and locations APIs."""

import pytest


def _building(c, name="B"):
    return c.post("/api/buildings", json={"name": name}).json()


def _map(c, building_id=None, name="Floor", floor=1, scale=0.1):
    data = {"name": name, "scale_ratio": str(scale), "floor_level": str(floor)}
    if building_id:
        data["building_id"] = str(building_id)
    return c.post(
        "/api/maps", data=data, files={"file": ("m.png", b"x", "image/png")}
    ).json()


def _node(c, map_id, name="N", x=0, y=0, aliases=None):
    p = {"map_id": map_id, "name": name, "x": x, "y": y}
    if aliases:
        p["aliases"] = aliases
    return c.post("/api/nodes", json=p).json()


def _edge(c, s, e, t="walk"):
    return c.post(
        "/api/edges", json={"start_node_id": s, "end_node_id": e, "type": t}
    ).json()


def _full_setup(c):
    b = _building(c, "RouteB")
    m = _map(c, b["id"])
    n1 = _node(c, m["id"], "Start", 0, 0)
    n2 = _node(c, m["id"], "Mid", 10, 0)
    n3 = _node(c, m["id"], "End", 20, 0)
    _edge(c, n1["id"], n2["id"])
    _edge(c, n2["id"], n3["id"])
    _edge(c, n1["id"], n3["id"])
    return {"map": m, "nodes": [n1, n2, n3]}


class TestRouteFindAPI:
    def test_find_route(self, integration_client):
        c = integration_client
        s = _full_setup(c)
        n1, _, n3 = s["nodes"]
        r = c.get(
            "/api/find", params={"start_node_id": n1["id"], "end_node_id": n3["id"]}
        )
        assert r.status_code == 200
        d = r.json()
        assert "path_coords" in d and "instructions" in d and len(d["instructions"]) > 0

    def test_find_route_invalid_start(self, integration_client):
        c = integration_client
        _full_setup(c)
        assert (
            c.get(
                "/api/find", params={"start_node_id": 9999, "end_node_id": 1}
            ).status_code
            == 400
        )

    def test_find_route_no_path(self, integration_client):
        c = integration_client
        b = _building(c, "NPB")
        m = _map(c, b["id"])
        n1 = _node(c, m["id"], "A", 0, 0)
        n2 = _node(c, m["id"], "B", 10, 10)
        assert (
            c.get(
                "/api/find", params={"start_node_id": n1["id"], "end_node_id": n2["id"]}
            ).status_code
            == 404
        )

    def test_find_route_start_action(self, integration_client):
        c = integration_client
        s = _full_setup(c)
        n1, _, n3 = s["nodes"]
        r = c.get(
            "/api/find", params={"start_node_id": n1["id"], "end_node_id": n3["id"]}
        )
        assert r.json()["instructions"][0]["action"] == "start"

    def test_find_route_end_action(self, integration_client):
        c = integration_client
        s = _full_setup(c)
        n1, _, n3 = s["nodes"]
        r = c.get(
            "/api/find", params={"start_node_id": n1["id"], "end_node_id": n3["id"]}
        )
        assert r.json()["instructions"][-1]["action"] == "arrive"


class TestRouteQueryAPI:
    def test_query_route(self, integration_client):
        c = integration_client
        s = _full_setup(c)
        m_id = s["map"]["id"]
        c.post("/api/aliases", json={"node_id": s["nodes"][0]["id"], "name": "Sảnh A"})
        c.post(
            "/api/aliases", json={"node_id": s["nodes"][2]["id"], "name": "Thư viện"}
        )
        r = c.get("/api/query", params={"map_id": m_id, "q": "từ Sảnh A đến Thư viện"})
        assert r.status_code == 200

    def test_query_not_found(self, integration_client):
        c = integration_client
        _full_setup(c)
        assert (
            c.get(
                "/api/query", params={"q": "từ xyz không tồn tại đến abc"}
            ).status_code
            == 400
        )


class TestRouteCacheAPI:
    def test_refresh_cache(self, integration_client):
        c = integration_client
        _full_setup(c)
        r = c.post("/api/refresh-cache")
        assert r.status_code == 200
        assert r.json()["node_count"] > 0

    def test_refresh_cache_empty(self, integration_client):
        c = integration_client
        assert c.post("/api/refresh-cache").status_code == 200


class TestAdminAPI:
    def test_clear_map_data_not_found(self, integration_client):
        c = integration_client
        assert c.post("/api/admin/clear-map", json={"map_id": 9999}).status_code == 404

    def test_get_full_map_details_not_found(self, integration_client):
        c = integration_client
        assert c.get("/api/admin/9999/full").status_code == 404

    def test_get_full_map_details(self, integration_client):
        c = integration_client
        b = _building(c, "AdminB")
        m = _map(c, b["id"])
        _node(c, m["id"], "AN", 0, 0)
        r = c.get(f"/api/admin/{m['id']}/full")
        assert r.status_code == 200
        d = r.json()
        assert "id" in d and "nodes" in d and "edges" in d


class TestEventsAPI:
    def test_create_event(self, integration_client):
        c = integration_client
        r = c.post(
            "/api/events", json={"name": "Hội thảo AI", "start_date": "2026-06-01"}
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Hội thảo AI"

    def test_list_events(self, integration_client):
        c = integration_client
        c.post("/api/events", json={"name": "E1", "start_date": "2026-06-01"})
        c.post("/api/events", json={"name": "E2", "start_date": "2026-06-02"})
        assert len(c.get("/api/events").json()) >= 2

    def test_search_events(self, integration_client):
        c = integration_client
        c.post(
            "/api/events",
            json={"name": "Hội thảo Machine Learning", "start_date": "2026-06-01"},
        )
        r = c.get("/api/events/search?q=Machine+Learning")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_get_event_not_found(self, integration_client):
        c = integration_client
        assert c.get("/api/events/9999").status_code == 404

    def test_upcoming_events(self, integration_client):
        c = integration_client
        assert c.get("/api/events/upcoming").status_code == 200

    def test_list_all_events(self, integration_client):
        c = integration_client
        c.post("/api/events", json={"name": "Full", "start_date": "2026-07-01"})
        assert len(c.get("/api/events/all").json()) > 0


class TestMissingLocationsAPI:
    def test_create(self, integration_client):
        c = integration_client
        r = c.post(
            "/api/missing-locations", json={"name": "Phòng mới", "building_name": "A4"}
        )
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_list(self, integration_client):
        c = integration_client
        c.post("/api/missing-locations", json={"name": "L1"})
        assert len(c.get("/api/missing-locations").json()) > 0

    def test_stats(self, integration_client):
        c = integration_client
        c.post("/api/missing-locations", json={"name": "S"})
        r = c.get("/api/missing-locations/stats")
        assert r.status_code == 200
        assert "total" in r.json()

    def test_get_not_found(self, integration_client):
        c = integration_client
        assert c.get("/api/missing-locations/9999").status_code == 404

    def test_update(self, integration_client):
        c = integration_client
        r = c.post("/api/missing-locations", json={"name": "U"})
        uid = r.json()["id"]
        r = c.patch(
            f"/api/missing-locations/{uid}",
            json={"name": "Updated", "status": "approved"},
        )
        assert r.json()["name"] == "Updated"


class TestMissingRoutesAPI:
    def test_create(self, integration_client):
        c = integration_client
        r = c.post("/api/missing-routes", json={"start_name": "A", "end_name": "B"})
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_list(self, integration_client):
        c = integration_client
        c.post("/api/missing-routes", json={"start_name": "A", "end_name": "B"})
        assert len(c.get("/api/missing-routes").json()) > 0

    def test_stats(self, integration_client):
        c = integration_client
        c.post("/api/missing-routes", json={"start_name": "SA", "end_name": "SB"})
        r = c.get("/api/missing-routes/stats")
        assert r.status_code == 200
        assert "total" in r.json()

    def test_get_not_found(self, integration_client):
        c = integration_client
        assert c.get("/api/missing-routes/9999").status_code == 404


class TestLocationsAPI:
    def test_landmarks_empty(self, integration_client):
        c = integration_client
        assert c.get("/api/locations/landmarks").json() == []

    def test_guess_empty(self, integration_client):
        c = integration_client
        assert c.get("/api/locations/guess", params={"query": "test"}).json() == []


class TestHealthAPI:
    def test_health(self, integration_client):
        c = integration_client
        r = c.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
