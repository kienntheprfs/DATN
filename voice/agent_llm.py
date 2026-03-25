import aiohttp
import json
import uuid
from typing import List, Dict, Any, Optional
from loguru import logger
from pipecat.services.openai.base_llm import BaseOpenAILLMService, OpenAILLMSettings
from openai.types.chat import ChatCompletionChunk


class DirectAPIAgentLLMService(BaseOpenAILLMService):
    def __init__(
        self,
        api_url: str,
        agent_name: str,
        user_id: str = "web-user-123",
        session: Optional[aiohttp.ClientSession] = None,
        **kwargs,
    ):
        settings = OpenAILLMSettings(model="dummy")
        super().__init__(settings=settings, api_key="dummy", base_url="http://dummy", **kwargs)

        self.api_url = api_url.rstrip("/")
        self.agent_name = agent_name
        self.user_id = user_id
        self._session = session
        self._client_session_owned = False

    async def get_chat_completions(self, params_from_context):
        # Lấy messages từ params
        if hasattr(params_from_context, "messages"):
            messages = params_from_context.messages
        elif isinstance(params_from_context, dict):
            messages = params_from_context.get("messages", [])
        else:
            messages = []

        user_text = self._extract_user_text(messages)

        if self._session is None:
            self._session = aiohttp.ClientSession()
            self._client_session_owned = True

        endpoint = f"{self.api_url}/{self.agent_name}/stream"
        # Tạo thread_id mới mỗi lần để tránh lỗi tool_calls từ lịch sử
        thread_id = str(uuid.uuid4())
        payload = {
            "message": user_text,
            "thread_id": thread_id,
            "stream_tokens": True,
        }
        headers = {"X-User-Id": self.user_id}

        async def _generate():
            try:
                async with self._session.post(endpoint, json=payload, headers=headers, timeout=60.0) as resp:
                    resp.raise_for_status()
                    async for line in resp.content:
                        line_str = line.decode("utf-8").strip()
                        if not line_str:
                            continue
                        if line_str.startswith("data: "):
                            data_str = line_str[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            msg_type = data.get("type")
                            content = data.get("content")

                            if msg_type == "token" and isinstance(content, str):
                                yield ChatCompletionChunk(
                                    id="mock-id",
                                    choices=[
                                        {
                                            "delta": {"role": "assistant", "content": content},
                                            "index": 0,
                                            "finish_reason": None,
                                        }
                                    ],
                                    model="agent-model",
                                    created=0,
                                    object="chat.completion.chunk",
                                )
                            elif msg_type == "message" and content:
                                # Trích xuất text từ content (có thể là string hoặc dict)
                                if isinstance(content, dict):
                                    text = content.get("content") or content.get("text") or str(content)
                                else:
                                    text = str(content)
                                yield ChatCompletionChunk(
                                    id="mock-id",
                                    choices=[
                                        {
                                            "delta": {"role": "assistant", "content": text},
                                            "index": 0,
                                            "finish_reason": "stop",
                                        }
                                    ],
                                    model="agent-model",
                                    created=0,
                                    object="chat.completion.chunk",
                                )
                                break
                            elif msg_type == "error":
                                logger.error(f"Agent stream error: {content}")
                                # Không yield chunk lỗi, chỉ break
                                break
            except Exception as e:
                logger.error(f"Stream error: {e}")
                # Không yield chunk lỗi
            finally:
                if self._client_session_owned and self._session:
                    await self._session.close()
                    self._session = None
                    self._client_session_owned = False

        class AsyncGeneratorWrapper:
            def __init__(self, generator):
                self._generator = generator

            def __aiter__(self):
                return self._generator.__aiter__()

        return AsyncGeneratorWrapper(_generate())

    def _extract_user_text(self, messages: List[Dict[str, Any]]) -> str:
        for msg in reversed(messages):
            if hasattr(msg, "get"):
                role = msg.get("role")
                content = msg.get("content", "")
            elif hasattr(msg, "role"):
                role = msg.role
                content = msg.content
            else:
                continue
            if role == "user":
                return content
        return ""
