# Wayfinder Service

## Tổng quan
Wayfinder Service là hệ thống định vị và dẫn đường nội thất (indoor navigation) cung cấp API để quản lý bản đồ, tòa nhà, và tính toán đường đi trong các không gian trong nhà. Service hỗ trợ tìm kiếm địa điểm, đề xuất tuyến đường, và quản lý dữ liệu địa lý không gian nội bộ.

## Công nghệ
- **FastAPI**: REST API framework
- **PostgreSQL**: Spatial database với PostGIS extension
- **PostGIS**: Spatial data processing
- **GeoPandas**: Geospatial data manipulation
- **NetworkX**: Graph algorithms cho routing
- **NLP**: Natural language processing cho location search

## Port và Endpoint
- **Service Port**: 8001
- **PostgreSQL**: 5434
- **Health Check**: `/health`
- **Static Files**: `/static/*`

## Architecture

### Core Components
1. **API Layer** (`backend/routers/`): REST endpoints
2. **Services** (`backend/services/`): Business logic (geo, nlp)
3. **Models** (`backend/models/`): Database entities
4. **Core** (`backend/core/`): Database và configuration
5. **Frontend** (`frontend-wayfinding/`): Web interface

### Database Schema
- **buildings**: Building information và metadata
- **nodes**: Location points (rooms, entrances, landmarks)
- **edges**: Connections between nodes
- **aliases**: Alternative names cho locations
- **routes**: Pre-computed routes
- **events**: Location-based events

## Features

### 1. Map Management
- Building floor plans
- Location points of interest
- Indoor navigation graphs
- Spatial data visualization

### 2. Navigation & Routing
- Shortest path algorithms
- Accessibility-aware routing
- Multi-floor navigation
- Real-time route updates

### 3. Location Search
- Natural language queries
- Fuzzy matching
- Category-based search
- Auto-complete suggestions

### 4. Event Management
- Location-based events
- Time-aware routing
- Crowd density considerations
- Dynamic obstruction handling

### 5. Analytics & Insights
- Traffic pattern analysis
- Popular destinations
- Navigation efficiency
- Usage statistics

## API Endpoints

### Map & Building Management
```
GET    /api/buildings           # List all buildings
POST   /api/buildings           # Create new building
GET    /api/buildings/{id}      # Get building details
PUT    /api/buildings/{id}      # Update building
DELETE /api/buildings/{id}      # Delete building
```

### Node & Location Management
```
GET    /api/nodes               # List all nodes
POST   /api/nodes               # Create new node
GET    /api/nodes/{id}          # Get node details
PUT    /api/nodes/{id}          # Update node
DELETE /api/nodes/{id}          # Delete node
```

### Navigation & Routing
```
GET    /api/routes              # Get route between points
POST   /api/routes              # Calculate custom route
GET    /api/routes/nearby       # Find nearby locations
GET    /api/routes/accessible  # Accessibility-aware routes
```

### Search & Discovery
```
GET    /api/maps/search         # Search locations
GET    /api/aliases             # Get location aliases
POST   /api/aliases             # Create alias
GET    /api/missing-locations   # Report missing locations
```

### Event Management
```
GET    /api/events              # List events
POST   /api/events              # Create event
GET    /api/events/{id}         # Get event details
PUT    /api/events/{id}         # Update event
```

### Admin & Analytics
```
GET    /api/admin/stats         # System statistics
POST   /api/admin/import        # Import map data
GET    /api/missing-routes      # Report routing issues
```

## Data Models

### Building Model
```python
class Building:
    id: UUID
    name: str
    description: str
    address: str
    floors: int
    total_area: float
    geo_boundary: Polygon  # PostGIS geometry
    created_at: datetime
    updated_at: datetime
```

### Node Model
```python
class Node:
    id: UUID
    building_id: UUID
    name: str
    node_type: NodeType  # ROOM, ENTRANCE, ELEVATOR, STAIRS, etc.
    floor: int
    coordinates: Point   # PostGIS geometry
    properties: dict     # Additional metadata
    is_accessible: bool
```

### Edge Model
```python
class Edge:
    id: UUID
    from_node_id: UUID
    to_node_id: UUID
    distance: float
    travel_time: float
    edge_type: EdgeType  # WALKWAY, ELEVATOR, STAIRS
    is_accessible: bool
    properties: dict
```

## Cấu hình chính

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/wayfinder

# PostGIS Configuration
POSTGIS_VERSION=3.3
SPATIAL_REF_SYS=4326

# Service Configuration
DEBUG=false
CORS_ORIGINS=["http://localhost:3000"]
STATIC_FILES_PATH=./data

# Routing Configuration
DEFAULT_ROUTING_ALGORITHM=dijkstra
MAX_WALKING_DISTANCE=500  # meters
ELEVATOR_SPEED=2.0       # m/s
STAIRS_SPEED=1.0         # m/s

# NLP Configuration
NLP_MODEL=en_core_web_sm
FUZZY_MATCH_THRESHOLD=0.8
MAX_SEARCH_RESULTS=10
```

### Database Setup
```sql
-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create spatial indexes
CREATE INDEX idx_nodes_coordinates ON nodes USING GIST (coordinates);
CREATE INDEX idx_buildings_boundary ON buildings USING GIST (geo_boundary);

-- Create performance indexes
CREATE INDEX idx_edges_from_node ON edges(from_node_id);
CREATE INDEX idx_edges_to_node ON edges(to_node_id);
CREATE INDEX idx_nodes_building_floor ON nodes(building_id, floor);
```

## Cách chạy

### Local Development
```bash
cd wayfinder

# Start PostgreSQL with PostGIS
docker run -d --name wayfinder-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=wayfinder \
  -p 5434:5432 \
  postgis/postgis:16-3.3

# Install Python dependencies
pip install -r requirements.txt

# Run database initialization
python backend/init_database.py

# Start FastAPI service
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8001
```

### With Docker Compose
```bash
cd wayfinder
docker-compose up -d
```

## Usage Examples

### Search Location
```python
import requests

# Natural language search
response = requests.get(
    'http://localhost:8001/api/maps/search',
    params={
        'query': 'conference room near elevator',
        'building_id': 'building-uuid',
        'limit': 5
    }
)

locations = response.json()
for location in locations:
    print(f"{location['name']} - Floor {location['floor']}")
```

### Calculate Route
```python
# Find route between two points
response = requests.get(
    'http://localhost:8001/api/routes',
    params={
        'from_node': 'entrance-uuid',
        'to_node': 'room-uuid',
        'accessible': True,  # Wheelchair accessible
        'avoid_elevator': False
    }
)

route = response.json()
print(f"Distance: {route['distance']}m")
print(f"Duration: {route['duration']}min")
print(f"Steps: {len(route['path'])}")
```

### Create Building
```python
# Add new building
building_data = {
    'name': 'Tech Hub Building',
    'description': 'Main technology building',
    'address': '123 Tech Street',
    'floors': 5,
    'total_area': 15000.0,
    'geo_boundary': {
        'type': 'Polygon',
        'coordinates': [[...]]  # GeoJSON coordinates
    }
}

response = requests.post(
    'http://localhost:8001/api/buildings',
    json=building_data
)
```

## Advanced Features

### 1. Multi-floor Navigation
- Floor transition algorithms
- Elevator wait time estimation
- Stairs vs elevator preferences
- 3D visualization support

### 2. Accessibility Features
- Wheelchair accessible routes
- Elevator-only navigation
- Ramp location mapping
- Accessibility metadata

### 3. Real-time Updates
- Dynamic obstruction handling
- Event-based routing adjustments
- Crowd density consideration
- Temporary closure management

### 4. Analytics & Intelligence
- Traffic pattern analysis
- Popular destination prediction
- Route optimization suggestions
- Usage heatmaps

## Spatial Operations

### Distance Calculations
```python
# Find nearby nodes within 50 meters
nearby_nodes = session.query(Node).filter(
    func.ST_DWithin(
        Node.coordinates,
        target_point,
        50  # meters
    )
).all()
```

### Path Finding
```python
# NetworkX-based routing
import networkx as nx

def find_shortest_path(graph, start, end, weight='distance'):
    return nx.shortest_path(
        graph,
        source=start,
        target=end,
        weight=weight
    )
```

### Geospatial Queries
```python
# Check if point is within building
is_inside = func.ST_Contains(
    Building.geo_boundary,
    user_location
)
```

## NLP Integration

### Location Name Processing
```python
# Fuzzy matching for location names
from fuzzywuzzy import fuzz

def match_location(query, locations):
    matches = []
    for location in locations:
        ratio = fuzz.ratio(query.lower(), location.name.lower())
        if ratio > 80:  # Threshold
            matches.append((location, ratio))
    return sorted(matches, key=lambda x: x[1], reverse=True)
```

### Query Understanding
```python
# Extract location intent from natural language
import spacy

nlp = spacy.load("en_core_web_sm")

def extract_entities(query):
    doc = nlp(query)
    entities = {
        'locations': [],
        'directions': [],
        'landmarks': []
    }
    
    for ent in doc.ents:
        if ent.label_ in ['FACILITY', 'GPE']:
            entities['locations'].append(ent.text)
        elif ent.label_ == 'LOC':
            entities['landmarks'].append(ent.text)
    
    return entities
```

## Performance Optimization

### Database Optimization
- Spatial indexing strategy
- Query optimization
- Connection pooling
- Materialized views

### Caching Strategy
- Route caching
- Search result caching
- Static asset caching
- Database query caching

### Algorithm Optimization
- Pre-computed routes
- Hierarchical pathfinding
- A* algorithm implementation
- Bidirectional search

## Testing

### Unit Tests
```bash
pytest tests/unit -v
```

### Integration Tests
```bash
pytest tests/integration -v
```

### Spatial Tests
```bash
pytest tests/spatial -v
```

## Monitoring & Analytics

### Performance Metrics
- Route calculation time
- Search response time
- Database query performance
- API response times

### Business Metrics
- Popular destinations
- Common search queries
- Navigation success rates
- User engagement patterns

## Troubleshooting

### Common Issues
1. **PostGIS Setup**: Verify extension installation
2. **Spatial Indexes**: Check GIST indexes are created
3. **Coordinate Systems**: Ensure consistent SRID usage
4. **Memory Usage**: Optimize large spatial queries

### Debug Commands
```bash
# Check PostGIS version
psql -d wayfinder -c "SELECT PostGIS_Version();"

# Verify spatial indexes
psql -d wayfinder -c "\d+ nodes"

# Test spatial query
psql -d wayfinder -c "SELECT COUNT(*) FROM nodes WHERE ST_IsValid(coordinates);"
```

## Integration Examples

### With Agent Service
```python
# Agent calls wayfinder for location-based responses
location_response = requests.get(
    'http://wayfinder:8001/api/maps/search',
    params={'query': user_location_query}
)
```

### With Frontend
```python
# Frontend fetches map data
map_data = requests.get(
    'http://wayfinder:8001/api/buildings/{building_id}',
    params={'include_nodes': True, 'include_edges': True}
)
```

## Future Enhancements

### Planned Features
- AR navigation support
- Indoor positioning integration
- Voice-guided navigation
- Real-time crowd tracking
- Predictive routing
- Multi-building navigation
- Mobile SDK

### Technology Improvements
- Machine learning for route optimization
- Computer vision for map updates
- IoT sensor integration
- 5G positioning support
