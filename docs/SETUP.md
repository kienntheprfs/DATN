# Setup Guide

## 📋 Prerequisites

### Required Software
- **Docker** & **Docker Compose** (recommended)
- **Python** 3.11+
- **Node.js** 18+
- **PostgreSQL** (if not using Docker)
- **Git**

### Optional Software
- **Redis** (if not using Docker)
- **Qdrant** (if not using Docker)

## 🚀 Quick Start (Docker)

### 1. Clone Repository
```bash
git clone https://github.com/your-org/DATN-Chatbot.git
cd DATN-Chatbot
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Required Environment Variables:**
```bash
# AI Services
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-your-anthropic-key

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Start All Services
```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### 4. Verify Services
```bash
# Check service health
curl http://localhost:8002/health  # API Gateway
curl http://localhost:8080/health  # Agent Service
curl http://localhost:8000/health  # Knowledge Base
curl http://localhost:8001/health  # Wayfinder
curl http://localhost:8010/health  # Dashboard
curl http://localhost:7860/health  # Voice Service
```

### 5. Access Applications
- **Frontend**: http://localhost:3000
- **Flower (Celery Monitor)**: http://localhost:5555
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## 🔧 Manual Setup

### Database Setup

#### PostgreSQL Databases
```bash
# Create databases
createdb agentdb
createdb knowledgedb
createdb wayfinderdb
createdb dashboarddb

# Create users (optional)
createuser datn_user
psql -c "ALTER USER datn_user PASSWORD 'your_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE agentdb TO datn_user;"
psql -c "GRANT ALL PRIVILEGES ON DATABASE knowledgedb TO datn_user;"
psql -c "GRANT ALL PRIVILEGES ON DATABASE wayfinderdb TO datn_user;"
psql -c "GRANT ALL PRIVILEGES ON DATABASE dashboarddb TO datn_user;"
```

#### Redis
```bash
# Start Redis
redis-server

# Or install with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

#### Qdrant
```bash
# Start Qdrant
docker run -d -p 6333:6333 qdrant/qdrant:latest
```

### Service Setup

#### 1. API Gateway
```bash
cd api_gateway

# Install dependencies
uv sync

# Run migrations
uv run alembic upgrade head

# Start service
uv run uvicorn src.main:app --reload --port 8002
```

#### 2. Knowledge Base
```bash
cd knowledge

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start service
uvicorn src.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A src.tasks worker --loglevel=info

# Start Flower monitoring (optional)
celery -A src.tasks flower --port=5555
```

#### 3. Agent Service Toolkit
```bash
cd agent-service-toolkit

# Install dependencies
uv sync

# Start service
python src/run_service.py
```

#### 4. Wayfinder
```bash
cd wayfinder

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start service
uvicorn backend.main:app --reload --port 8001
```

#### 5. Dashboard
```bash
cd dashboard

# Install dependencies
uv sync

# Run migrations
uv run alembic upgrade head

# Start service
uv run uvicorn src.main:app --reload --port 8010
```

#### 6. Voice Service
```bash
cd voice

# Install dependencies
pip install -r requirements.txt

# Start service
uvicorn src.main:app --reload --port 7860
```

#### 7. Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Or build for production
npm run build
npm start
```

## 🔗 Service Dependencies

### Database Connection Strings
```bash
# API Gateway
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentdb

# Knowledge Base
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/knowledgedb
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# Wayfinder
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/wayfinderdb
REDIS_URL=redis://localhost:6379

# Dashboard
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/dashboarddb
```

### AI Service Configuration
```bash
# OpenAI (for GPT models)
OPENAI_API_KEY=sk-your-openai-key

# Anthropic (for Claude models)
ANTHROPIC_API_KEY=sk-your-anthropic-key

# Google AI (optional)
GOOGLE_API_KEY=your-google-api-key
```

## 🧪 Testing Setup

### Backend Tests
```bash
# API Gateway
cd api_gateway && uv run pytest

# Knowledge Base
cd knowledge && pytest

# Dashboard
cd dashboard && uv run pytest

# Wayfinder
cd wayfinder && pytest
```

### Frontend Tests
```bash
cd frontend

# Unit tests
npm test

# E2E tests
npm run test:e2e

# Playwright tests
npx playwright test
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Database Connection Errors
```bash
# Check PostgreSQL status
pg_isready -h localhost -p 5432

# Check if databases exist
psql -l

# Reset database
dropdb agentdb && createdb agentdb
```

#### 2. Redis Connection Errors
```bash
# Check Redis status
redis-cli ping

# Restart Redis
docker restart redis_container_name
```

#### 3. Qdrant Connection Errors
```bash
# Check Qdrant status
curl http://localhost:6333/health

# Reset Qdrant data
docker volume rm qdrant_data
```

#### 4. Port Conflicts
```bash
# Check which ports are in use
netstat -tulpn | grep :8000

# Kill process using port
sudo kill -9 <PID>
```

#### 5. Permission Issues
```bash
# Fix Docker permissions
sudo chown -R $USER:$USER .

# Fix Python permissions
chmod +x scripts/*.sh
```

### Health Check Commands
```bash
# Service health endpoints
curl http://localhost:8002/health  # API Gateway
curl http://localhost:8080/health  # Agent Service
curl http://localhost:8000/health  # Knowledge Base
curl http://localhost:8001/health  # Wayfinder
curl http://localhost:8010/health  # Dashboard
curl http://localhost:7860/health  # Voice Service

# Database health
pg_isready -h localhost -p 5432
redis-cli ping
curl http://localhost:6333/health
```

### Log Locations
```bash
# Docker logs
docker-compose logs [service_name]

# Application logs (manual setup)
tail -f api_gateway/logs/app.log
tail -f knowledge/logs/app.log

# System logs
journalctl -u docker
```

## 📊 Monitoring

### Prometheus Metrics
```bash
# Access metrics endpoints
curl http://localhost:8002/metrics
curl http://localhost:8080/metrics
```

### Flower (Celery Monitor)
- **URL**: http://localhost:5555
- **Features**: Task monitoring, worker status, execution statistics

### Qdrant Dashboard
- **URL**: http://localhost:6333/dashboard
- **Features**: Collection management, vector search interface

## 🚀 Production Deployment

### Environment Variables for Production
```bash
# Security
ENVIRONMENT=production
DEBUG=false
JWT_SECRET=your-production-jwt-secret

# Database (use connection pooling)
DATABASE_URL=postgresql://user:pass@db-host:5432/db?pool_size=20

# SSL/TLS
HTTPS_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem

# Monitoring
SENTRY_DSN=your-sentry-dsn
PROMETHEUS_ENABLED=true
```

### Docker Production
```bash
# Use production compose file
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale api-gateway=3
```

### Security Considerations
1. **Change default passwords**
2. **Use environment variables for secrets**
3. **Enable HTTPS in production**
4. **Configure firewall rules**
5. **Regular security updates**
6. **Backup databases regularly**

## 📚 Additional Resources

- [API Documentation](docs/services/)
- [System Flows](docs/system-flows/)
- [Architecture Overview](docs/services/README.md)
- [Testing Guide](docs/testing/)

---

**Need Help?**
- Check the troubleshooting section above
- Review service-specific documentation
- Create an issue on GitHub
- Contact the development team
