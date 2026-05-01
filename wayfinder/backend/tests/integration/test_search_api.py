import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.db import get_session
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool
from backend.models.entities import Building, Map, Node, Alias

# Setup isolated test DB
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

def override_get_session():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = override_get_session
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Seed data for TC-INT-01
        b1 = Building(name="Tòa A4")
        session.add(b1)
        session.commit()
        session.refresh(b1)
        
        m1 = Map(name="Tầng 1 A4", building_id=b1.id, floor_level=1, image_url="http://test.com/map.png")
        session.add(m1)
        session.commit()
        session.refresh(m1)
        
        n1 = Node(name="Phòng 201", map_id=m1.id, x=100, y=100)
        session.add(n1)
        session.commit()
        
        a1 = Alias(name="Phòng 201", node_id=n1.id)
        session.add(a1)
        session.commit()
    yield
    SQLModel.metadata.drop_all(engine)

def test_search_alias_api():
    # TC-INT-01: Tìm kiếm Alias & Building
    response = client.get("/api/aliases/search?q=Phòng 201")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert data[0]["name"] == "Phòng 201"
    assert "Tòa A4" in data[0]["building_name"]
