"""Mock SSE server for validating token-by-token streaming through API Gateway.

Run:
  uv run python scripts/mock_sse_server.py

Then point APISIX AGENT_UPSTREAM_ADDR to this mock server and test via gateway.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import uvicorn
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse


app = FastAPI(title="Mock SSE Agent Service", version="0.1.0")


def _build_long_text(base_text: str, repeat: int) -> str:
    parts = [base_text.strip()] * max(1, repeat)
    return " ".join(parts)


def _split_tokens(text: str, mode: str) -> list[str]:
    if mode == "char":
        return list(text)
    return text.split()


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "mock-sse"})


@app.post("/stream")
async def stream_agent_response(
    request: Request,
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
) -> StreamingResponse:
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    base_text = body.get(
        "text",
        "day la mot chuoi rat dai de test sse token by token qua api gateway",
    )
    repeat = int(body.get("repeat", 120))
    mode = str(body.get("mode", "word")).lower()
    delay_sec = float(body.get("delay_sec", 0.05))

    long_text = _build_long_text(base_text, repeat)
    tokens = _split_tokens(long_text, mode=mode)

    async def event_generator() -> Any:
        meta = {
            "token_count": len(tokens),
            "mode": mode,
            "delay_sec": delay_sec,
            "has_internal_secret": bool(x_internal_secret),
        }
        yield f"event: meta\ndata: {json.dumps(meta, ensure_ascii=True)}\n\n"

        for index, token in enumerate(tokens, start=1):
            payload = {"index": index, "token": token}
            yield f"event: token\ndata: {json.dumps(payload, ensure_ascii=True)}\n\n"
            await asyncio.sleep(delay_sec)

        done = {"done": True, "token_count": len(tokens)}
        yield f"event: done\ndata: {json.dumps(done, ensure_ascii=True)}\n\n"

    # headers = {
    #     "Cache-Control": "no-cache",
    #     "Connection": "keep-alive",
    #     "X-Accel-Buffering": "no",
    # }
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        # headers=headers,
    )


if __name__ == "__main__":
    host = os.getenv("MOCK_SSE_HOST", "127.0.0.1")
    port = int(os.getenv("MOCK_SSE_PORT", "8080"))
    uvicorn.run("mock_sse_server:app", host=host, port=port, reload=True)
