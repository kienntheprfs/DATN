import pytest
from backend.models.entities import Building, Map, Node, Edge

def test_maps_crud_extended(integration_client):
    # 1. Setup
    b = integration_client.post("/api/buildings", json={"name": "B1"}).json()
    b_id = b["id"]
    
    # 2. Campus Map (no building_id)
    m_campus = integration_client.post(
        "/api/maps",
        data={"name": "Campus Map", "scale_ratio": "1.0"},
        files={"file": ("campus.png", b"fake", "image/png")}
    ).json()
    
    # 3. Building Map
    m_f1 = integration_client.post(
        "/api/maps",
        data={"name": "Floor 1", "building_id": str(b_id), "floor_level": "1"},
        files={"file": ("f1.png", b"fake", "image/png")}
    ).json()
    
    # 4. Test GET /campus
    resp = integration_client.get("/api/maps/campus")
    assert resp.status_code == 200
    campus_ids = [m["id"] for m in resp.json()]
    assert m_campus["id"] in campus_ids
    assert m_f1["id"] not in campus_ids
    
    # 5. Test Filter by building_id
    resp = integration_client.get(f"/api/maps?building_id={b_id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["id"] == m_f1["id"]
    
    # 6. Test scale_ratio update (triggers weight recalculation)
    # Create a node and edge first
    n1 = integration_client.post("/api/nodes", json={"map_id": m_f1["id"], "name": "n1", "x": 0, "y": 0}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m_f1["id"], "name": "n2", "x": 10, "y": 0}).json()
    integration_client.post("/api/edges", json={"start_node_id": n1["id"], "end_node_id": n2["id"], "type": "walk"})
    
    resp = integration_client.patch(f"/api/maps/{m_f1['id']}", json={"scale_ratio": 2.0})
    assert resp.status_code == 200
    assert resp.json()["scale_ratio"] == 2.0

    # 7. Test delete map with related data
    resp = integration_client.delete(f"/api/maps/{m_f1['id']}")
    assert resp.status_code == 200
    
    # 8. Test Errors
    # Wrong content type
    resp = integration_client.post(
        "/api/maps",
        data={"name": "Bad"},
        files={"file": ("test.txt", b"text", "text/plain")}
    )
    assert resp.status_code == 400
    
    # Non-existent building
    resp = integration_client.post(
        "/api/maps",
        data={"name": "Map", "building_id": "999"},
        files={"file": ("map.png", b"f", "image/png")}
    )
    assert resp.status_code == 404
