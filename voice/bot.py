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
from pipecat.frames.frames import LLMRunFrame, OutputTransportMessageFrame
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
            session=session,
            on_tool_calls=on_tool_calls,
            on_tool_result=on_tool_result,
        )
    else:
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
        return OLLamaLLMService(model=model)


def clean_markdown_for_tts(text: str) -> str:
    if not text:
        return text

    # Bỏ các đoạn code block dài (TTS đọc code rất tệ và mất thời gian)
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Bỏ inline code (chỉ bỏ dấu backtick, giữ lại text bên trong)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Bỏ các dấu in đậm, in nghiêng (**text**, *text*, __text__, _text_)
    text = re.sub(r"[*_]{1,2}([^*_]+)[*_]{1,2}", r"\1", text)
    # Xử lý link: [Tên Link](URL) -> Chỉ giữ lại phần "Tên Link" để đọc
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    # Bỏ các ký tự Header (#)
    text = re.sub(r"#+\s*", "", text)
    # Bỏ các dấu gạch đầu dòng, dấu sao hoặc số thứ tự ở đầu dòng
    text = re.sub(r"^[\-\*\+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)

    # Xóa khoảng trắng thừa và ký tự > của blockquote
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
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
):
    logger.info(f"Starting bot with agent_id={agent_id}, user_id={user_id}, thread_id={thread_id}")
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
        stt = SherpaSTTService(model_dir="./zipformer_stt")
        # tts = CartesiaTTSService(
        #     api_key=os.getenv("CARTESIA_API_KEY"),
        #     # Áp dụng hàm tiền xử lý cho tất cả text (*) đi qua
        #     text_transforms=[("*", tts_preprocessing)],
        #     settings=CartesiaTTSService.Settings(
        #         voice="0e58d60a-2f1a-4252-81bd-3db6af45fb41",  # Thay ID giọng tiếng Việt của bạn vào đây
        #         model="sonic-3",  # Bắt buộc dùng sonic-3 để config hoạt động tốt nhất
        #         language="vi",
        #         generation_config=GenerationConfig(volume=1.8, speed=1.0),  # Khuếch đại âm lượng (Giới hạn cho phép từ 0.5 đến 2.0)  # Tốc độ đọc (Giới hạn từ 0.6 đến 1.5)
        #     ),
        # )
        tts = PiperTTSService(
            base_url="http://localhost:5000",
            aiohttp_session=session,
            sample_rate=24000,
            voice_id="vi_VN-vais1000-medium",
            text_transforms=[("*", tts_preprocessing)],
        )
        llm = create_llm(session, pipecat_transport, agent_id, user_id, thread_id)

        if USE_AGENT_API:
            system_content = "Bạn là một trợ lý ảo thân thiện và hữu ích. Hãy trả lời ngắn gọn, tự nhiên như đang nói chuyện. Không dùng markdown hay bullet points."
        else:
            system_content = "Bạn là một trợ lý ảo thân thiện và hữu ích. Mục tiêu của bạn là thể hiện khả năng của mình một cách ngắn gọn. Đầu ra của bạn sẽ được nói to, vì vậy hãy tránh các ký tự đặc biệt không thể nói dễ dàng, chẳng hạn như biểu tượng cảm xúc hoặc dấu đầu dòng. Hãy sáng tạo và hữu ích trong phản hồi của bạn đối với những gì người dùng đã nói."

        messages = [
            {
                "role": "system",
                "content": system_content,
            },
        ]

        context = LLMContext(messages)
        user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
            context,
            user_params=LLMUserAggregatorParams(
                user_turn_strategies=UserTurnStrategies(stop=[TurnAnalyzerUserTurnStopStrategy(turn_analyzer=LocalSmartTurnAnalyzerV3())]),
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

        messages.append({"role": "system", "content": "Hãy tự giới thiệu bản thân với người dùng."})
        await task.queue_frames([LLMRunFrame()])

        runner = PipelineRunner(handle_sigint=False)

        await runner.run(task)
