#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import os
import sys
import uuid

import aiohttp
from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame
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

load_dotenv(override=True)

logger.remove(0)
logger.add(sys.stderr, level="DEBUG")

# Agent API configuration
AGENT_API_URL = os.getenv("AGENT_API_URL", "http://localhost:8080")
USE_AGENT_API = os.getenv("USE_AGENT_API", "false").lower() == "true"


def create_llm(session):
    """Create LLM service based on configuration."""
    if USE_AGENT_API:
        return DirectAPIAgentLLMService(
            api_url=AGENT_API_URL,
            agent_name=os.getenv("AGENT_ID", "chatbot"),
            user_id="web-user-123",
            session=session,
        )
    else:
        model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
        return OLLamaLLMService(model=model)


async def run_bot(webrtc_connection):
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
        tts = PiperTTSService(
            base_url="http://localhost:5000",
            aiohttp_session=session,
            sample_rate=24000,
            voice_id="vi_VN-vais1000-medium",
        )
        llm = create_llm(session)

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
