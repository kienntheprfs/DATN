# Voice Service

## Tổng quan
Voice Service cung cấp khả năng xử lý giọng nói cho hệ thống chatbot, bao gồm Speech-to-Text (STT) và Text-to-Speech (TTS). Service sử dụng các mô hình AI hiện đại để chuyển đổi giọng nói thành văn bản và ngược lại, cho phép tương tác bằng giọng nói với chatbot.

## Công nghệ
- **Sherpa-ONNX**: Next-gen Kaldi STT framework
- **Gradio**: Web interface cho STT demo
- **PyTorch**: Deep learning framework
- **Torchaudio**: Audio processing
- **FFmpeg**: Audio conversion
- **Piper TTS**: Neural text-to-speech
- **Python**: Core service logic

## Port và Endpoint
- **STT Service**: 7860 (Gradio interface)
- **TTS Service**: 7861 (Piper TTS server)
- **Bot Service**: Custom port cho voice bot

## Architecture

### Core Components
1. **STT Module** (`zipformer_stt/`): Speech-to-Text processing
2. **TTS Module** (`piper_tts/`): Text-to-Speech synthesis
3. **Bot Integration** (`bot.py`, `agent_llm.py`): Voice bot logic
4. **Audio Processing** (`server.py`): Audio streaming và processing

### STT Architecture (ZipFormer)
- **Model Loading**: Pre-trained ASR models
- **Audio Preprocessing**: Format conversion và normalization
- **Decoding**: Multiple decoding strategies
- **Post-processing**: Punctuation và formatting

### TTS Architecture (Piper)
- **Text Processing**: Text normalization và phonemization
- **Neural Synthesis**: High-quality voice generation
- **Audio Streaming**: Real-time audio output
- **Voice Management**: Multiple voice support

## Features

### Speech-to-Text (STT)
- **Multiple Languages**: English, Chinese, Vietnamese, etc.
- **High Accuracy**: State-of-the-art ASR models
- **Real-time Processing**: Streaming transcription
- **Multiple Input Sources**: Microphone, file upload, URL
- **Format Support**: WAV, MP3, FLAC, etc.

### Text-to-Speech (TTS)
- **Natural Voices**: Neural TTS với human-like quality
- **Multiple Voices**: Different voice options
- **Fast Synthesis**: Low latency generation
- **Streaming Output**: Real-time audio streaming
- **Custom Voices**: Voice cloning capabilities

### Voice Bot Integration
- **Full-duplex**: Simultaneous STT và TTS
- **Context Awareness**: Maintains conversation context
- **Interruption Handling**: Natural conversation flow
- **Noise Reduction**: Background noise filtering

## API Endpoints

### STT Service (Gradio)
```
GET    /                         # STT web interface
POST   /api/stt/transcribe      # Transcribe audio file
POST   /api/stt/stream          # Streaming transcription
GET    /api/stt/models          # Available ASR models
```

### TTS Service (Piper)
```
POST   /api/tts/synthesize      # Synthesize speech
POST   /api/tts/stream          # Streaming TTS
GET    /api/tts/voices          # Available voices
GET    /api/tts/speaker-info    # Voice information
```

### Voice Bot
```
POST   /api/bot/chat            # Voice conversation
WebSocket /ws/bot               # Real-time voice chat
GET    /api/bot/status          # Bot status
```

## Cấu hình chính

### STT Configuration
```python
# Model configuration
LANGUAGE_MODELS = {
    "English": ["csukuangfj/sherpa-onnx-paraformer-zipformer-en-2023-06-26"],
    "Chinese": ["csukuangfj/sherpa-onnx-zipformer-zh-14M-2023-02-23"],
    "Vietnamese": ["custom-vietnamese-model"]
}

# Decoding parameters
DECODING_METHOD = "modified_beam_search"
NUM_ACTIVE_PATHS = 15
SAMPLE_RATE = 16000
```

### TTS Configuration
```python
# Voice models
VOICE_MODELS = {
    "en-US": "lessac/en_US-lessac-medium",
    "vi-VN": "custom-vietnamese-voice"
}

# Audio settings
SAMPLE_RATE = 22050
BIT_DEPTH = 16
FORMAT = "wav"
```

### Environment Variables
```env
# STT Settings
STT_MODEL_PATH=/app/models
STT_LANGUAGE=English
STT_SAMPLE_RATE=16000

# TTS Settings
TTS_VOICE_MODEL=lessac/en_US-lessac-medium
TTS_SAMPLE_RATE=22050
TTS_SPEED=1.0

# Service Settings
GRADIO_SERVER_NAME=0.0.0.0
GRADIO_SERVER_PORT=7860
DEBUG=false
```

## Cách chạy

### STT Service với Docker
```bash
cd voice/zipformer_stt

# Build image
docker build -t voice-stt .

# Run service
docker run -d --name voice-stt \
  -p 7860:7860 \
  -e GRADIO_SERVER_NAME=0.0.0.0 \
  voice-stt
```

### TTS Service
```bash
cd voice/piper_tts

# Install dependencies
pip install -r requirements.txt

# Run TTS server
python server.py
```

### Voice Bot
```bash
cd voice

# Run voice bot with both STT và TTS
python bot.py --stt-url http://localhost:7860 --tts-url http://localhost:7861
```

## Usage Examples

### Speech-to-Text
```python
import requests

# Transcribe audio file
with open('audio.wav', 'rb') as f:
    files = {'audio': f}
    response = requests.post(
        'http://localhost:7860/api/stt/transcribe',
        files=files,
        data={'language': 'English', 'model': 'sherpa-onnx-paraformer'}
    )
    
transcript = response.json()['text']
print(f"Transcript: {transcript}")
```

### Text-to-Speech
```python
# Synthesize speech
response = requests.post(
    'http://localhost:7861/api/tts/synthesize',
    json={
        'text': 'Hello, how can I help you today?',
        'voice': 'en-US-lessac-medium',
        'speed': 1.0
    }
)

# Save audio file
with open('output.wav', 'wb') as f:
    f.write(response.content)
```

### Voice Bot Conversation
```python
# Real-time voice chat
import websocket

def on_message(ws, message):
    print(f"Bot: {message}")

def on_audio_data(ws, audio_chunk):
    # Send audio data to bot
    ws.send(audio_chunk, opcode=websocket.ABNF.OPCODE_BINARY)

ws = websocket.WebSocketApp(
    'ws://localhost:7860/ws/bot',
    on_message=on_message
)
ws.run_forever()
```

## Advanced Features

### 1. Multi-language Support
- Language detection
- Cross-language transcription
- Accent adaptation
- Code-switching handling

### 2. Noise Reduction
- Background noise filtering
- Echo cancellation
- Voice activity detection
- Audio enhancement

### 3. Custom Model Training
- Domain-specific ASR models
- Voice cloning for TTS
- Fine-tuning on custom data
- Model optimization

### 4. Real-time Processing
- Streaming transcription
- Low-latency TTS
- Buffer management
- Synchronization

## Audio Processing Pipeline

### STT Pipeline
```python
# 1. Audio Input
audio_input = capture_audio()

# 2. Preprocessing
audio_normalized = preprocess_audio(audio_input)
audio_converted = convert_to_wav(audio_normalized)

# 3. Feature Extraction
features = extract_mel_spectrogram(audio_converted)

# 4. Model Inference
transcript = asr_model.transcribe(features)

# 5. Post-processing
final_text = add_punctuation(transcript)
final_text = capitalize_sentences(final_text)
```

### TTS Pipeline
```python
# 1. Text Processing
cleaned_text = normalize_text(input_text)
phonemes = text_to_phonemes(cleaned_text)

# 2. Neural Synthesis
mel_spectrogram = tts_model.synthesize(phonemes)

# 3. Vocoding
audio_waveform = vocoder.generate(mel_spectrogram)

# 4. Post-processing
final_audio = apply_filters(audio_waveform)
```

## Performance Optimization

### Model Optimization
- Model quantization
- ONNX optimization
- Batch processing
- GPU acceleration

### Audio Processing
- Efficient audio I/O
- Streaming buffers
- Memory management
- Parallel processing

### Network Optimization
- Audio compression
- Chunked transfer
- Connection pooling
- Caching strategies

## Quality Metrics

### STT Quality
- Word Error Rate (WER)
- Character Error Rate (CER)
- Real-time Factor (RTF)
- Language identification accuracy

### TTS Quality
- Mean Opinion Score (MOS)
- Naturalness rating
- Intelligibility score
- Synthesis latency

## Testing

### Unit Tests
```bash
pytest tests/stt -v
pytest tests/tts -v
```

### Integration Tests
```bash
pytest tests/integration -v
```

### Performance Tests
```bash
pytest tests/performance -v
```

## Troubleshooting

### Common Issues
1. **Audio Format**: Ensure correct format (16kHz, mono, WAV)
2. **Model Loading**: Check model paths và dependencies
3. **Memory Usage**: Optimize batch sizes và model loading
4. **Network Latency**: Use appropriate chunk sizes

### Debug Commands
```bash
# Check STT service
curl http://localhost:7860/health

# Test audio conversion
ffmpeg -i input.mp3 -ar 16000 -ac 1 output.wav

# Check model loading
python -c "from model import get_pretrained_model; print('OK')"
```

## Integration Examples

### With Agent Service
```python
# Agent processes transcribed text
transcript = transcribe_audio(audio_file)
response = agent_client.invoke(transcript)
audio_response = synthesize_speech(response['content'])
```

### With Frontend
```javascript
// Browser-based voice interaction
const mediaRecorder = new MediaRecorder(stream);
mediaRecorder.ondataavailable = async (event) => {
    const transcript = await transcribeAudio(event.data);
    const response = await sendMessage(transcript);
    const audioUrl = await synthesizeSpeech(response);
    playAudio(audioUrl);
};
```

## Security Considerations

### Privacy Protection
- Audio data encryption
- On-device processing options
- Data retention policies
- Consent management

### Access Control
- API authentication
- Rate limiting
- Input validation
- Abuse detection

## Future Enhancements

### Planned Features
- Emotion recognition
- Speaker identification
- Voice authentication
- Multi-speaker separation
- Real-time translation
- Voice cloning
- Custom voice training

### Technology Improvements
- End-to-end neural models
- Transformer-based architectures
- Diffusion models for TTS
- On-device AI processing
- 5G optimization

## Monitoring & Analytics

### Performance Metrics
- Transcription accuracy
- Synthesis quality
- Processing latency
- Resource utilization

### Usage Analytics
- Language distribution
- Audio duration statistics
- Error patterns
- User engagement metrics
