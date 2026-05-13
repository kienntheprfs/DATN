#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import os
import sys
import uuid
import json

import aiohttp
from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame, OutputTransportMessageFrame, TranscriptionFrame
import time
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.ollama.llm import OLLamaLLMService
from pipecat.services.piper.tts import PiperTTSService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from agent_llm import DirectAPIAgentLLMService
from zipformer_stt.sherpa_stt import SherpaSTTService
from pipecat.services.cartesia import CartesiaTTSService
import re
from pipecat.services.cartesia.tts import GenerationConfig

load_dotenv(override=True)

AGENT_API_URL = os.getenv("AGENT_API_URL", "http://localhost:8080")
USE_AGENT_API = os.getenv("USE_AGENT_API", "false").lower() == "true"


async def send_tool_message(transport, tool_calls, event_type="tool-started"):
    """Send tool call information to the frontend via RTVI protocol."""
    try:
        msg = {"label": "rtvi-ai", "type": event_type, "data": {"toolCalls": tool_calls}}
        await transport.output().send_message(OutputTransportMessageFrame(message=msg))
    except Exception as e:
        logger.error(f"Failed to send tool message: {e}")


async def send_tool_result_message(transport, tool_call_id, content, tool_name):
    """Send tool result to the frontend via RTVI protocol."""
    try:
        msg = {
            "label": "rtvi-ai",
            "type": "tool-result",
            "data": {"toolCallId": tool_call_id, "toolName": tool_name, "content": content},
        }
        await transport.output().send_message(OutputTransportMessageFrame(message=msg))
    except Exception as e:
        logger.error(f"Failed to send tool result: {e}")


def create_llm(
    session,
    transport,
    agent_id: str = "chatbot",
    user_id: str = "web-user-123",
    thread_id: str | None = None,
    query_mode: str = "normal",
):
    async def on_tool_calls(tool_calls):
        await send_tool_message(transport, tool_calls, "tool-started")

    async def on_tool_result(tool_call_id, content, args):
        tool_name = "Unknown"
        await send_tool_result_message(transport, tool_call_id, content, tool_name)

    if USE_AGENT_API:
        return DirectAPIAgentLLMService(
            api_url=AGENT_API_URL,
            agent_name=agent_id,
            user_id=user_id,
            thread_id=thread_id,
            query_mode=query_mode,
            session=session,
            on_tool_calls=on_tool_calls,
            on_tool_result=on_tool_result,
            transport=transport,
        )
    else:
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
        return OLLamaLLMService(model=model)


def clean_markdown_for_tts(text: str) -> str:
    if not text:
        return text

    # 1. Bỏ các đoạn code block dài (TTS đọc code rất tệ và mất thời gian)
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Bỏ inline code (chỉ bỏ dấu backtick, giữ lại text bên trong)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    
    # 2. Xử lý Image và Link (giữ lại text hiển thị)
    text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r" \1 ", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r" \1 ", text)

    # 3. Xử lý các Block elements (Headers, Quotes, Lists)
    # Headers (# Header)
    text = re.sub(r"^\s*#+\s+", "", text, flags=re.MULTILINE)
    # Blockquotes (> Quote)
    text = re.sub(r"^\s*>\s+", "", text, flags=re.MULTILINE)
    # Lists (-, *, +, \d.) - Xử lý cả khi có thụt lề
    text = re.sub(r"^\s*[\-\*\+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    
    # Horizontal Rules (---, ***, ___)
    text = re.sub(r"^\s*(?:---|\*\*\*|___)\s*$", "", text, flags=re.MULTILINE)

    # 4. Xử lý các Inline elements (Bold, Italic, Strikethrough)
    # Xử lý các cụm dấu sao/gạch dưới lặp lại (ví dụ ***, **, *)
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"_{1,3}(.*?)_{1,3}", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"~~(.*?)~~", r"\1", text, flags=re.DOTALL)

    # 5. Loại bỏ các ký tự Markdown còn sót lại mà TTS hay đọc
    # Xóa các dấu sao, gạch dưới, thăng lẻ loi (không nằm trong từ)
    text = re.sub(r"(^|\s)[\*\#\_\-\+\>]+(\s|$)", r"\1\2", text)
    # Xóa các ký tự đặc biệt ở đầu/cuối câu thường thấy trong MD
    text = re.sub(r"^\s*[\*\#\_\-\+\>]+", "", text)
    text = re.sub(r"[\*\#\_\-\+\>]+\s*$", "", text)

    # 6. Loại bỏ HTML tags
    text = re.sub(r"<[^>]*>", "", text)

    # 7. Dọn dẹp khoảng trắng thừa
    text = re.sub(r"\s+", " ", text)
    
    return text.strip()


def normalize_vietnamese_text(text: str) -> str:
    if not text:
        return text

    # --- THÊM DÒNG NÀY ĐỂ XÓA CHỮ V.V ---
    # Bắt các trường hợp: v.v, v.v., v.v... và thay bằng khoảng trắng
    text = re.sub(r"\bv\.v\.*", "", text, flags=re.IGNORECASE)

    # for pattern, pronun in replacements.items():
    #     text = re.sub(pattern, pronun, text, flags=re.IGNORECASE)

    # Dọn dẹp khoảng trắng thừa lỡ sinh ra sau khi xóa chữ
    text = re.sub(r"\s+", " ", text).strip()

    return text


async def tts_preprocessing(text: str, context_type: str) -> str:
    cleaned_text = clean_markdown_for_tts(text)
    final_text = normalize_vietnamese_text(cleaned_text)
    return final_text


async def run_bot(
    webrtc_connection,
    agent_id: str = "chatbot",
    user_id: str = "web-user-123",
    thread_id: str | None = None,
    query_mode: str = "normal",
    pc_id: str | None = None,
    task_callback=None,
):
    logger.info(
        f"Starting bot with agent_id={agent_id}, user_id={user_id}, thread_id={thread_id}, pc_id={pc_id}"
    )
    
    try:
        pipecat_transport = SmallWebRTCTransport(
            webrtc_connection=webrtc_connection,
            params=TransportParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                audio_out_10ms_chunks=2,
                vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
            ),
        )

        async with aiohttp.ClientSession() as session:
            logger.debug("Initializing STT service...")
            stt = SherpaSTTService(model_dir="./zipformer_stt", model="zipformer", language="vi")
            
            logger.debug("Initializing TTS service...")
            tts = PiperTTSService(
                base_url="http://127.0.0.1:5000",
                aiohttp_session=session,
                sample_rate=24000,
                voice_id="vi_VN-vais1000-medium",
                text_transforms=[("*", tts_preprocessing)],
            )
            
            logger.debug("Initializing LLM service...")
            llm = create_llm(session, pipecat_transport, agent_id, user_id, thread_id, query_mode)

            if USE_AGENT_API:
                system_content = "Bạn là một trợ lý ảo thân thiện và hữu ích. Hãy trả lời ngắn gọn, tự nhiên như đang nói chuyện. Không dùng markdown hay bullet points."
            else:
                system_content = "Bạn là một trợ lý ảo thân thiện và hữu ích. Mục tiêu của bạn là thể hiện khả năng của mình một cách ngắn gọn. Đầu ra của bạn sẽ được nói to, vì vậy hãy tránh các ký tự đặc biệt không thể nói dễ dàng, chẳng hạn như biểu tượng cảm xúc hoặc dấu đầu dòng. Hãy sáng tạo và hữu ích trong phản hồi của bạn đối với những gì người dùng đã nói."

            messages = [{"role": "system", "content": system_content}]
            context = LLMContext(messages)

            async def on_app_message(transport, message, *args):
                logger.info(f"Received app message from client: {message}")
                msg_type = message.get("type")
                msg_data = message.get("data", {})
                
                if msg_type == "chat-text":
                    text = msg_data.get("text")
                    if text:
                        logger.info(f"Directly injecting user text: {text}")
                        # Directly append to history and trigger LLM
                        context.messages.append({"role": "user", "content": text})
                        await task.queue_frames([LLMRunFrame()])
                
                elif msg_type == "update-agent":
                    new_agent_id = msg_data.get("agent_id")
                    new_thread_id = msg_data.get("thread_id")
                    
                    if new_agent_id:
                        llm.agent_name = new_agent_id
                    if new_thread_id:
                        llm.thread_id = new_thread_id
                    
                    await task.queue_frames([LLMRunFrame()])

            pipecat_transport.add_event_handler("on_app_message", on_app_message)
            context = LLMContext(messages)
            user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
                context,
                user_params=LLMUserAggregatorParams(
                    user_turn_strategies=UserTurnStrategies(
                        stop=[
                            TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3())
                        ]
                    ),
                ),
            )

            pipeline = Pipeline(
                [
                    pipecat_transport.input(),
                    stt,
                    user_aggregator,
                    llm,
                    tts,
                    pipecat_transport.output(),
                    assistant_aggregator,
                ]
            )

            task = PipelineTask(
                pipeline,
                params=PipelineParams(
                    enable_metrics=True,
                    enable_usage_metrics=True,
                ),
            )

            if task_callback and pc_id:
                logger.info(f"Registering task for pc_id: {pc_id}")
                await task_callback(pc_id, task)

            logger.info("Bot pipeline ready, sending intro message...")
            messages.append({"role": "system", "content": "Hãy tự giới thiệu bản thân với người dùng."})
            await task.queue_frames([LLMRunFrame()])

            runner = PipelineRunner(handle_sigint=False)
            logger.info("Starting pipeline runner...")
            await runner.run(task)
            logger.info("Pipeline runner finished normally.")
            
    except Exception as e:
        logger.error(f"!!! CRITICAL ERROR in run_bot: {e}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        if task_callback and pc_id:
            logger.info(f"Cleaning up session for pc_id: {pc_id}")
            await task_callback(pc_id, None)
        logger.info(f"Bot session for {pc_id} has ended.")
