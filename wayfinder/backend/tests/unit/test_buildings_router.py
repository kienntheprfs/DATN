import pytest
from backend.models.entities import Building

def test_buildings_crud(integration_client):
    # 1. Create
    resp = integration_client.post("/api/buildings", json={"name": "Building A", "description": "Main Building"})
    assert resp.status_code == 200
    b = resp.json()
    assert b["name"] == "Building A"
    b_id = b["id"]
    
    # 2. List
    resp = integration_client.get("/api/buildings")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    
    # 3. Get
    resp = integration_client.get(f"/api/buildings/{b_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Building A"
    
    # 4. Update
    resp = integration_client.patch(f"/api/buildings/{b_id}", json={"name": "Building A Updated"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Building A Updated"
    
    # 5. Delete
    resp = integration_client.delete(f"/api/buildings/{b_id}")
    assert resp.status_code == 200
    
    # Verify
    resp = integration_client.get(f"/api/buildings/{b_id}")
    assert resp.status_code == 404
