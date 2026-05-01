# Technology Stack & Architecture

## voice/ - AI Voice Agent

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────┐ │
│  │  WebRTC   │◄──►│   Pipecat   │◄──►│    RTVI UI      │ │
│  │  Client  │    │   Client   │    │   Components   │ │
│  └────┬────┘    └──────┬─────┘    └────────────────────┘ │
└───────┼──────────────────┼──────────────────────────────────┘
        │ audio stream    │
        │ WebRTC        │
┌───────┼────────────────┼──────────────────────────────────┐
│       ▼                ▼                                  │
│  ┌───────────────────────────────────────────────────┐   │
│  │           FastAPI Server (Port 7860)              │   │
│  │  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │  │   HTTP    │  │   SmallWebRTCTransport │   │   │
│  │  │  REST    │  │    (aiortc)         │   │   │
│  │  └─────────┬─┘  └─────────┬───────────┘   │   │
│  └──────────┼─────────────┼───────────────────────────┘   │
│            │             │                        │
│  ┌────────┴───────────┴────────────────────────┐
│  │           Pipecat Pipeline              │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  │  │  VAD   │──│   STT   │──│   LLM   │──┐
│  │  │ Silero │  │ Sherpa  │  │ Ollama  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  │
│  │                         │            │
│  │  ┌──────────┐  ┌──────┴──────┐   │
│  │  │  TURN   │──│    TTS    │───┘
│  │  │  (STUN)│  │  Piper   │
│  │  └──────────┘  └──────────┘
│  └──────────────────────────────────┘
│                     │
│  ┌────────────────┴──────────────────┐
│  │        External Services          │
│  │  ┌──────────┐  ┌──────────┐  │
│  │  │ Ollama  │  │ Piper  │  │
│  │  │ :11434 │  │ :5000  │  │
│  │  └��─────────┘  └──────────┘  │
└─────────────────────────────────┘
```

### Backend & Server
| Technology | Purpose |
|------------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | Web framework, REST API server |
| [Uvicorn](https://www.uvicorn.org/) | ASGI server |
| [Python](https://www.python.org/) 3.8+ | Runtime |

### AI & ML Services
| Technology | Purpose |
|------------|---------|
| [Pipecat AI](https://github.com/pipecat-ai/pipecat) | Real-time multimodal AI pipeline framework |
| [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) | Speech-to-Text (STT) - Vietnamese ASR |
| [Zipformer](https://huggingface.co/spaces/hynt/k2-automatic-speech-recognition-demo) | Vietnamese speech recognition model |
| [Piper TTS](https://github.com/rhasspy/piper) | Text-to-Speech (TTS) - Vietnamese voice |
| [Ollama](https://github.com/ollama/ollama) | Local LLM inference engine |
| [Qwen2.5](https://qwen.readthedocs.io/) | LLM model (7b parameters) |
| [PyTorch](https://pytorch.org/) | ML framework |
| [torchaudio](https://pytorch.org/audio/) | Audio processing |

### Real-time Communication
| Technology | Purpose |
|------------|---------|
| [aiortc](https://github.com/aiortc/aiortc) | WebRTC implementation for Python |
| [SmallWebRTCTransport](https://docs.pipecat.ai/) | Pipecat's WebRTC transport |

### Audio Processing
| Technology | Purpose |
|------------|---------|
| [NumPy](https://numpy.org/) | Numerical computing |
| [SciPy](https://scipy.org/) | Signal processing |
| [librosa](https://librosa.org/) | Audio analysis |
| [soundfile](https://pysoundfile.readthedocs.io/) | Audio file I/O |

### Utilities
| Technology | Purpose |
|------------|---------|
| [python-dotenv](https://pypi.org/project/python-dotenv/) | Environment variables |
| [Loguru](https://loguru.readthedocs.io/) | Logging |
| [aiohttp](https://docs.aiohttp.org/) | Async HTTP client |
| [Pydantic](https://docs.pydantic.dev/) | Data validation |
| [websockets](https://websockets.readthedocs.io/) | WebSocket server |
| [aiofiles](https://github.com/Tinche/aiofiles) | Async file I/O |

---

## mobile_chatbot/ - Flutter Mobile App

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Flutter App (Dart)                    │
│  ┌─────────────────────────────────────────────┐     │
│  │              Material 3 UI                  │     │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐ │     │
│  │  │ Voice   │  │ Message │  │  Map   │ │     │
│  │  │  Home  │  │ Bubble  │  │ Widget│ │     │
│  │  └────────┘  └────────┘  └────────┘ │     │
│  └─────────────────────────────────────────────┘     │
│                       │                           │
│  ┌────────────────────┼───────────────────┐     │
│  │              Services Layer             │     │
│  │  ┌──────────────┐  ┌────────────────┐ │     │
│  │  │ VoiceCtrl  │  │  APIClient   │ │     │
│  │  │ (WebRTC)  │  │   (HTTP)    │ │     │
│  │  └─────┬──────┘  └──────┬─────┘ │     │
│  └────────┼───��─────────────┼──────┘     │
│          │                 │                │
│  ┌──────┴─────────────────┴───────┐    │
│  │         WebRTC Media Stream        │    │
│  │    (flutter_webrtc plugin)      │    │
│  └───────────────────────────────┬────┘    │
└───────────────────────────────┼────────────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
           ┌─────────┐ ┌─────────┐ ┌──────────┐
           │  Voice  │ │  API    │ │  STUN/   │
           │ Service│ │Gateway  │ │  TURN    │
           │ :7860  │ │ :8008   │ │  Server  │
           └─────────┘ └─────────┘ └─────────┘
```

### Framework & Language
| Technology | Purpose |
|------------|---------|
| [Flutter](https://flutter.dev/) 3.x | Cross-platform UI framework |
| [Dart](https://dart.dev/) | Programming language |

### Dependencies
| Technology | Purpose | Version |
|------------|---------|---------|
| [flutter_webrtc](https://pub.dev/packages/flutter_webrtc) | WebRTC for mobile | ^0.12.11 |
| [lottie](https://pub.dev/packages/lottie) | Animations | ^3.1.2 |
| [flutter_map](https://pub.dev/packages/flutter_map) | Maps | ^7.0.2 |
| [latlong2](https://pub.dev/packages/latlong2) | Geographic coordinates | ^0.9.1 |
| [http](https://pub.dev/packages/http) | HTTP requests | ^1.2.2 |
| [flutter_markdown_plus](https://pub.dev/packages/flutter_markdown_plus) | Markdown rendering | ^1.0.7 |

### App Components
| Component | File | Description |
|-----------|------|-----------|
| VoiceHomePage | `screens/voice_home_page.dart` | Main screen with face animation |
| VoiceController | `services/voice_controller.dart` | WebRTC connection handling |
| APIClient | `services/api_client.dart` | HTTP REST API client |
| FaceWidget | `widgets/face_widget.dart` | Animated face display |
| MessageBubble | `widgets/message_bubble.dart` | Chat message UI |
| RouteDialog | `widgets/route_dialog.dart` | Navigation dialog |
| SettingsDialog | `widgets/settings_dialog.dart` | Settings UI |
| AuthDialog | `widgets/auth_dialog.dart` | Authentication dialog |

### Build Targets
- Android
- iOS
- Web
- macOS
- Linux
- Windows

---

## Shared Infrastructure

### Development Tools
| Technology | Purpose |
|------------|---------|
| [Git](https://git-scm.com/) | Version control |
| [Docker](https://www.docker.com/) | Containerization |
| [coturn](https://github.com/coturn/coturn) | TURN server |

### External Services
| Technology | Purpose |
|------------|---------|
| [STUN (Google)](stun:stun.l.google.com:19302) | NAT traversal |
| [TURN Server](https://en.wikipedia.org/wiki/TURN_server) | Media relay |