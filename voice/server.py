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
async def offer(request: SmallWebRTCRequest, background_tasks: BackgroundTasks, req: Request):
    """Handle WebRTC offer requests via SmallWebRTCRequestHandler."""

    # Extract agent_id and user_id from request_data if provided
    agent_id = "chatbot"
    user_id = "web-user-123"

    request_data = getattr(request, "request_data", None)
    if request_data:
        agent_id = request_data.get("agent_id", agent_id)
        user_id = request_data.get("user_id", user_id)

    # Prepare runner arguments with the callback to run your bot
    async def webrtc_connection_callback(connection):
        background_tasks.add_task(run_bot, connection, agent_id, user_id)

    # Delegate handling to SmallWebRTCRequestHandler
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
