import os
import asyncio
import numpy as np
import sherpa_onnx
from typing import AsyncGenerator
from enum import Enum
import time

# --- PHẦN SỬA ĐỔI (UPDATED IMPORTS) ---

# 1. Sửa đường dẫn import SegmentedSTTService (để hết Warning)
try:
    # Pipecat phiên bản mới
    from pipecat.services.stt_service import SegmentedSTTService
except ImportError:
    # Fallback cho phiên bản cũ (nếu cần)
    from pipecat.services.ai_services import SegmentedSTTService

# 2. Sửa đường dẫn import Frame (để hết lỗi ImportError)
# Trong bản mới, các frame nằm trong pipecat.frames.frames
from pipecat.frames.frames import Frame, TranscriptionFrame, ErrorFrame

from pipecat.transcriptions.language import Language

# ---------------------------------------


class SherpaModel(Enum):
    VIETNAMESE = "vi_zipformer"


class SherpaSTTService(SegmentedSTTService):
    """
    STT Service sử dụng Sherpa-ONNX với model local.
    """

    def __init__(self, *, model: str | SherpaModel = SherpaModel.VIETNAMESE, model_dir: str = ".", device: str = "cpu", sample_rate: int = 16000, **kwargs):
        super().__init__(**kwargs)
        self._sample_rate = sample_rate
        self._device = device
        self._model_dir = model_dir

        print(f"Loading local Sherpa model from: {os.path.abspath(model_dir)}")
        self._recognizer = self._load_local_model()
        print("Sherpa local model loaded successfully.")

    def _load_local_model(self) -> sherpa_onnx.OfflineRecognizer:
        # Tên file khớp với file bạn đang có
        encoder_filename = "encoder-epoch-20-avg-10.int8.onnx"
        decoder_filename = "decoder-epoch-20-avg-10.onnx"
        joiner_filename = "joiner-epoch-20-avg-10.int8.onnx"
        tokens_filename = "config.json"

        encoder_path = os.path.join(self._model_dir, encoder_filename)
        decoder_path = os.path.join(self._model_dir, decoder_filename)
        joiner_path = os.path.join(self._model_dir, joiner_filename)
        tokens_path = os.path.join(self._model_dir, tokens_filename)

        for fpath in [encoder_path, decoder_path, joiner_path, tokens_path]:
            if not os.path.exists(fpath):
                raise FileNotFoundError(f"Không tìm thấy file model: {fpath}")

        recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            tokens=tokens_path,
            encoder=encoder_path,
            decoder=decoder_path,
            joiner=joiner_path,
            num_threads=2,
            sample_rate=self._sample_rate,
            feature_dim=80,
            decoding_method="greedy_search",
        )
        return recognizer

    def can_generate_metrics(self) -> bool:
        return True

    async def set_language(self, language: Language):
        pass

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        try:
            # Chuyển đổi audio PCM 16-bit sang float32
            audio_array = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0

            stream = self._recognizer.create_stream()
            stream.accept_waveform(self._sample_rate, audio_array)

            await asyncio.to_thread(self._recognizer.decode_stream, stream)

            text = stream.result.text.strip()

            if text:
                print(f"STT Output: {text}")
                yield TranscriptionFrame(text, "user", int(time.time() * 1000))

        except Exception as e:
            print(f"Sherpa STT Error: {e}")
            yield ErrorFrame(f"Sherpa STT execution error: {str(e)}")
