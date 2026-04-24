# Port Mapping Reference

## 🌐 Service Endpoints

### Frontend & API Gateway
| Service | Port | Protocol | URL | Purpose |
|---------|------|----------|-----|---------|
| Frontend | 3000 | HTTP | http://localhost:3000 | Web application |
| API Gateway | 8002 | HTTP | http://localhost:8002 | Main API entry point |

### Core Backend Services
| Service | Port | Protocol | URL | Purpose |
|---------|------|----------|-----|---------|
| Agent Service | 8080 | HTTP | http://localhost:8080 | AI agent processing |
| Knowledge Base | 8000 | HTTP | http://localhost:8000 | Document management & RAG |
| Wayfinder | 8001 | HTTP | http://localhost:8001 | Indoor navigation |
| Dashboard | 8010 | HTTP | http://localhost:8010 | Analytics & feedback |
| Voice Service | 7860 | HTTP | http://localhost:7860 | Speech processing |

### Databases & Storage
| Service | Port | Protocol | URL | Purpose |
|---------|------|----------|-----|---------|
| PostgreSQL (Agent) | 5432 | TCP | localhost:5432 | Agent service data |
| PostgreSQL (Knowledge) | 5433 | TCP | localhost:5433 | Knowledge base data |
| PostgreSQL (Wayfinder) | 5434 | TCP | localhost:5434 | Navigation data |
| PostgreSQL (Dashboard) | 5435 | TCP | localhost:5435 | Analytics data |
| Qdrant (Vector DB) | 6333 | HTTP | http://localhost:6333 | Vector storage |
| Redis | 6379 | TCP | localhost:6379 | Cache & queue |

### Monitoring & Management
| Service | Port | Protocol | URL | Purpose |
|---------|------|----------|-----|---------|
| Flower (Celery Monitor) | 5555 | HTTP | http://localhost:5555 | Task monitoring |
| Qdrant Dashboard | 6333 | HTTP | http://localhost:6333/dashboard | Vector DB UI |

## 🔍 Health Check Endpoints

### Service Health Checks
```bash
# API Gateway
curl http://localhost:8002/health

# Agent Service
curl http://localhost:8080/health

# Knowledge Base
curl http://localhost:8000/health

# Wayfinder
curl http://localhost:8001/health

# Dashboard
curl http://localhost:8010/health

# Voice Service
curl http://localhost:7860/health
```

### Database Health Checks
```bash
# PostgreSQL
pg_isready -h localhost -p 5432  # Agent DB
pg_isready -h localhost -p 5433  # Knowledge DB
pg_isready -h localhost -p 5434  # Wayfinder DB
pg_isready -h localhost -p 5435  # Dashboard DB

# Redis
redis-cli -p 6379 ping

# Qdrant
curl http://localhost:6333/health
```

## 🛠️ API Endpoints Reference

### API Gateway (Port 8002)
```bash
# Authentication
POST /auth/login
POST /auth/refresh
POST /auth/logout

# Agent routes
POST /agent/{agent_id}/invoke
GET /agent/{agent_id}/history

# Knowledge routes
POST /documents/upload
GET /documents/search
GET /documents/{id}

# Wayfinder routes
POST /maps/search
POST /maps/route

# Dashboard routes
GET /ratings/stats
POST /ratings

# Health & Info
GET /health
GET /info
GET /metrics
```

### Agent Service (Port 8080)
```bash
# Agent interactions
POST /{agent_id}/invoke
POST /{agent_id}/stream
GET /{agent_id}/history

# Agent management
GET /agents
POST /agents
PUT /agents/{id}

# Health
GET /health
GET /info
```

### Knowledge Base (Port 8000)
```bash
# Document management
POST /documents/upload
GET /documents
GET /documents/{id}
DELETE /documents/{id}

# Search & Retrieval
POST /search
GET /search/similar
POST /chat

# Processing status
GET /documents/{id}/status
GET /processing/queue

# Health
GET /health
GET /info
```

### Wayfinder (Port 8001)
```bash
# Map management
GET /maps
POST /maps
GET /maps/{id}

# Navigation
POST /maps/search
POST /maps/route
GET /maps/{id}/nodes

# Health
GET /health
GET /info
```

### Dashboard (Port 8010)
```bash
# Analytics
GET /ratings/stats
GET /ratings/global
GET /agents/performance

# Feedback
POST /ratings
GET /ratings/{id}
PUT /ratings/{id}

# Health
GET /health
GET /info
```

### Voice Service (Port 7860)
```bash
# Speech-to-Text
POST /api/stt/transcribe
POST /api/stt/stream

# Text-to-Speech
POST /api/tts/synthesize
GET /api/tts/voices

# Health
GET /health
GET /info
```

## 🔧 Configuration Files

### Environment Port Variables
```bash
# Service Ports
API_GATEWAY_PORT=8002
AGENT_SERVICE_PORT=8080
KNOWLEDGE_BASE_PORT=8000
WAYFINDER_PORT=8001
DASHBOARD_PORT=8010
VOICE_SERVICE_PORT=7860
FRONTEND_PORT=3000

# Database Ports
POSTGRES_AGENT_PORT=5432
POSTGRES_KNOWLEDGE_PORT=5433
POSTGRES_WAYFINDER_PORT=5434
POSTGRES_DASHBOARD_PORT=5435

# External Services
QDRANT_PORT=6333
REDIS_PORT=6379
FLOWER_PORT=5555
```

### Docker Compose Port Mapping
```yaml
services:
  frontend:
    ports: ["3000:3000"]
  
  api-gateway:
    ports: ["8002:8002"]
  
  agent-service:
    ports: ["8080:8080"]
  
  knowledge-base:
    ports: ["8000:8000"]
  
  wayfinder:
    ports: ["8001:8001"]
  
  dashboard:
    ports: ["8010:8010"]
  
  voice-service:
    ports: ["7860:7860"]
  
  postgres-agent:
    ports: ["5432:5432"]
  
  postgres-knowledge:
    ports: ["5433:5432"]
  
  postgres-wayfinder:
    ports: ["5434:5432"]
  
  postgres-dashboard:
    ports: ["5435:5432"]
  
  qdrant:
    ports: ["6333:6333"]
  
  redis:
    ports: ["6379:6379"]
  
  flower:
    ports: ["5555:5555"]
```

## 🚨 Port Conflict Resolution

### Checking Port Usage
```bash
# Check if port is in use
netstat -tulpn | grep :8000

# Alternative using lsof
lsof -i :8000

# Find process using port
fuser 8000/tcp
```

### Resolving Conflicts
```bash
# Kill process using port
sudo kill -9 <PID>

# Or change service port in environment variables
export AGENT_SERVICE_PORT=8081
```

### Docker Port Issues
```bash
# Check Docker port mappings
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Stop conflicting containers
docker stop <container_name>

# Recreate with different ports
docker-compose up -d --scale agent-service=1
```

## 📊 Service Dependencies

### Startup Order
1. **Databases**: PostgreSQL (5432-5435), Redis (6379), Qdrant (6333)
2. **Core Services**: Knowledge Base (8000), Agent Service (8080)
3. **Support Services**: Wayfinder (8001), Dashboard (8010), Voice (7860)
4. **API Gateway**: (8002)
5. **Frontend**: (3000)

### Communication Flow
```
Frontend (3000) → API Gateway (8002) → Services (8000-8010, 7860)
                                     ↓
Databases (5432-5435, 6333, 6379) ← Services
```

## 🔍 Troubleshooting

### Common Port Issues
1. **Port already in use** - Check with `netstat` or `lsof`
2. **Firewall blocking** - Configure firewall rules
3. **Docker port mapping** - Verify docker-compose.yml
4. **Service not starting** - Check service logs
5. **Database connection** - Verify database is running

### Debug Commands
```bash
# Test connectivity
telnet localhost 8000
curl -v http://localhost:8000/health

# Check Docker networking
docker network ls
docker network inspect datn-chatbot_default

# Service logs
docker-compose logs [service_name]
```

---

**Last Updated**: 2025-01-03  
**Version**: 1.0.0
