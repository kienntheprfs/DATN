# Knowledge Base Service

## Tổng quan
Knowledge Base Service là microservice quản lý tài liệu, kiến thức và RAG (Retrieval-Augmented Generation) cho hệ thống chatbot. Service cung cấp API để upload, xử lý, và truy vấn tài liệu từ nhiều nguồn khác nhau.

## Công nghệ
- **FastAPI**: REST API framework
- **PostgreSQL**: Primary database cho metadata
- **Vector Database**: Embedding storage (ChromaDB/Pinecone)
- **Celery**: Async task processing
- **Redis**: Task queue broker
- **Alembic**: Database migrations
- **Pydantic**: Data validation

## Port và Endpoint
- **Service Port**: 8000
- **Health Check**: `/health`
- **API Docs**: `/docs` (Swagger)

## Architecture

### Core Components
1. **API Layer** (`src/api/`): REST endpoints
2. **Services** (`src/services/`): Business logic
3. **Repositories** (`src/repositories/`): Data access layer
4. **Models** (`src/models/`): Database models
5. **Schemas** (`src/schemas/`): Pydantic models
6. **Workers** (`src/workers/`): Background tasks

### Database Schema
- **documents**: Document metadata và content
- **document_storage**: File storage information
- **faq**: Frequently asked questions
- **formal_documents**: Structured documents

## Features

### 1. Document Management
- Upload documents từ multiple sources
- File format support (PDF, DOCX, TXT, etc.)
- Document versioning
- Metadata extraction

### 2. Vector Storage & Retrieval
- Text embedding với multiple models
- Vector similarity search
- Hybrid search (vector + keyword)
- Context window management

### 3. RAG Pipeline
- Document chunking strategies
- Question-answering with context
- Source attribution
- Confidence scoring

### 4. FAQ Generation
- Automatic FAQ extraction
- Manual FAQ management
- FAQ search và ranking

### 5. Async Processing
- Background document processing
- Progress tracking
- Error handling và retry

## API Endpoints

### Document Management
```
POST   /documents/upload          # Upload new document
GET    /documents/{id}           # Get document details
PUT    /documents/{id}           # Update document
DELETE /documents/{id}           # Delete document
GET    /documents                # List documents with pagination
```

### Document Storage
```
POST   /storage/upload           # Upload file to storage
GET    /storage/{file_id}        # Download file
DELETE /storage/{file_id}        # Delete file from storage
```

### Search & Retrieval
```
POST   /search                   # Vector search
POST   /search/hybrid             # Hybrid search
POST   /qa                       # Question answering
GET    /faq                      # Get FAQs
POST   /faq                      # Create FAQ
```

### Background Tasks
```
GET    /tasks/{task_id}          # Get task status
POST   /tasks/process            # Start document processing
```

## Cấu hình chính

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/knowledgedb

# Redis (for Celery)
REDIS_URL=redis://localhost:6379/0

# Vector Database
VECTOR_DB_TYPE=chromadb
CHROMADB_HOST=localhost
CHROMADB_PORT=8000

# Embedding Model
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
OPENAI_API_KEY=your_openai_key  # For OpenAI embeddings

# File Storage
STORAGE_TYPE=local  # local, s3, gcs
LOCAL_STORAGE_PATH=./data/files
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_BUCKET_NAME=your_bucket

# Processing
MAX_DOCUMENT_SIZE=50MB
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

## Cách chạy

### Local Development
```bash
cd knowledge

# Install dependencies
pip install -r requirements.txt

# Setup database
alembic upgrade head

# Run Redis (for Celery)
redis-server

# Run Celery worker
celery -A src.core.celery_app worker --loglevel=info

# Run FastAPI service
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### With Docker
```bash
# Build và run với docker-compose
docker-compose up -d
```

## Usage Examples

### Upload Document
```python
import requests

files = {'file': open('document.pdf', 'rb')}
data = {
    'title': 'My Document',
    'description': 'Important document',
    'tags': '["important", "reference"]'
}

response = requests.post(
    'http://localhost:8000/documents/upload',
    files=files,
    data=data
)
```

### Search Documents
```python
response = requests.post(
    'http://localhost:8000/search',
    json={
        'query': 'machine learning basics',
        'limit': 5,
        'threshold': 0.7
    }
)

results = response.json()
for result in results['documents']:
    print(f"Score: {result['score']}")
    print(f"Content: {result['content'][:100]}...")
```

### Question Answering
```python
response = requests.post(
    'http://localhost:8000/qa',
    json={
        'question': 'What is machine learning?',
        'context_limit': 2000,
        'max_sources': 3
    }
)

answer = response.json()
print(f"Answer: {answer['answer']}")
print(f"Sources: {[s['title'] for s in answer['sources']]}")
```

## Document Processing Pipeline

### 1. Ingestion
```python
# File upload và validation
# Text extraction
# Metadata extraction
# Initial processing
```

### 2. Chunking
```python
# Smart text chunking
# Overlap management
# Context preservation
# Size optimization
```

### 3. Embedding
```python
# Vector generation
# Batch processing
# Error handling
# Model management
```

### 4. Storage
```python
# Vector database storage
# Metadata indexing
# File storage
# Relationship mapping
```

## Advanced Features

### 1. Multi-modal Support
- Image processing với OCR
- Table extraction
- Chart analysis
- Handwriting recognition

### 2. Custom Embeddings
- Fine-tuned models
- Domain-specific embeddings
- Multi-lingual support
- Custom training pipelines

### 3. Advanced Search
- Semantic search
- Hybrid search algorithms
- Re-ranking strategies
- Query expansion

### 4. Analytics & Insights
- Document usage analytics
- Search query analysis
- Performance metrics
- User behavior tracking

## Database Migrations

### Create Migration
```bash
alembic revision --autogenerate -m "Add new table"
```

### Apply Migration
```bash
alembic upgrade head
```

### Rollback Migration
```bash
alembic downgrade -1
```

## Testing

### Unit Tests
```bash
pytest tests/unit -v
```

### Integration Tests
```bash
pytest tests/integration -v
```

### API Tests
```bash
pytest tests/api -v
```

## Performance Optimization

### Vector Search Optimization
- Index tuning
- Batch size optimization
- Memory management
- Query caching

### Document Processing
- Parallel processing
- Chunk size tuning
- Model optimization
- Resource allocation

### Database Performance
- Query optimization
- Index strategy
- Connection pooling
- Caching layers

## Security Considerations

### Access Control
- Document-level permissions
- User authentication
- API rate limiting
- Data encryption

### Data Privacy
- PII detection
- Sensitive data handling
- Audit logging
- Compliance requirements

## Monitoring & Logging

### Metrics
- Document processing time
- Search response times
- Storage usage
- Error rates

### Logging
- Structured logging
- Request tracing
- Error tracking
- Performance monitoring

## Troubleshooting

### Common Issues
1. **Vector Database Connection**: Check configuration và connectivity
2. **Document Processing Failures**: Verify file formats và dependencies
3. **Search Performance**: Optimize indexes và query parameters
4. **Memory Issues**: Adjust chunk sizes và batch processing

### Debug Commands
```bash
# Check service health
curl http://localhost:8000/health

# Test database connection
alembic current

# Check Celery tasks
celery -A src.core.celery_app inspect active
```

## Scaling Strategies

### Horizontal Scaling
- Multiple service instances
- Load balancing
- Database sharding
- Distributed vector storage

### Vertical Scaling
- Resource allocation
- Memory optimization
- CPU optimization
- Storage scaling

## Integration Examples

### With Agent Service
```python
# Agent calls knowledge base for context
knowledge_response = requests.post(
    'http://knowledge:8000/search',
    json={'query': user_query, 'limit': 3}
)
context = knowledge_response.json()['documents']
```

### With Dashboard
```python
# Analytics data for dashboard
analytics = requests.get(
    'http://knowledge:8000/analytics/documents'
)
```
