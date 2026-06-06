# DATN Chatbot System

Hệ thống chatbot thông minh với kiến trúc microservices, hỗ trợ xử lý giọng nói, tìm kiếm thông tin, định vị nội thất và phân tích dữ liệu.

## 🏗️ Kiến trúc hệ thống

```mermaid
graph TB
    subgraph "Frontend Layer"
        FE[Frontend Next.js<br/>Port: 3000]
    end
    
    subgraph "API Gateway"
        GW[API Gateway<br/>FastAPI<br/>Port: 8002]
    end
    
    subgraph "Core Services"
        AS[Agent Service Toolkit<br/>FastAPI<br/>Port: 8080]
        KB[Knowledge Base<br/>FastAPI<br/>Port: 8000]
        WF[Wayfinder Service<br/>FastAPI<br/>Port: 8001]
        DB[Dashboard Service<br/>FastAPI<br/>Port: 8010]
        VS[Voice Service<br/>FastAPI<br/>Port: 7860]
    end
    
    subgraph "Data Layer"
        PG1[(PostgreSQL<br/>Agent DB)]
        PG2[(PostgreSQL<br/>Knowledge DB)]
        PG3[(PostgreSQL<br/>Wayfinder DB)]
        PG4[(PostgreSQL<br/>Dashboard DB)]
        VDB[(Vector DB<br/>Qdrant)]
        REDIS[(Redis<br/>Cache/Queue)]
    end
    
    subgraph "External Services"
        LLM[LLM APIs<br/>OpenAI/Anthropic/etc]
        TTS[TTS Models<br/>Piper]
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

## 📋 Danh sách Services

### 1. Frontend Application 🖥️
- **Technology**: Next.js 16, TypeScript, TailwindCSS
- **Port**: 3000
- **Features**: Real-time chat, admin dashboard, voice input

### 2. API Gateway 🚪
- **Technology**: FastAPI, JWT Authentication
- **Port**: 8002
- **Features**: Request routing, authentication, rate limiting

### 3. Agent Service Toolkit 🤖
- **Technology**: LangGraph, FastAPI, Streamlit
- **Port**: 8080
- **Features**: AI agents, reasoning, tool usage

### 4. Knowledge Base Service 📚
- **Technology**: FastAPI, PostgreSQL, Qdrant
- **Port**: 8000
- **Features**: Document management, RAG, vector search

### 5. Wayfinder Service 🗺️
- **Technology**: FastAPI, PostgreSQL, NetworkX
- **Port**: 8001
- **Features**: Indoor navigation, location services

### 6. Dashboard Service 📊
- **Technology**: FastAPI, PostgreSQL
- **Port**: 8010
- **Features**: Analytics, user feedback management

### 7. Voice Service 🎤
- **Technology**: FastAPI, Sherpa-ONNX, Piper
- **Port**: 7860
- **Features**: Speech-to-Text, Text-to-Speech

## 🚀 Quick Start

### Prerequisites
- Docker và Docker Compose
- Python 3.11+
- Node.js 18+
- PostgreSQL (nếu không dùng Docker)

### Cài đặt và chạy

#### 1. Clone repository
```bash
git clone https://github.com/your-org/DATN-Chatbot.git
cd DATN-Chatbot
```

#### 2. Cấu hình environment variables
```bash
# Tạo file .env cho từng service
cp .env.example .env
# Chỉnh sửa .env với cấu hình của bạn
```

#### 3. Chạy với Docker Compose (Recommended)
```bash
docker-compose up -d
```

#### 4. Chạy từng service (Manual)

**Knowledge Base Service**
```bash
cd knowledge
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

**Agent Service Toolkit**
```bash
cd agent-service-toolkit
uv sync
python src/run_service.py
```

**API Gateway**
```bash
cd api_gateway
uv sync
docker compose up -d
uv run uvicorn src.main:app --reload --port 8002
```

**Dashboard Service**
```bash
cd dashboard
uv sync
uv run uvicorn src.main:app --reload --port 8010
```

**Wayfinder Service**
```bash
cd wayfinder
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8001
```

**Voice Service**
```bash
cd voice
# Cài đặt các thư viện phụ thuộc (Local Windows)
pip install -r requirements.txt
python server.py
```

**Hoặc chạy Voice Service bằng Docker Compose (Khuyên dùng)**
```bash
cd voice
# 1. Đảm bảo đã tải các file model lớn qua Git LFS
git lfs pull
# 2. Khởi chạy cụm dịch vụ voice (bao gồm cả TTS)
docker compose up -d
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## 🌐 Access Points

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8002
- **Agent Service**: http://localhost:8080
- **Knowledge Base**: http://localhost:8000
- **Wayfinder**: http://localhost:8001
- **Dashboard**: http://localhost:8010
- **Voice Service**: http://localhost:7860

## 📚 Documentation

- [Services Overview](docs/services/README.md) - Chi tiết từng service
- [System Flows](docs/system-flows/README.md) - Luồng xử lý hệ thống
- [API Documentation](docs/services/) - API docs cho từng service
- [Testing Guide](docs/testing/) - Hướng dẫn testing

## 🛠️ Technology Stack

### Backend
- **API Frameworks**: FastAPI, Streamlit
- **Databases**: PostgreSQL, Qdrant (Vector DB), Redis
- **AI/ML**: LangGraph, PyTorch, Sherpa-ONNX
- **Task Processing**: Celery
- **Package Management**: UV

### Frontend
- **Framework**: Next.js 16 với App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS, Shadcn/ui
- **State Management**: Zustand

### DevOps
- **Containerization**: Docker, Docker Compose
- **Database Migrations**: Alembic
- **Testing**: Pytest, Playwright

## 🔧 Development

### Environment Variables
```bash
# Database URLs
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
VECTOR_DB_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# JWT
JWT_SECRET=your_jwt_secret
```

### Database Setup
```bash
# Chạy migrations cho từng service
cd api_gateway && uv run alembic upgrade head
cd knowledge && alembic upgrade head
cd dashboard && alembic upgrade head
cd wayfinder && alembic upgrade head
```

## 📊 Monitoring

### Health Check Endpoints
- `/health` - Basic service health
- `/info` - Service information
- `/metrics` - Performance metrics

### Logging
- Structured logging với JSON format
- Correlation IDs cho distributed tracing
- Error tracking với Sentry (optional)

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Check documentation trong `docs/`
- Review troubleshooting sections
- Create GitHub Issue cho bugs/questions
- Contact development team

---
# Eject .env từ Infisical
CHẠY LẦN ĐẦU:
mở pwshell

Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

irm get.scoop.sh | iex

scoop --version

scoop bucket add org https://github.com/Infisical/scoop-infisical.git

scoop install infisical

infisical login

(trong folder gốc của đồ án)
infisical init




CHẠY CÁC LẦN SAU:
thêm "infisical run --path=/api_gateway -- " vào trước lệnh chạy uv,vd: 
infisical run --path=/api_gateway -- uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8008

**Last Updated**: 2025-01-03  
**Version**: 1.0.0  
**Maintainers**: DATN Chatbot Development Team
