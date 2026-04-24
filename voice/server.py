#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import argparse
import sys
from contextlib import asynccontextmanager

import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from loguru import logger
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from bot import run_bot

# Load environment variables
load_dotenv(override=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the SmallWebRTC request handler
small_webrtc_handler: SmallWebRTCRequestHandler = SmallWebRTCRequestHandler()


@app.post("/api/offer")
async def offer(req: Request, background_tasks: BackgroundTasks):
    """Handle WebRTC offer requests - parse manually to debug."""
    try:
        body = await req.json()
        logger.info(f"Raw request body: {body}")
    except Exception as e:
        logger.error(f"Failed to parse request: {e}")
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # Extract params
    request = SmallWebRTCRequest.from_dict(body)

    agent_id = "chatbot"
    user_id = "web-user-123"
    thread_id = None
    query_mode = "normal"

    request_data = request.request_data
    if request_data:
        agent_id = request_data.get("agent_id", agent_id)
        user_id = request_data.get("user_id", user_id)
        thread_id = request_data.get("thread_id")
        query_mode = request_data.get("query_mode", "normal")

    logger.info(
        f"Voice offer: agent_id={agent_id}, user_id={user_id}, thread_id={thread_id}, query_mode={query_mode}"
    )

    async def webrtc_connection_callback(connection):
        background_tasks.add_task(run_bot, connection, agent_id, user_id, thread_id, query_mode)

    answer = await small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=webrtc_connection_callback,
    )
    return answer


@app.patch("/api/offer")
async def ice_candidate(request: SmallWebRTCPatchRequest):
    logger.debug(f"Received patch request: {request}")
    valid_candidates = [
        c for c in request.candidates if c.candidate and len(c.candidate.split(":")) >= 8
    ]
    if not valid_candidates:
        logger.warning(f"Skipping invalid ICE candidates")
        return {"status": "skipped"}
    request.candidates = valid_candidates
    await small_webrtc_handler.handle_patch_request(request)
    return {"status": "success"}


@app.get("/")
async def serve_index():
    return FileResponse("index.html")


@app.post("/api/chat/text")
async def chat_text(req: Request):
    """Simple text chat endpoint for Expo Go testing."""
    try:
        body = await req.json()
    except Exception as e:
        logger.error(f"Failed to parse request: {e}")
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    agent_id = body.get("agent_id", "chatbot")
    user_id = body.get("user_id", "guest")

    logger.info(f"Text chat: agent_id={agent_id}, user_id={user_id}, message={message[:100]}")

    return JSONResponse(
        {
            "status": "ok",
            "message": f"Test response: Tôi nhận được tin nhắn '{message}'. Đây là endpoint test cho Expo Go.",
        }
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # Run app
    await small_webrtc_handler.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC demo")
    parser.add_argument(
        "--host", default="localhost", help="Host for HTTP server (default: localhost)"
    )
    parser.add_argument(
        "--port", type=int, default=7860, help="Port for HTTP server (default: 7860)"
    )
    parser.add_argument("--verbose", "-v", action="count")
    args = parser.parse_args()

    try:
        logger.remove(0)
    except ValueError:
        pass
    if args.verbose:
        logger.add(sys.stderr, level="TRACE")
    else:
        logger.add(sys.stderr, level="DEBUG")

    uvicorn.run(app, host=args.host, port=args.port)
