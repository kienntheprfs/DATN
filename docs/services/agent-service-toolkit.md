# Agent Service Toolkit

## Tổng quan
Agent Service Toolkit là một framework hoàn chỉnh để xây dựng và chạy AI agents sử dụng LangGraph, FastAPI và Streamlit. Service cung cấp nền tảng để tạo các AI agents với khả năng reasoning, tool usage, và human-in-the-loop interactions.

## Công nghệ
- **LangGraph**: Framework for building AI agents
- **FastAPI**: REST API service
- **Streamlit**: Web interface cho chat
- **Pydantic**: Data validation and settings
- **PostgreSQL**: Database cho agent state và conversations
- **Docker**: Containerization
- **UV**: Package manager

## Port và Endpoint
- **FastAPI Service**: Port 8080
- **Streamlit App**: Port 8501
- **PostgreSQL**: Port 5432

## Architecture

### Core Components
1. **Agents** (`src/agents/`): Định nghĩa các loại agents khác nhau
2. **Service** (`src/service/service.py`): FastAPI endpoints
3. **Client** (`src/client/client.py`): Client library để interact với service
4. **Streamlit App** (`src/streamlit_app.py`): UI cho chat interface
5. **Schema** (`src/schema/`): Protocol definitions
6. **Core** (`src/core/`): LLM definitions và settings

## Features

### 1. Multiple Agent Support
- Research Assistant
- Chatbot
- RAG Assistant
- **Map Agent** (Indoor Wayfinding)
- Custom agents

### 2. Advanced Streaming
- Token-based streaming
- Message-based streaming
- Real-time responses

### 3. Human-in-the-Loop
- Interrupt capability
- Command-based flow control
- Long-term memory với Store

### 4. Content Moderation
- LlamaGuard integration
- Groq API support

### 5. Feedback System
- Star-based rating
- LangSmith integration
- Performance analytics

## Cấu hình chính

### Environment Variables
```env
# LLM Providers
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GROQ_API_KEY=your_groq_api_key

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_api_key

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentdb

# Development
DEBUG=true
TEST_MODE=false
```

### Database Schema
- Conversations: Chat histories
- Agent states: Memory và context
- Feedback: User ratings và comments
- Checkpoints: Agent execution states

## API Endpoints

### Core Endpoints
- `POST /{agent_name}/invoke`: Single request/response
- `POST /{agent_name}/stream`: Streaming responses
- `GET /info`: Available agents và models
- `GET /health`: Service health check

### Agent-specific Endpoints
- `/research_assistant/*`: Research tasks
- `/chatbot/*`: General conversation
- `/rag_assistant/*`: Document-based Q&A

## Cách chạy

### Với Docker Compose (Recommended)
```bash
cd agent-service-toolkit
# Create .env from .env.example
cp .env.example .env
# Edit .env with your API keys

# Start services with hot reload
docker compose watch
```

### Local Development
```bash
# Install dependencies
uv sync --frozen
source .venv/bin/activate

# Run FastAPI service
python src/run_service.py

# In another terminal, run Streamlit
streamlit run src/streamlit_app.py
```

## Custom Agents

### Creating New Agent
1. Copy existing agent template:
```bash
cp src/agents/research_assistant.py src/agents/my_agent.py
```

2. Modify agent logic trong `my_agent.py`

3. Register agent trong `src/agents/agents.py`:
```python
from .my_agent import my_agent

agents = {
    "my_agent": my_agent,
    # ... other agents
}
```

4. Update Streamlit interface nếu cần

### Agent Architecture
```python
# Basic agent structure
def create_agent():
    # Define tools
    tools = [...]
    
    # Create agent with LangGraph
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=state_modifier,
    )
    
    return agent
```

## Logic Xử lý Navigation (Map Agent)

Hệ thống Map Agent (định nghĩa tại `src/agents/agent_map.py`) được thiết kế đặc biệt để giải quyết bài toán chỉ đường trong không gian nội thất (indoor), nơi người dùng thường gặp khó khăn trong việc xác định vị trí hiện tại.

### 1. Quy trình Xác nhận Điểm xuất phát

Để đảm bảo tính chính xác, Agent tuân thủ quy trình nghiêm ngặt:
- **Bắt buộc xác nhận**: Agent không được gọi công cụ tìm đường (`FindRoute`) cho đến khi xác định được cả **Điểm đi** và **Điểm đến** cụ thể.
- **Xử lý thông tin chung chung**: Nếu người dùng nói "Tôi đang ở đây" hoặc "Đi từ chỗ này", Agent sẽ từ chối và yêu cầu một cái tên cụ thể hoặc mô tả cảnh vật.

### 2. Các phương pháp hỗ trợ người dùng nhận diện vị trí

Nếu người dùng không biết tên địa điểm hoặc tầng mình đang đứng, Agent cung cấp 2 giải pháp:

| Phương pháp | Công cụ sử dụng | Cách hoạt động |
| :--- | :--- | :--- |
| **Mô tả cảnh vật** | `GuessLocationByDescription` | Người dùng mô tả những gì họ thấy (VD: "Có cái biển báo đỏ", "Gần thang máy..."). Agent sử dụng fuzzy matching để gợi ý các node phù hợp. |
| **Nhận diện qua hình ảnh** | `GetLandmarkImages` | Agent trả về danh sách các hình ảnh thực tế của các địa điểm nổi bật (landmarks) trong khu vực để người dùng chọn. |

### 3. Xử lý sự mơ hồ (Ambiguity)

- **Gợi ý lựa chọn**: Khi có nhiều địa điểm trùng tên hoặc gần giống nhau, Agent sẽ liệt kê các lựa chọn kèm thông tin Tầng/Tòa nhà.
- **Định danh chính xác (ID tracking)**: Sau khi người dùng xác nhận, Agent sẽ lưu vết ID của địa điểm (`[ID: ...]`). Trong các bước gọi công cụ tiếp theo, Agent ưu tiên truyền `from_node_id` hoặc `to_node_id` để tránh việc phải hỏi lại người dùng.

### 4. Kết hợp Sự kiện và Navigation

Agent có khả năng kết nối thông tin từ sự kiện (`SearchEvents`) với bản đồ. Nếu một sự kiện được tìm thấy và có thông tin vị trí trong database, Agent sẽ chủ động đề xuất chỉ đường từ vị trí của người dùng đến địa điểm diễn ra sự kiện đó.

### 5. Chi tiết tích hợp kỹ thuật (Technical Integration)

Map Agent tương tác với Wayfinder Service thông qua các endpoint API sau:

- **Routing Engine**: Gọi `/api/find` với `start_node_id` và `end_node_id`. Kết quả trả về bao gồm polyline tổng, danh sách map liên quan và hướng dẫn di chuyển chi tiết.
- **Fuzzy Search & Alias**: Sử dụng `/api/aliases/search` để tìm kiếm địa điểm theo tên hoặc biệt danh (alias). Hệ thống sử dụng `RapidFuzz` để xử lý các biến thể của tên.
- **Phản hồi từ người dùng (Feedback Loop)**: 
    - Nếu không tìm thấy địa điểm: Agent gọi `ReportMissingLocation`.
    - Nếu không tìm thấy đường đi: Agent gọi `ReportMissingRoute`.
    Dữ liệu này được lưu vào bảng `missing_locations` và `missing_routes` để Admin cập nhật dữ liệu bản đồ.

## Integration Examples

### Using AgentClient
```python
from src.client.client import AgentClient

client = AgentClient(base_url="http://localhost:8080")

# Simple invocation
response = client.invoke("Tell me a joke")
response.pretty_print()

# Streaming
for chunk in client.stream("Explain quantum computing"):
    print(chunk.content, end="")
```

### Building Custom Frontend
```python
import requests

# Chat with specific agent
response = requests.post(
    "http://localhost:8080/research_assistant/invoke",
    json={"message": "Research renewable energy trends"}
)
```

## Testing

### Unit Tests
```bash
pytest tests/unit -q
```

### Integration Tests
```bash
pytest tests/integration -q
```

### E2E Tests
```bash
export AGENT_RUN_E2E="1"
export AGENT_E2E_BASE_URL="http://localhost:8080"
pytest tests/e2e -q
```

## Development Tools

### LangGraph Studio
```bash
# Install langgraph-cli
uv add "langgraph-cli[inmem]"

# Run studio
langgraph dev
```

### Database Migrations
```bash
# Run migrations
uv run alembic upgrade head

# Create new migration
uv run alembic revision --autogenerate -m "Description"
```

## Performance Optimization

### Memory Management
- Conversation context limits
- State compression
- Checkpoint pruning

### Caching
- Response caching
- Tool result caching
- Model inference caching

### Scaling
- Horizontal scaling với multiple instances
- Load balancing considerations
- Database connection pooling

## Security Considerations

### API Security
- API key management
- Request validation
- Rate limiting

### Data Privacy
- PII detection và handling
- Data encryption at rest
- Audit logging

## Troubleshooting

### Common Issues
1. **LLM API Errors**: Check API keys và rate limits
2. **Database Connection**: Verify PostgreSQL configuration
3. **Memory Issues**: Adjust context window sizes
4. **Streaming Problems**: Check client connection handling

### Debug Commands
```bash
# Check service health
curl http://localhost:8080/health

# View available agents
curl http://localhost:8080/info

# Check database
docker exec -it agent_service_postgres psql -U postgres -d agentdb
```

## Monitoring

### Metrics
- Response times
- Token usage
- Error rates
- User feedback scores

### Logging
- Structured logging với correlation IDs
- Performance tracing với LangSmith
- Error tracking và alerting

## Deployment

### Production Considerations
- Environment-specific configurations
- Health checks và readiness probes
- Graceful shutdown handling
- Resource limits và scaling policies

### Docker Production
```bash
# Build production image
docker build -t agent-service:prod .

# Run with production settings
docker run -d --name agent-service \
  -p 8080:8080 \
  -e DATABASE_URL=$DATABASE_URL \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  agent-service:prod
```
