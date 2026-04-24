#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

import asyncio
import os
import sys
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

# from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.piper.tts import PiperTTSService

# from pipecat.services.deepgram.stt import DeepgramSTTService
# from pipecat.services.whisper.stt import WhisperSTTService
from zipformer_stt.sherpa_stt import SherpaSTTService

# from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.ollama.llm import OLLamaLLMService
from pipecat.transports.local.audio import LocalAudioTransport, LocalAudioTransportParams
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies

load_dotenv(override=True)

logger.remove(0)
logger.add(sys.stderr, level="DEBUG")


async def main():
    transport = LocalAudioTransport(
        LocalAudioTransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        )
    )

    async with aiohttp.ClientSession() as session:
        # stt = WhisperSTTService()
        stt = SherpaSTTService(model_dir="./zipformer_stt")

        tts = PiperTTSService(base_url="http://localhost:5000", aiohttp_session=session, sample_rate=24000, voice_id="vi_VN-vais1000-medium")

        llm = OLLamaLLMService(model="qwen2.5:7b")

        messages = [
            {
                "role": "system",
                "content": "Bạn là một trợ lý ảo thân thiện và hữu ích. Mục tiêu của bạn là thể hiện khả năng của mình một cách ngắn gọn. Đầu ra của bạn sẽ được nói to, vì vậy hãy tránh các ký tự đặc biệt không thể nói dễ dàng, chẳng hạn như biểu tượng cảm xúc hoặc dấu đầu dòng. Hãy sáng tạo và hữu ích trong phản hồi của bạn đối với những gì người dùng đã nói.",
                # "content": "You are a helpful LLM. Your goal is to demonstrate your capabilities in a succinct way. Your output will be spoken aloud, so avoid special characters that can't easily be spoken, such as emojis or bullet points. Respond to what the user said in a creative and helpful way.",
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
                transport.input(),  # Transport user input
                stt,
                user_aggregator,  # User responses
                llm,  # LLM
                tts,  # TTS
                transport.output(),  # Transport bot output
                assistant_aggregator,  # Assistant spoken responses
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
        #  "content": "Please introduce yourself to the user."})
        await task.queue_frames([LLMRunFrame()])

        runner = PipelineRunner()

        await runner.run(task)


if __name__ == "__main__":
    asyncio.run(main())
