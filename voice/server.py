#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import argparse
import sys
from contextlib import asynccontextmanager

import uvicorn
import uuid
from dotenv import load_dotenv
from datetime import datetime
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from loguru import logger
from pipecat.frames.frames import LLMRunFrame, TranscriptionFrame
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

# Store active tasks for text injection: pc_id -> PipelineTask
active_tasks = {}


async def task_callback(pc_id: str, task):
    if task:
        active_tasks[pc_id] = task
        logger.info(f"Registered active task for pc_id: {pc_id}")
    else:
        if pc_id in active_tasks:
            del active_tasks[pc_id]
            logger.info(f"Unregistered task for pc_id: {pc_id}")


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
    user_id = f"guest-{uuid.uuid4().hex[:8]}"
    thread_id = None
    query_mode = "normal"

    request_data = request.request_data
    if request_data:
        agent_id = request_data.get("agent_id", agent_id)
        provided_user_id = request_data.get("user_id")
        if provided_user_id and provided_user_id != "guest":
            user_id = provided_user_id
        thread_id = request_data.get("thread_id")
        query_mode = request_data.get("query_mode", "normal")

    logger.info(
        f"Voice offer: agent_id={agent_id}, user_id={user_id}, thread_id={thread_id}, query_mode={query_mode}"
    )

    async def webrtc_connection_callback(connection):
        background_tasks.add_task(
            run_bot,
            connection,
            agent_id,
            user_id,
            thread_id,
            query_mode,
            connection.id,
            task_callback,
        )

    answer = await small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=webrtc_connection_callback,
    )
    return answer


@app.patch("/api/offer")
async def ice_candidate(req: Request):
    """Handle ICE candidate patch requests."""
    try:
        body = await req.json()
        logger.debug(f"Received patch body: {body}")
        
        pc_id = body.get("pc_id")
        candidates_data = body.get("candidates", [])
        
        from pipecat.transports.smallwebrtc.request_handler import IceCandidate, SmallWebRTCPatchRequest
        
        candidates = []
        for c in candidates_data:
            candidates.append(IceCandidate(
                candidate=c.get("candidate"),
                sdp_mid=c.get("sdp_mid"),
                sdp_mline_index=c.get("sdp_mline_index")
            ))
            
        request = SmallWebRTCPatchRequest(pc_id=pc_id, candidates=candidates)
        
        valid_candidates = [
            c for c in request.candidates if c.candidate and len(c.candidate.split(":")) >= 8
        ]
        if not valid_candidates:
            logger.warning(f"Skipping invalid ICE candidates")
            return {"status": "skipped"}
            
        request.candidates = valid_candidates
        await small_webrtc_handler.handle_patch_request(request)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to process ICE candidate patch: {e}")
        return JSONResponse({"error": str(e)}, status_code=400)


@app.get("/")
async def serve_index():
    return FileResponse("index.html")


@app.post("/api/chat/text")
async def chat_text(req: Request):
    """Inject text into an active pipeline or update agent settings."""
    try:
        body = await req.json()
    except Exception as e:
        logger.error(f"Failed to parse request: {e}")
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    pc_id = body.get("pc_id")
    user_id = body.get("user_id", "guest")
    new_agent_id = body.get("agent_id")
    new_thread_id = body.get("thread_id")

    logger.info(f"Received text chat request for pc_id {pc_id}. Msg: '{message}', Agent: {new_agent_id}, Thread: {new_thread_id}")

    if pc_id:
        task = active_tasks.get(pc_id)
        
        # Fallback: If not found exactly, try to find by suffix (case where prefix might differ)
        if not task:
            for active_id, active_task in active_tasks.items():
                if pc_id.endswith(active_id) or active_id.endswith(pc_id):
                    logger.info(f"Matched session {pc_id} via fallback to {active_id}")
                    task = active_task
                    pc_id = active_id # Use the registered ID
                    break
        
        if task:
            # Update agent settings if provided
            from agent_llm import DirectAPIAgentLLMService
            for processor in task.pipeline.processors:
                if isinstance(processor, DirectAPIAgentLLMService):
                    if new_agent_id:
                        processor.set_agent_name(new_agent_id)
                        logger.info(f"Updated agent for session {pc_id} to {new_agent_id}")
                    if new_thread_id:
                        processor.set_thread_id(new_thread_id)
                        logger.info(f"Updated thread for session {pc_id} to {new_thread_id}")
                    break

            # Push TranscriptionFrame only if there is a message
            if message.strip():
                logger.info(f"Injecting transcription frame for session {pc_id}: {message}")
                await task.queue_frames(
                    [
                        TranscriptionFrame(
                            text=message, user_id=user_id, timestamp=datetime.now().isoformat(), finalized=True
                        ),
                        LLMRunFrame(),
                    ]
                )
            
            return JSONResponse({"status": "ok", "agent_id": new_agent_id, "message": "Cấu hình/Tin nhắn đã được xử lý."})

    logger.warning(f"Session {pc_id} not found. Active sessions: {list(active_tasks.keys())}")
    return JSONResponse(
        {
            "status": "error",
            "message": f"Không tìm thấy phiên voice hoạt động (pc_id: {pc_id}). Đang có {len(active_tasks)} phiên.",
        },
        status_code=404
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
