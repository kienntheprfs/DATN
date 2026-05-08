import pytest
import math
import os
from backend.models.entities import Map, Node, Edge, Alias
from sqlmodel import Session
from backend.routers.routes import _clear_graph_cache

@pytest.fixture(autouse=True)
def clear_cache():
    _clear_graph_cache()
    if os.path.exists("data/graph_cache.json"):
        os.remove("data/graph_cache.json")

def _setup_basic_data(client):
    b = client.post("/api/buildings", json={"name": "Test Building"}).json()
    m = client.post(
        "/api/maps", 
        data={"name": "Test Map", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])},
        files={"file": ("map.png", b"fake", "image/png")}
    ).json()
    n1 = client.post("/api/nodes", json={"map_id": m["id"], "name": "start_node", "x": 0, "y": 0}).json()
    n2 = client.post("/api/nodes", json={"map_id": m["id"], "name": "end_node", "x": 100, "y": 0}).json()
    # Add aliases for query search
    client.post("/api/aliases", json={"node_id": n1["id"], "name": "sanh a"})
    client.post("/api/aliases", json={"node_id": n2["id"], "name": "phong 101"})
    
    client.post("/api/edges", json={"start_node_id": n1["id"], "end_node_id": n2["id"], "type": "walk"})
    return n1["id"], n2["id"]

def test_find_route_basic(integration_client):
    n1_id, n2_id = _setup_basic_data(integration_client)
    response = integration_client.get(f"/api/find?start_node_id={n1_id}&end_node_id={n2_id}")
    assert response.status_code == 200

def test_route_by_query(integration_client):
    _setup_basic_data(integration_client)
    response = integration_client.get("/api/query?q=từ sanh a đến phong 101")
    assert response.status_code == 200

def test_route_with_polyline(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "Poly Bld"}).json()
    m = integration_client.post("/api/maps", data={"name": "M", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("m.png", b"f", "image/png")}).json()
    n1 = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "n1", "x": 0, "y": 0}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "n2", "x": 100, "y": 0}).json()
    integration_client.post("/api/edges", json={"start_node_id": n1["id"], "end_node_id": n2["id"], "type": "walk", "polyline": [[0,0], [50, 50], [100, 0]]})
    response = integration_client.get(f"/api/find?start_node_id={n1['id']}&end_node_id={n2['id']}")
    assert response.status_code == 200
    assert math.isclose(response.json()["total_distance_m"], 141.4, abs_tol=0.1)

def test_route_floor_change_stairs(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m1 = integration_client.post("/api/maps", data={"name": "F1", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("f1.png", b"f", "image/png")}).json()
    m2 = integration_client.post("/api/maps", data={"name": "F2", "scale_ratio": "1.0", "floor_level": "2", "building_id": str(b["id"])}, files={"file": ("f2.png", b"f", "image/png")}).json()
    n0 = integration_client.post("/api/nodes", json={"map_id": m1["id"], "name": "s", "x": -10, "y": 0}).json()
    n1 = integration_client.post("/api/nodes", json={"map_id": m1["id"], "name": "stairs f1", "x": 0, "y": 0, "type": "stairs"}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m2["id"], "name": "stairs f2", "x": 0, "y": 0, "type": "stairs"}).json()
    n3 = integration_client.post("/api/nodes", json={"map_id": m2["id"], "name": "e", "x": 10, "y": 0}).json()
    integration_client.post("/api/edges", json={"start_node_id": n0["id"], "end_node_id": n1["id"]})
    integration_client.patch(f"/api/nodes/{n1['id']}", json={"linked_node_ids": [n2["id"]]})
    integration_client.post("/api/edges", json={"start_node_id": n2["id"], "end_node_id": n3["id"]})
    response = integration_client.get(f"/api/find?start_node_id={n0['id']}&end_node_id={n3['id']}")
    found = False
    for instr in response.json()["instructions"]:
        if "cầu thang" in instr["text"].lower() and "tầng 2" in instr["text"].lower():
            found = True
    assert found

def test_route_entrance_exit(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    # Campus map with floor_level=None
    m_campus = integration_client.post("/api/maps", data={"name": "Campus", "scale_ratio": "1.0"}, files={"file": ("c.png", b"f", "image/png")}).json()
    m_f1 = integration_client.post("/api/maps", data={"name": "F1", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("f1.png", b"f", "image/png")}).json()
    
    n_campus = integration_client.post("/api/nodes", json={"map_id": m_campus["id"], "name": "outside", "x": 0, "y": 0}).json()
    n_entrance = integration_client.post("/api/nodes", json={"map_id": m_f1["id"], "name": "entrance", "x": 10, "y": 0, "type": "entrance"}).json()
    n_inside = integration_client.post("/api/nodes", json={"map_id": m_f1["id"], "name": "room 1", "x": 20, "y": 0}).json()
    
    integration_client.patch(f"/api/nodes/{n_entrance['id']}", json={"linked_campus_node_id": n_campus["id"]})
    integration_client.post("/api/edges", json={"start_node_id": n_entrance["id"], "end_node_id": n_inside["id"]})
    
    _clear_graph_cache()
    
    # Building to campus (EXIT)
    resp = integration_client.get(f"/api/find?start_node_id={n_inside['id']}&end_node_id={n_campus['id']}")
    assert resp.status_code == 200
    instr_texts = [i["text"].lower() for i in resp.json()["instructions"]]
    # Should contain "ra khỏi tòa nhà" (line 439) or "ra ..." (line 424)
    assert any("ra" in t for t in instr_texts)

def test_various_turns(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m = integration_client.post("/api/maps", data={"name": "M", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("m.png", b"f", "image/png")}).json()
    
    n_start = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "s", "x": 0, "y": 0}).json()
    n_pivot = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "p", "x": 100, "y": 0}).json()
    n_left = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "l", "x": 100, "y": -50}).json()
    n_slight_right = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "sr", "x": 150, "y": 20}).json()

    integration_client.post("/api/edges", json={"start_node_id": n_start["id"], "end_node_id": n_pivot["id"]})
    integration_client.post("/api/edges", json={"start_node_id": n_pivot["id"], "end_node_id": n_left["id"]})
    integration_client.post("/api/edges", json={"start_node_id": n_pivot["id"], "end_node_id": n_slight_right["id"]})

    resp = integration_client.get(f"/api/find?start_node_id={n_start['id']}&end_node_id={n_left['id']}")
    assert "Rẽ trái" in resp.json()["instructions"][1]["text"]
    
    resp = integration_client.get(f"/api/find?start_node_id={n_start['id']}&end_node_id={n_slight_right['id']}")
    assert "chếch phải" in resp.json()["instructions"][1]["text"]

def test_query_ambiguity(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m1 = integration_client.post("/api/maps", data={"name": "F1", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("f1.png", b"f", "image/png")}).json()
    m2 = integration_client.post("/api/maps", data={"name": "F2", "floor_level": "2", "building_id": str(b["id"])}, files={"file": ("f2.png", b"f", "image/png")}).json()
    
    n1 = integration_client.post("/api/nodes", json={"map_id": m1["id"], "name": "node1", "x": 0, "y": 0}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m2["id"], "name": "node2", "x": 0, "y": 0}).json()
    
    # Add SAME alias to both
    integration_client.post("/api/aliases", json={"node_id": n1["id"], "name": "p101"})
    integration_client.post("/api/aliases", json={"node_id": n2["id"], "name": "p101"})
    
    _clear_graph_cache()
    
    response = integration_client.get(f"/api/query?q=đến p101&map_id={m1['id']}&cx=0&cy=10")
    assert response.status_code == 400
    assert "nhiều" in response.json()["detail"].lower()

def test_refresh_cache_endpoint(integration_client):
    # Setup data FIRST to avoid 404 in build_graph
    _setup_basic_data(integration_client)
    resp = integration_client.post("/api/refresh-cache")
    assert resp.status_code == 200

def test_route_not_found(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m = integration_client.post("/api/maps", data={"name": "M", "scale_ratio": "1.0", "floor_level": "1", "building_id": str(b["id"])}, files={"file": ("m.png", b"f", "image/png")}).json()
    n1 = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "n1", "x": 0, "y": 0}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "n2", "x": 100, "y": 100}).json()
    response = integration_client.get(f"/api/find?start_node_id={n1['id']}&end_node_id={n2['id']}")
    assert response.status_code == 404
