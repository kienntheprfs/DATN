import pytest
from backend.models.entities import Node

def test_nodes_crud(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m = integration_client.post("/api/maps", data={"name": "M", "building_id": str(b["id"])}, files={"file": ("m.png", b"f", "image/png")}).json()
    
    # 1. Create
    resp = integration_client.post("/api/nodes", json={"map_id": m["id"], "name": "Node 1", "x": 10, "y": 20, "type": "room"})
    assert resp.status_code == 200
    n = resp.json()
    n_id = n["id"]
    
    # 2. Get
    resp = integration_client.get(f"/api/nodes/{n_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Node 1"
    
    # 3. Update
    resp = integration_client.patch(f"/api/nodes/{n_id}", json={"name": "Node 1 Updated", "x": 15})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Node 1 Updated"
    assert resp.json()["x"] == 15
    
    # 4. List by map
    resp = integration_client.get(f"/api/nodes?map_id={m['id']}")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    
    # 5. Delete
    resp = integration_client.delete(f"/api/nodes/{n_id}")
    assert resp.status_code == 200

def test_node_links(integration_client):
    b = integration_client.post("/api/buildings", json={"name": "B"}).json()
    m1 = integration_client.post("/api/maps", data={"name": "M1", "building_id": str(b["id"])}, files={"file": ("m1.png", b"f", "image/png")}).json()
    m2 = integration_client.post("/api/maps", data={"name": "M2", "building_id": str(b["id"])}, files={"file": ("m2.png", b"f", "image/png")}).json()
    
    n1 = integration_client.post("/api/nodes", json={"map_id": m1["id"], "name": "N1", "x": 0, "y": 0}).json()
    n2 = integration_client.post("/api/nodes", json={"map_id": m2["id"], "name": "N2", "x": 0, "y": 0}).json()
    
    # Link them
    resp = integration_client.patch(f"/api/nodes/{n1['id']}", json={"linked_node_ids": [n2["id"]]})
    assert resp.status_code == 200
    
    # Verify bi-directional link
    resp2 = integration_client.get(f"/api/nodes/{n2['id']}")
    assert n1["id"] in resp2.json()["linked_node_ids"]
