# DATN Chatbot System - Services Overview

## Tổng quan hệ thống

DATN Chatbot là một hệ thống microservices kiến trúc cung cấp nền tảng chatbot thông minh với khả năng xử lý giọng nói, tìm kiếm thông tin, định vị nội thất và phân tích dữ liệu. Hệ thống được xây dựng với kiến trúc hiện đại, có khả năng mở rộng và bảo mật cao.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend Layer"
        FE[Frontend Next.js<br/>Port: 3000]
    end
    
    subgraph "API Gateway"
        GW[API Gateway<br/>Apache APISIX<br/>Port: 8002]
    end
    
    subgraph "Core Services"
        AS[Agent Service Toolkit<br/>FastAPI<br/>Port: 8080]
        KB[Knowledge Base<br/>FastAPI<br/>Port: 8000]
        WF[Wayfinder Service<br/>FastAPI<br/>Port: 8001]
        DB[Dashboard Service<br/>FastAPI<br/>Port: 8010]
        VS[Voice Service<br/>Gradio/TTS<br/>Port: 7860/7861]
    end
    
    subgraph "Data Layer"
        PG1[(PostgreSQL<br/>Agent DB)]
        PG2[(PostgreSQL<br/>Knowledge DB)]
        PG3[(PostgreSQL<br/>Wayfinder DB)]
        PG4[(PostgreSQL<br/>Dashboard DB)]
        VDB[(Vector DB<br/>ChromaDB)]
        REDIS[(Redis<br/>Cache/Queue)]
    end
    
    subgraph "External Services"
        LLM[LLM APIs<br/>OpenAI/Anthropic/etc]
        TTS[TTS Models<br/>Piper/Neural]
        STT[STT Models<br/>Sherpa-ONNX]
    end
    
    FE --> GW
    GW --> AS
    GW --> KB
    GW --> WF
    GW --> DB
    GW --> VS
    
    AS --> PG1
    AS --> LLM
    
    KB --> PG2
    KB --> VDB
    KB --> REDIS
    
    WF --> PG3
    WF --> REDIS
    
    DB --> PG4
    
    VS --> STT
    VS --> TTS
    
    AS --> KB
    AS --> WF
    AS --> VS
```

## Services Summary

### 1. API Gateway Service 🚪
**Port**: 8002 | **Technology**: Apache APISIX

- **Chức năng**: Cổng vào chính, routing và load balancing
- **Key Features**: JWT authentication, rate limiting, request transformation
- **Integration**: Tất cả backend services
- **Documentation**: [api-gateway.md](./api-gateway.md)

### 2. Agent Service Toolkit 🤖
**Port**: 8080 | **Technology**: LangGraph, FastAPI, Streamlit

- **Chức năng**: AI agents với reasoning và tool usage
- **Key Features**: Multiple agents, streaming responses, human-in-the-loop
- **Integration**: Knowledge base, voice services, LLM APIs
- **Documentation**: [agent-service-toolkit.md](./agent-service-toolkit.md)

### 3. Knowledge Base Service 📚
**Port**: 8000 | **Technology**: FastAPI, PostgreSQL, Vector DB

- **Chức năng**: Document management và RAG (Retrieval-Augmented Generation)
- **Key Features**: Document upload, vector search, Q&A system
- **Integration**: Agent service, file storage, embedding models
- **Documentation**: [knowledge-base.md](./knowledge-base.md)

### 4. Dashboard Service 📊
**Port**: 8010 | **Technology**: FastAPI, PostgreSQL

- **Chức năng**: Analytics và user feedback management
- **Key Features**: Answer rating, performance metrics, admin analytics
- **Integration**: All services cho data collection
- **Documentation**: [dashboard.md](./dashboard.md)

### 5. Wayfinder Service 🗺️
**Port**: 8001 | **Technology**: FastAPI, PostGIS, NetworkX

- **Chức năng**: Indoor navigation và location services
- **Key Features**: Map management, route calculation, location search
- **Integration**: Agent service cho location-based queries
- **Documentation**: [wayfinder.md](./wayfinder.md)

### 6. Voice Service 🎤
**Port**: 7860/7861 | **Technology**: Sherpa-ONNX, Gradio, Piper

- **Chức năng**: Speech-to-Text và Text-to-Speech
- **Key Features**: Multi-language STT, neural TTS, voice bot
- **Integration**: Agent service cho voice interactions
- **Documentation**: [voice.md](./voice.md)

### 7. Frontend Application 🖥️
**Port**: 3000 | **Technology**: Next.js, TypeScript, TailwindCSS

- **Chức năng**: Web interface cho end users
- **Key Features**: Real-time chat, admin dashboard, voice input
- **Integration**: API Gateway cho tất cả backend services
- **Documentation**: [frontend.md](./frontend.md)

## Port Mapping

| Service | Internal Port | External Port | Protocol |
|----------|---------------|---------------|----------|
| Frontend | 3000 | 3000 | HTTP |
| API Gateway | 9080 | 8002 | HTTP |
| Agent Service | 8080 | 8080 | HTTP |
| Knowledge Base | 8000 | 8000 | HTTP |
| Wayfinder | 8001 | 8001 | HTTP |
| Dashboard | 8010 | 8010 | HTTP |
| Voice STT | 7860 | 7860 | HTTP |
| Voice TTS | 7861 | 7861 | HTTP |
| PostgreSQL (Agent) | 5432 | 5432 | TCP |
| PostgreSQL (Knowledge) | 5433 | 5433 | TCP |
| PostgreSQL (Wayfinder) | 5434 | 5434 | TCP |
| PostgreSQL (Dashboard) | 5435 | 5435 | TCP |
| Redis | 6379 | 6379 | TCP |

## Data Flow

### 1. User Chat Flow
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as API Gateway
    participant AS as Agent Service
    participant KB as Knowledge Base
    participant DB as Dashboard
    
    U->>FE: Send message
    FE->>GW: POST /agent/{id}/invoke
    GW->>AS: Forward request
    AS->>KB: Search for context
    KB-->>AS: Return documents
    AS->>LLM: Generate response
    LLM-->>AS: Return answer
    AS->>DB: Log interaction
    AS-->>GW: Return response
    GW-->>FE: Return response
    FE-->>U: Display answer
```

### 2. Voice Interaction Flow
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant VS as Voice Service
    participant AS as Agent Service
    participant STT as STT Engine
    participant TTS as TTS Engine
    
    U->>FE: Voice input
    FE->>VS: Audio data
    VS->>STT: Transcribe audio
    STT-->>VS: Text transcript
    VS->>AS: Send text message
    AS-->>VS: Text response
    VS->>TTS: Synthesize speech
    TTS-->>VS: Audio response
    VS-->>FE: Audio data
    FE-->>U: Play audio
```

### 3. Document Processing Flow
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant KB as Knowledge Base
    participant Celery as Background Worker
    participant VDB as Vector DB
    
    U->>FE: Upload document
    FE->>KB: POST /documents/upload
    KB->>Celery: Start processing task
    Celery->>Celery: Extract text
    Celery->>Celery: Generate embeddings
    Celery->>VDB: Store vectors
    Celery-->>KB: Task complete
    KB-->>FE: Document ready
    FE-->>U: Upload complete
```

## Technology Stack

### Backend Technologies
- **API Frameworks**: FastAPI, Apache APISIX, Gradio
- **Databases**: PostgreSQL, PostGIS, ChromaDB, Redis
- **AI/ML**: LangGraph, PyTorch, Sherpa-ONNX, Sentence Transformers
- **Task Processing**: Celery, Redis Queue
- **Containerization**: Docker, Docker Compose

### Frontend Technologies
- **Framework**: Next.js 14 với App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS, Shadcn/ui
- **State Management**: Zustand
- **Data Fetching**: React Query

### DevOps & Infrastructure
- **Package Management**: UV, npm
- **Database Migrations**: Alembic
- **Testing**: Pytest, Jest
- **Documentation**: Markdown, Mermaid diagrams

## Security Architecture

### Authentication Flow
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as API Gateway
    participant Auth as Auth Service
    
    U->>FE: Login credentials
    FE->>Auth: Authenticate
    Auth-->>FE: JWT token
    FE->>FE: Store token
    
    Note over FE,GW: Subsequent requests
    FE->>GW: Request + JWT
    GW->>GW: Validate JWT
    GW->>GW: Inject user headers
    GW->>Service: Forward with trusted headers
```

### Security Features
- **JWT Authentication**: Centralized authentication qua API Gateway
- **Service-to-Service**: Internal secret authentication
- **Data Encryption**: Database và transit encryption
- **Input Validation**: Comprehensive input validation
- **Rate Limiting**: API rate limiting và abuse prevention
- **CORS Configuration**: Proper cross-origin resource sharing

## Deployment Architecture

### Development Environment
```yaml
# docker-compose.dev.yml
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8002
  
  api-gateway:
    build: ./api_gateway
    ports: ["8002:9080"]
    depends_on: [agent-service, knowledge, wayfinder, dashboard, voice]
  
  agent-service:
    build: ./agent-service-toolkit
    ports: ["8080:8080"]
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/agentdb
```

### Production Considerations
- **Load Balancing**: Multiple instances per service
- **Database Clustering**: High availability database setup
- **Monitoring**: Comprehensive logging và metrics
- **Backup Strategy**: Automated backups và disaster recovery
- **Scaling**: Horizontal scaling với container orchestration

## Monitoring & Observability

### Health Check Endpoints
- `/health`: Basic service health
- `/info`: Service information và version
- `/metrics`: Performance metrics (Prometheus format)

### Logging Strategy
- **Structured Logging**: JSON format với correlation IDs
- **Log Levels**: DEBUG, INFO, WARNING, ERROR
- **Centralized Logging**: ELK stack hoặc similar
- **Error Tracking**: Sentry hoặc similar service

### Metrics Collection
- **Response Times**: API endpoint performance
- **Error Rates**: Service error tracking
- **Resource Usage**: CPU, memory, disk usage
- **Business Metrics**: User interactions, chat quality

## Development Workflow

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/your-org/DATN-Chatbot.git
cd DATN-Chatbot

# Start all services
docker-compose up -d

# Access services
# Frontend: http://localhost:3000
# API Gateway: http://localhost:8002
# Agent Service: http://localhost:8080
# Knowledge Base: http://localhost:8000
# Wayfinder: http://localhost:8001
# Dashboard: http://localhost:8010
# Voice STT: http://localhost:7860
```

### Testing Strategy
- **Unit Tests**: Service-specific logic testing
- **Integration Tests**: Service interaction testing
- **E2E Tests**: Full user journey testing
- **Performance Tests**: Load và stress testing

### CI/CD Pipeline
- **Code Quality**: Linting, formatting, type checking
- **Automated Tests**: Test suite execution
- **Security Scans**: Dependency vulnerability scanning
- **Deployment**: Automated deployment to staging/production

## Future Enhancements

### Planned Services
- **Notification Service**: Real-time notifications
- **Analytics Service**: Advanced analytics và ML insights
- **File Storage Service**: Centralized file management
- **User Management Service**: Advanced user administration

### Technology Upgrades
- **GraphQL**: API layer improvement
- **Event-Driven Architecture**: Message queue integration
- **Microservices**: Further service decomposition
- **Edge Computing**: CDN và edge processing

### AI/ML Enhancements
- **Custom Model Training**: Domain-specific models
- **Multi-modal AI**: Image và video processing
- **Advanced NLP**: Sentiment analysis, entity recognition
- **Personalization**: User preference learning

## Getting Started

### Prerequisites
- Docker và Docker Compose
- Git
- Node.js (cho frontend development)
- Python (cho backend development)

### Quick Start
```bash
# 1. Clone repository
git clone https://github.com/your-org/DATN-Chatbot.git
cd DATN-Chatbot

# 2. Setup environment variables
cp .env.example .env
# Edit .env với your configuration

# 3. Start all services
docker-compose up -d

# 4. Verify services are running
curl http://localhost:8002/health
curl http://localhost:8080/health
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:8010/health

# 5. Access frontend
open http://localhost:3000
```

### Configuration Guide
Xem individual service documentation cho detailed configuration:
- [API Gateway Configuration](./api-gateway.md#cấu-trình-chính)
- [Agent Service Configuration](./agent-service-toolkit.md#cấu-trình-chính)
- [Knowledge Base Configuration](./knowledge-base.md#cấu-trình-chính)
- [Dashboard Configuration](./dashboard.md#cấu-trình-chính)
- [Wayfinder Configuration](./wayfinder.md#cấu-trình-chính)
- [Voice Configuration](./voice.md#cấu-trình-chính)
- [Frontend Configuration](./frontend.md#configuration)

## Support & Contributing

### Documentation Structure
- Individual service documentation trong `docs/services/`
- API documentation trong service-specific `/docs` endpoints
- Development guides trong `docs/development/`
- Deployment guides trong `docs/deployment/`

### Getting Help
- Check individual service documentation
- Review troubleshooting sections
- Check GitHub Issues
- Contact development team

### Contributing
1. Fork repository
2. Create feature branch
3. Make changes
4. Add tests
5. Update documentation
6. Submit pull request

---

**Last Updated**: 2025-01-03
**Version**: 1.0.0
**Maintainers**: DATN Chatbot Development Team
