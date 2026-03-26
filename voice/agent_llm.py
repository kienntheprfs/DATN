import aiohttp
import json
import uuid
import re
from typing import List, Dict, Any, Optional
from loguru import logger
from pipecat.services.openai.base_llm import BaseOpenAILLMService, OpenAILLMSettings
from openai.types.chat import ChatCompletionChunk


def strip_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"_(.+?)_", r"\1", text)
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    text = re.sub(r"#+\s+(.+)", r"\1", text)
    text = re.sub(r">\s+(.+)", r"\1", text)
    text = re.sub(r"-\s+(.+)", r"\1", text)
    text = re.sub(r"\d+\.\s+(.+)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
    return text.strip()


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
        if hasattr(params_from_context, "messages"):
            messages = params_from_context.messages
        elif isinstance(params_from_context, dict):
            messages = params_from_context.get("messages", [])
        else:
            messages = []

        user_text = self._extract_user_text(messages)

        payload = {
            "message": user_text,
            "thread_id": str(uuid.uuid4()),
        }

        if self._session is None:
            self._session = aiohttp.ClientSession()
            self._client_session_owned = True

        endpoint = f"{self.api_url}/{self.agent_name}/invoke"
        headers = {"X-User-Id": self.user_id}

        async def _generate():
            try:
                async with self._session.post(
                    endpoint, json=payload, headers=headers, timeout=60.0
                ) as resp:
                    resp.raise_for_status()
                    data = await resp.json()

                    # Trích xuất content từ response
                    content = data.get("content", "")
                    if isinstance(data, dict):
                        content = data.get("content") or data.get("text") or ""

                    content = strip_markdown(content)

                    yield ChatCompletionChunk(
                        id="mock-id",
                        choices=[
                            {
                                "delta": {"role": "assistant", "content": content},
                                "index": 0,
                                "finish_reason": "stop",
                            }
                        ],
                        model="agent-model",
                        created=0,
                        object="chat.completion.chunk",
                    )
            except Exception as e:
                logger.error(f"Invoke error: {e}")
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
        user_parts = []

        for msg in reversed(messages):
            if hasattr(msg, "get"):
                role = msg.get("role")
                content = msg.get("content", "")
            elif hasattr(msg, "role"):
                role = msg.role
                content = msg.content
            else:
                continue

            if role == "assistant":
                break

            if role == "user" and content:
                user_parts.insert(0, str(content))

        return " ".join(user_parts)
