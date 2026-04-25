cd LightRAG

uv sync --extra test --extra offline
.venv\Scripts\activate

- Build front-end artifacts

cd lightrag_webui
bun install --frozen-lockfile
bun run build

- Run server
  cd ..
  uv run lightrag-server
