#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import sys
import uuid
from dotenv import load_dotenv
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
from agent_llm import DirectAPIAgentLLMService

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

# Store active tasks for text injection: id -> PipelineTask
active_tasks = {}

async def task_callback(session_id: str, task):
    """Callback to register/unregister active bot tasks."""
    session_id = str(session_id)
    if task:
        active_tasks[session_id] = task
        logger.info(f"Session {session_id} registered.")
    else:
        if session_id in active_tasks:
            del active_tasks[session_id]
            logger.info(f"Session {session_id} unregistered.")

@app.post("/api/offer")
async def offer(req: Request, background_tasks: BackgroundTasks):
    """Handle WebRTC offer requests."""
    try:
        body = await req.json()
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

    logger.info(f"Incoming voice offer: agent_id={agent_id}, user_id={user_id}, thread_id={thread_id}")

    async def webrtc_connection_callback(connection):
        # We use connection.id as the session identifier
        session_id = str(connection.id)
        background_tasks.add_task(
            run_bot,
            connection,
            agent_id,
            user_id,
            thread_id,
            query_mode,
            session_id,
            task_callback,
        )

    answer = await small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=webrtc_connection_callback,
    )
    
    logger.info(f"Sent answer for pc_id: {answer.get('pc_id')}")
    return answer

@app.patch("/api/offer")
async def ice_candidate(req: Request):
    """Handle ICE candidate patch requests."""
    try:
        body = await req.json()
        pc_id = body.get("pc_id")
        candidates_data = body.get("candidates", [])
        
        from pipecat.transports.smallwebrtc.request_handler import IceCandidate, SmallWebRTCPatchRequest
        
        candidates = [
            IceCandidate(
                candidate=c.get("candidate"),
                sdp_mid=c.get("sdp_mid"),
                sdp_mline_index=c.get("sdp_mline_index")
            ) for c in candidates_data
        ]
            
        request = SmallWebRTCPatchRequest(pc_id=pc_id, candidates=candidates)
        
        # Simple validation
        valid_candidates = [c for c in request.candidates if c.candidate and len(c.candidate.split(":")) >= 8]
        if not valid_candidates:
            return {"status": "skipped"}
            
        request.candidates = valid_candidates
        await small_webrtc_handler.handle_patch_request(request)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to process ICE candidate patch: {e}")
        return JSONResponse({"error": str(e)}, status_code=400)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "active_sessions": len(active_tasks)
    }

@app.post("/api/chat/text")
async def chat_text(req: Request):
    """Inject text into an active pipeline (Legacy/Fallback)."""
    try:
        body = await req.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    message = body.get("message", "")
    pc_id = str(body.get("pc_id", ""))
    new_agent_id = body.get("agent_id")
    new_thread_id = body.get("thread_id")

    # Try to find task by ID
    task = active_tasks.get(pc_id)
    
    # Fuzzy match if not found (internal vs external IDs often differ in smallwebrtc)
    if not task:
        for k, v in active_tasks.items():
            if pc_id.endswith(str(k)) or str(k).endswith(pc_id):
                task = v
                break
    
    if task:
        # Update agent settings if provided
        for processor in task.pipeline.processors:
            if isinstance(processor, DirectAPIAgentLLMService):
                if new_agent_id:
                    processor.set_agent_name(new_agent_id)
                if new_thread_id:
                    processor.set_thread_id(new_thread_id)
        
        # Inject message if provided
        if message:
            await task.queue_frames([TranscriptionFrame(text=message, user_id="user")])
        else:
            await task.queue_frames([LLMRunFrame()])
            
        return {"status": "success"}
    
    return JSONResponse({"error": "Session not found"}, status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
