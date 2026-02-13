# Cách chạy repo
Dịch vụ quản lý tri thức
- `cd knowledge`
- Tải đầy đủ theo `requirements.txt`
- Thêm `.env`
- `uvicorn src.main:app --reload --port 8000`
---
Chatbot backend
- `cd agent-service-toolkit`
- Tải đầy đủ theo `pyproject.toml`
- Thêm `.env`
- `python src/run_service.py`

Chatbot UI
- `streamlit run src/streamlit_app.py`

API Gateway
- cài đặt package: `cd api_gateway; uv sync`
- chạy migration (nếu có): `cd api_gateway; uv run alembic upgrade head`
- chạy: `cd api_gateway; docker compose up -d; uv run uvicorn src.main:app --reload --port 8002`
