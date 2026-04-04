import aiohttp
import json
import uuid
import re
from typing import List, Dict, Any, Optional, Callable, Awaitable
from loguru import logger
from pipecat.services.openai.base_llm import BaseOpenAILLMService, OpenAILLMSettings
from openai.types.chat import ChatCompletionChunk
from pipecat.frames.frames import OutputTransportMessageFrame


def strip_markdown(text: str) -> str:
    if not text:
        return text

    # 1. Xử lý Code Blocks và Inline Code trước (giữ lại nội dung bên trong)
    # Loại bỏ ``` ngôn_ngữ và ``` ở cuối
    text = re.sub(r"```[a-zA-Z0-9]*\n(.*?)\n```", r"\1", text, flags=re.DOTALL)
    # Loại bỏ inline code `code`
    text = re.sub(r"`(.*?)`", r"\1", text)

    # 2. Xử lý Image trước Link (giữ lại alt text)
    text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", text)
    # 3. Xử lý Link (giữ lại text hiển thị)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)

    # 4. Xử lý các Block elements (Header, Quote, List) - Bắt buộc phải ở đầu dòng
    # Xóa Headers (# Header)
    text = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)
    # Xóa Blockquotes (> Quote)
    text = re.sub(r"^>\s+", "", text, flags=re.MULTILINE)
    # Xóa Unordered Lists (-, *, +)
    text = re.sub(r"^[\-\*\+]\s+", "", text, flags=re.MULTILINE)
    # Xóa Ordered Lists (1. Item)
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)
    # Xóa Horizontal Rules (---, ***, ___)
    text = re.sub(r"^(?:---|\*\*\*|___)\s*$", "", text, flags=re.MULTILINE)

    # 5. Xử lý các Inline elements (Bold, Italic, Strikethrough)
    # Dùng ? để non-greedy, tránh xóa nhầm khoảng văn bản giữa 2 phần in đậm khác nhau
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"__(.*?)__", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"\*(.*?)\*", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"_(.*?)_", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"~~(.*?)~~", r"\1", text, flags=re.DOTALL)

    # 6. Loại bỏ các thẻ HTML cơ bản (nếu có lẫn trong Markdown)
    text = re.sub(r"<[^>]*>", "", text)

    return text.strip()


ToolCallCallback = Callable[[List[Dict[str, Any]]], Awaitable[None]]
ToolResultCallback = Callable[[str, str, Any], Awaitable[None]]


class DirectAPIAgentLLMService(BaseOpenAILLMService):
    def __init__(
        self,
        api_url: str,
        agent_name: str,
        user_id: str = "web-user-123",
        thread_id: str | None = None,
        session: Optional[aiohttp.ClientSession] = None,
        on_tool_calls: Optional[ToolCallCallback] = None,
        on_tool_result: Optional[ToolResultCallback] = None,
        transport=None,
        **kwargs,
    ):
        settings = OpenAILLMSettings(model="dummy")
        super().__init__(settings=settings, api_key="dummy", base_url="http://dummy", **kwargs)

        self.api_url = api_url.rstrip("/")
        self.agent_name = agent_name
        self.user_id = user_id
        self.thread_id = thread_id
        self._session = session
        self._client_session_owned = False
        self._on_tool_calls = on_tool_calls
        self._on_tool_result = on_tool_result
        self._transport = transport

    async def get_chat_completions(self, params_from_context):
        if hasattr(params_from_context, "messages"):
            messages = params_from_context.messages
        elif isinstance(params_from_context, dict):
            messages = params_from_context.get("messages", [])
        else:
            messages = []

        user_text = self._extract_user_text(messages)
        thread_id = self.thread_id or str(uuid.uuid4())

        if self._session is None:
            self._session = aiohttp.ClientSession()
            self._client_session_owned = True

        endpoint = f"{self.api_url}/{self.agent_name}/stream"
        headers = {
            "X-User-Id": self.user_id,
            "Content-Type": "application/json",
        }
        payload = {
            "message": user_text,
            "thread_id": thread_id,
            "stream_tokens": True,
        }

        async def _generate():
            accumulated_content = ""
            try:
                async with self._session.post(
                    endpoint, json=payload, headers=headers, timeout=120.0
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.content:
                        line = line.decode("utf-8").strip()
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break

                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue

                        msg_type = data.get("type")

                        if msg_type == "token":
                            content = data.get("content", "")
                            if content:
                                accumulated_content += content
                                yield ChatCompletionChunk(
                                    id="agent-stream",
                                    choices=[
                                        {
                                            "delta": {
                                                "role": "assistant",
                                                "content": content,
                                            },
                                            "index": 0,
                                            "finish_reason": None,
                                        }
                                    ],
                                    model="agent-model",
                                    created=0,
                                    object="chat.completion.chunk",
                                )

                        elif msg_type == "message":
                            content = data.get("content")
                            if content and isinstance(content, dict):
                                msg_type_inner = content.get("type")

                                if msg_type_inner == "ai":
                                    tool_calls = content.get("tool_calls", [])
                                    if tool_calls:
                                        if self._on_tool_calls:
                                            await self._on_tool_calls(tool_calls)
                                    run_id = content.get("run_id", "")
                                    if run_id and self._transport:
                                        try:
                                            msg = {
                                                "label": "rtvi-ai",
                                                "type": "run-id",
                                                "data": {"run_id": run_id},
                                            }
                                            await self._transport.output().send_message(
                                                OutputTransportMessageFrame(message=msg)
                                            )
                                        except Exception as e:
                                            logger.error(f"Failed to send run-id: {e}")

                                elif msg_type_inner == "tool":
                                    tool_call_id = content.get("tool_call_id", "")
                                    tool_result = content.get("content", "")
                                    if self._on_tool_result and tool_call_id:
                                        await self._on_tool_result(tool_call_id, tool_result, None)

            except Exception as e:
                logger.error(f"Stream error: {e}")
            finally:
                if accumulated_content:
                    yield ChatCompletionChunk(
                        id="agent-stream",
                        choices=[
                            {
                                "delta": {"role": "assistant", "content": ""},
                                "index": 0,
                                "finish_reason": "stop",
                            }
                        ],
                        model="agent-model",
                        created=0,
                        object="chat.completion.chunk",
                    )
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
