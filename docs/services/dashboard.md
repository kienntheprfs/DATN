# Dashboard Service

## Tổng quan
Dashboard Service cung cấp API cho các tính năng quản trị và phân tích hệ thống. Service tập trung vào việc thu thập feedback từ người dùng, phân tích chất lượng AI responses, và cung cấp analytics data cho admin dashboard.

## Công nghệ
- **FastAPI**: REST API framework
- **PostgreSQL**: Database cho analytics và ratings
- **Alembic**: Database migrations
- **UV**: Package manager
- **Pydantic**: Data validation

## Port và Endpoint
- **Service Port**: 8010
- **Health Check**: `/health`
- **API Base**: `http://localhost:8010`

## Architecture

### Core Components
1. **API Layer** (`src/api/`): REST endpoints cho ratings và analytics
2. **Services** (`src/services/`): Business logic cho rating và analytics
3. **Repositories** (`src/repositories/`): Data access layer
4. **Models** (`src/models/`): Database models
5. **Core** (`src/core/`): Configuration và database setup

### Database Schema (dashboard schema)
- **ratings**: User feedback trên AI responses
- **analytics**: System metrics và KPIs
- **user_sessions**: User interaction tracking

## Features

### 1. Answer Rating System
- Like/Dislike feedback
- Comment system cho detailed feedback
- Thread-based grouping
- Agent-specific analytics

### 2. User Analytics
- Session tracking
- Interaction patterns
- Satisfaction metrics
- Usage statistics

### 3. Admin Analytics
- Agent performance metrics
- Quality trend analysis
- User satisfaction scores
- System health monitoring

### 4. Trust Boundary Architecture
- Trusted headers từ API Gateway
- Role-based access control
- User identity verification

## API Endpoints

### Rating Management
```
POST   /ratings                    # Create/update rating
DELETE /ratings/{rating_id}        # Delete rating
GET    /ratings/thread/{thread_id} # Get ratings by thread
GET    /ratings/user/{user_id}     # Get user ratings
```

### Analytics & Statistics
```
GET    /ratings/stats/agent/{agent_id}    # Agent performance stats
GET    /ratings/stats/global              # Global statistics
GET    /analytics/satisfaction            # Satisfaction trends
GET    /analytics/usage                    # Usage analytics
```

### Health & System
```
GET    /health                     # Service health check
GET    /info                       # Service information
```

## Cấu hình chính

### Environment Variables
```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/dashboarddb
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600

# Service Configuration
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=["http://localhost:3000"]

# Security
INTERNAL_SECRET=your-internal-secret-for-service-to-service-auth
```

### Database Schema
```sql
-- Ratings table
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    run_id VARCHAR NOT NULL,
    rating VARCHAR NOT NULL CHECK (rating IN ('LIKE', 'DISLIKE')),
    comment TEXT,
    thread_id VARCHAR,
    agent_id VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, run_id)
);

-- Indexes for performance
CREATE INDEX idx_ratings_user_id ON ratings(user_id);
CREATE INDEX idx_ratings_agent_id ON ratings(agent_id);
CREATE INDEX idx_ratings_thread_id ON ratings(thread_id);
CREATE INDEX idx_ratings_created_at ON ratings(created_at);
```

## Authentication & Authorization

### Trust Boundary Model
Dashboard service không tự xác thực JWT mà trust API Gateway đã xác thực:

### Trusted Headers
- `X-User-Id`: User identification
- `X-User-Roles`: User roles (CSV format: "admin,user")

### Access Control Rules
- **Missing X-User-Id**: Return 401 Unauthorized
- **Regular User**: Chỉ xem ratings của chính mình
- **Admin**: Toàn quyền truy cập và quản lý

## Usage Examples

### Create/Update Rating
```bash
curl -X POST "http://localhost:8010/ratings" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-001" \
  -H "X-User-Roles: user" \
  -d '{
    "run_id": "8f8ec0ec-7e31-4fcb-8d3a-b1137a4efe20",
    "rating": "DISLIKE",
    "comment": "Câu trả lời chưa đúng nghiệp vụ",
    "thread_id": "thread-001",
    "agent_id": "agent-sales"
  }'
```

### Get Agent Statistics (Admin Only)
```bash
curl -X GET "http://localhost:8010/ratings/stats/agent/agent-sales" \
  -H "X-User-Id: admin-001" \
  -H "X-User-Roles: admin"
```

Response:
```json
{
  "total": 120,
  "like_count": 84,
  "dislike_count": 36,
  "like_percentage": 70.0
}
```

### Get Thread Ratings
```bash
curl -X GET "http://localhost:8010/ratings/thread/thread-001" \
  -H "X-User-Id: admin-001" \
  -H "X-User-Roles: admin"
```

## Cách chạy

### Local Development
```bash
cd dashboard

# Install dependencies
uv sync

# Run database migrations
uv run alembic upgrade head

# Start service
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8010
```

### With Docker
```bash
# Using docker-compose
cd dashboard/docker
docker-compose up -d
```

### Health Check
```bash
curl -X GET "http://localhost:8010/health"
```

## Database Migrations

### Create New Migration
```bash
uv run alembic revision --autogenerate -m "Add analytics table"
```

### Apply Migrations
```bash
uv run alembic upgrade head
```

### Rollback
```bash
uv run alembic downgrade -1
```

## Testing

### Run All Tests
```bash
uv run pytest -q
```

### Unit Tests Only
```bash
uv run pytest tests/unit -q
```

### Integration Tests
```bash
uv run pytest tests/integration -q
```

### E2E Tests (Service Required)
```bash
export DASHBOARD_RUN_E2E="1"
export DASHBOARD_E2E_BASE_URL="http://localhost:8010"
uv run pytest tests/e2e -q
```

## Analytics Features

### 1. Agent Performance Metrics
- Response quality scores
- User satisfaction rates
- Feedback trend analysis
- Comparison between agents

### 2. User Behavior Analytics
- Rating patterns
- Comment analysis
- Session duration
- Feature usage

### 3. System Health Monitoring
- Service response times
- Error rates
- Database performance
- API usage patterns

### 4. Quality Improvement Loop
- Identify low-performing agents
- Extract improvement insights
- Track improvement over time
- A/B testing support

## Advanced Features

### 1. Real-time Analytics
- WebSocket connections cho live updates
- Streaming metrics
- Real-time alerts
- Live dashboard updates

### 2. Advanced Filtering
- Date range filtering
- Multi-dimensional analysis
- Custom segmentation
- Advanced search capabilities

### 3. Export & Reporting
- CSV/Excel export
- PDF report generation
- Scheduled reports
- Custom report templates

### 4. Integration Capabilities
- Webhook notifications
- Third-party analytics integration
- API cho external tools
- Data pipeline integration

## Performance Optimization

### Database Optimization
- Query optimization
- Index strategy
- Connection pooling
- Caching layers

### API Performance
- Response caching
- Pagination optimization
- Batch operations
- Compression

### Analytics Performance
- Pre-computed aggregates
- Materialized views
- Time-series optimization
- Partitioning strategies

## Security Considerations

### Data Protection
- PII handling
- Data encryption
- Access logging
- Retention policies

### API Security
- Rate limiting
- Input validation
- SQL injection prevention
- XSS protection

### Access Control
- Role-based permissions
- Audit trails
- Session management
- Token validation

## Monitoring & Alerting

### Metrics Collection
- Response times
- Error rates
- Usage patterns
- Database performance

### Alerting Rules
- High error rates
- Performance degradation
- Unusual patterns
- Service downtime

### Logging Strategy
- Structured logging
- Correlation IDs
- Error tracking
- Performance tracing

## Troubleshooting

### Common Issues
1. **Database Connection**: Check DATABASE_URL và connectivity
2. **Authentication**: Verify trusted headers configuration
3. **Performance**: Check database queries và indexes
4. **Permission Issues**: Validate user roles và headers

### Debug Commands
```bash
# Check service health
curl http://localhost:8010/health

# Test database connection
uv run python -c "from src.core.db import engine; print(engine.url)"

# Check migration status
uv run alembic current

# View logs
docker logs dashboard_service
```

## Integration Examples

### With Agent Service
```python
# Agent service submits rating after response
requests.post(
    'http://dashboard:8010/ratings',
    headers={
        'X-User-Id': user_id,
        'X-User-Roles': user_roles
    },
    json={
        'run_id': run_id,
        'rating': rating,
        'comment': comment,
        'thread_id': thread_id,
        'agent_id': agent_id
    }
)
```

### With Frontend Dashboard
```python
# Frontend fetches analytics data
analytics = requests.get(
    'http://dashboard:8010/ratings/stats/global',
    headers={'X-User-Id': user_id, 'X-User-Roles': 'admin'}
)
```

## Future Enhancements

### Planned Features
- Machine learning cho quality prediction
- Advanced visualization components
- Real-time collaboration features
- Mobile dashboard support
- Advanced filtering và segmentation
- Custom KPI tracking
- Automated reporting

### Scalability Improvements
- Microservice decomposition
- Event-driven architecture
- Caching strategies
- Load balancing
- Database sharding
