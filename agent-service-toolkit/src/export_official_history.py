import json
import asyncio
import logging
import sys
from typing import List, Dict

# Fix lỗi Windows SelectorEventLoop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Import các công cụ parse từ project của bạn
from memory.postgres import get_postgres_connection_string
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
)
from langchain_core.messages import (
    ChatMessage as LangchainChatMessage,
)

from schema import ChatMessage


def convert_message_content_to_string(content: str | list[str | dict]) -> str:
    if isinstance(content, str):
        return content
    text: list[str] = []
    for content_item in content:
        if isinstance(content_item, str):
            text.append(content_item)
            continue
        if content_item["type"] == "text":
            text.append(content_item["text"])
    return "".join(text)


def langchain_to_chat_message(message: BaseMessage) -> ChatMessage:
    """Create a ChatMessage from a LangChain message."""
    timestamp = message.additional_kwargs.get("timestamp")
    run_id = None
    # Lấy run_id từ message.id (AIMessage lưu run_id trong id)
    if isinstance(message, AIMessage):
        aid = getattr(message, "id", None)
        if aid and isinstance(aid, str):
            run_id = aid
    match message:
        case HumanMessage():
            human_message = ChatMessage(
                type="human",
                content=convert_message_content_to_string(message.content),
                timestamp=timestamp,
            )
            return human_message
        case AIMessage():
            ai_message = ChatMessage(
                type="ai",
                content=convert_message_content_to_string(message.content),
                timestamp=timestamp,
                run_id=run_id,
            )
            if message.tool_calls:
                ai_message.tool_calls = message.tool_calls
            if message.response_metadata:
                ai_message.response_metadata = message.response_metadata
            return ai_message
        case ToolMessage():
            tool_message = ChatMessage(
                type="tool",
                content=convert_message_content_to_string(message.content),
                tool_call_id=message.tool_call_id,
                timestamp=timestamp,
            )
            return tool_message
        case LangchainChatMessage():
            if message.role == "custom":
                custom_message = ChatMessage(
                    type="custom",
                    content="",
                    custom_data=message.content[0],
                    timestamp=timestamp,
                )
                return custom_message
            else:
                raise ValueError(f"Unsupported chat message role: {message.role}")
        case _:
            raise ValueError(f"Unsupported message type: {message.__class__.__name__}")


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def export_chat_histories_to_file(
    db_uri: str, output_filepath: str = "chat_history_export.json"
):
    logger.info(f"Đang kết nối tới database...")

    async with AsyncPostgresSaver.from_conn_string(db_uri) as checkpointer:
        all_histories = []
        count = 0

        # Duyệt qua các thread
        async for checkpoint_tuple in checkpointer.alist(config=None):
            thread_id = checkpoint_tuple.config["configurable"].get("thread_id", "unknown_thread")
            user_id = checkpoint_tuple.metadata.get("user_id", "unknown_user")

            state_values = checkpoint_tuple.checkpoint.get("channel_values", {})
            messages = state_values.get("messages", [])

            if messages:
                parsed_messages = []
                
                for m in messages:
                    try:
                        # 1. Chuyển từ LangChain Object -> Pydantic Model (ChatMessage)
                        chat_msg_pydantic = langchain_to_chat_message(m)

                        # 2. Chuyển Pydantic Model -> Dict thuần túy
                        msg_dict = chat_msg_pydantic.model_dump()

                        # Lấy run_id trực tiếp từ AIMessage.id (frontend lấy theo cách này)
                        if isinstance(m, AIMessage):
                            msg_id = getattr(m, "id", None)
                            if msg_id and isinstance(msg_id, str):
                                msg_dict["run_id"] = msg_id

                        # Giữ lại timestamp gốc từ additional_kwargs
                        if hasattr(m, "additional_kwargs") and "timestamp" in m.additional_kwargs:
                            msg_dict["timestamp"] = m.additional_kwargs["timestamp"]

                        parsed_messages.append(msg_dict)
                    except Exception as e:
                        logger.warning(f"Không thể parse message trong thread {thread_id}: {e}")

                all_histories.append(
                    {
                        "thread_id": thread_id,
                        "user_id": user_id,
                        "total_messages": len(parsed_messages),
                        "messages": parsed_messages,
                        # Lấy thời gian cập nhật cuối cùng từ metadata của checkpoint
                        "last_updated": checkpoint_tuple.metadata.get("source", "unknown"),
                    }
                )
                count += 1

        logger.info(f"Đã xử lý xong {count} luồng hội thoại.")

        # Ghi file với định dạng chuẩn
        try:
            with open(output_filepath, "w", encoding="utf-8") as f:
                # Không cần default=str nữa vì dữ liệu đã là Dict thuần túy sạch sẽ
                json.dump(all_histories, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Đã xuất dữ liệu thành công ra file: {output_filepath}")
        except Exception as e:
            logger.error(f"❌ Lỗi khi ghi file: {e}")


if __name__ == "__main__":
    db_url = get_postgres_connection_string()
    if "postgresql+asyncpg" in db_url:
        db_url = db_url.replace("postgresql+asyncpg", "postgresql")

    output_file = "all_chat_histories_clean.json"

    asyncio.run(export_chat_histories_to_file(db_uri=db_url, output_filepath=output_file))
