import inspect
import json
import logging
import sys
import warnings
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from langchain_core._api import LangChainBetaWarning
from langchain_core.messages import AIMessage, AIMessageChunk, AnyMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langfuse import Langfuse  # type: ignore[import-untyped]
from langfuse.langchain import (
    CallbackHandler,  # type: ignore[import-untyped]
)
from langgraph.types import Command, Interrupt
from langsmith import Client as LangsmithClient

from agents import DEFAULT_AGENT, AgentGraph, get_agent, get_all_agent_info, load_agent
from core import settings
from core.token_limiter import token_limiter
from fastapi import Request
from memory import initialize_database, initialize_store
from schema import (
    AdminConversationMessage,
    AdminConversationMessagesResponse,
    ChatHistory,
    ChatHistoryInput,
    ChatMessage,
    Feedback,
    FeedbackResponse,
    ServiceMetadata,
    StreamInput,
    UserInput,
    ThreadListResponse,
    UpdateTitleRequest,
)
from schema.conversation import Conversation
from service.utils import (
    convert_message_content_to_string,
    langchain_to_chat_message,
    remove_tool_calls,
)
from repositories.chat_repo import ChatRepository
from service.chat_service import ChatService
from service.dependencies import get_chat_service
from rag_utils.reference import reference_service
from core.database import AsyncSessionLocal, get_db

warnings.filterwarnings("ignore", category=LangChainBetaWarning)

_log_level = settings.LOG_LEVEL.to_logging_level()
_root = logging.getLogger()
_root.setLevel(_log_level)
for h in _root.handlers[:]:
    _root.removeHandler(h)
    h.close()
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s %(levelname)-8s %(name)s - %(message)s",
        datefmt="%H:%M:%S",
    )
)
_root.addHandler(_handler)

for _name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    logging.getLogger(_name).setLevel(_log_level)

import os as _os

print(
    f"[DIAG] service.py loaded | PID={_os.getpid()} | root.handlers={len(_root.handlers)} | level={_root.level}",
    flush=True,
)

logger = logging.getLogger(__name__)


def custom_generate_unique_id(route: APIRoute) -> str:
    """Generate idiomatic operation IDs for OpenAPI client generation."""
    return route.name


def verify_bearer(
    http_auth: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(HTTPBearer(description="Please provide AUTH_SECRET api key.", auto_error=False)),
    ],
) -> None:
    if not settings.AUTH_SECRET:
        return
    auth_secret = settings.AUTH_SECRET.get_secret_value()
    if not http_auth or http_auth.credentials != auth_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def verify_topic_modeling_admin_token(
    http_auth: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(HTTPBearer(description="Provide topic modeling admin token.", auto_error=False)),
    ],
) -> None:
    token_setting = settings.TOPIC_MODELING_ADMIN_TOKEN or settings.AUTH_SECRET
    if token_setting is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin token is not configured",
        )

    expected_token = token_setting.get_secret_value()
    if not http_auth or http_auth.credentials != expected_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Configurable lifespan that initializes the appropriate database checkpointer, store,
    and agents with async loading - for example for starting up MCP clients.
    """
    try:
        from core.database import Base, engine
        import schema.missing_knowledge  # noqa: F401 — đăng ký MissingKnowledgeLog trên Base.metadata trước create_all

        async with engine.begin() as conn:
            # Lệnh này sẽ quét các model kế thừa từ Base và tạo bảng nếu chưa có
            await conn.run_sync(Base.metadata.create_all)

        # Initialize both checkpointer (for short-term memory) and store (for long-term memory)
        async with initialize_database() as saver, initialize_store() as store:
            # Set up both components
            if hasattr(saver, "setup"):  # ignore: union-attr
                await saver.setup()
            # Only setup store for Postgres as InMemoryStore doesn't need setup
            if hasattr(store, "setup"):  # ignore: union-attr
                await store.setup()

            # Configure agents with both memory components and async loading
            agents = get_all_agent_info()
            for a in agents:
                try:
                    await load_agent(a.key)
                    logger.info(f"Agent loaded: {a.key}")
                except Exception as e:
                    logger.error(f"Failed to load agent {a.key}: {e}")
                    # Continue with other agents rather than failing startup

                agent = get_agent(a.key)
                # Set checkpointer for thread-scoped memory (conversation history)
                agent.checkpointer = saver
                # Set store for long-term memory (cross-conversation knowledge)
                agent.store = store
            yield
    except Exception as e:
        logger.error(f"Error during database/store/agents initialization: {e}")
        raise
    finally:
        await engine.dispose()
        logger.info("Safely closed SQLAlchemy Engine.")


app = FastAPI(lifespan=lifespan, generate_unique_id_function=custom_generate_unique_id)
router = APIRouter(dependencies=[Depends(verify_bearer)])


@router.get("/info")
async def info() -> ServiceMetadata:
    models = list(settings.AVAILABLE_MODELS)
    models.sort()
    return ServiceMetadata(
        agents=get_all_agent_info(),
        models=models,
        default_agent=DEFAULT_AGENT,
        default_model=settings.DEFAULT_MODEL,
    )


async def _handle_input(
    user_input: UserInput, agent: AgentGraph, user_id: str, thread_id: str
) -> tuple[dict[str, Any], UUID]:
    """
    Parse user input and handle any required interrupt resumption.
    Returns kwargs for agent invocation and the run_id.
    """
    run_id = uuid4()
    # thread_id = user_input.thread_id or str(uuid4())
    # user_id = user_input.user_id or str(uuid4())

    configurable = {"thread_id": thread_id, "user_id": user_id}
    if user_input.model is not None:
        configurable["model"] = user_input.model

    # Config query mode
    if getattr(user_input, "query_mode", None) is not None:
        configurable["query_mode"] = user_input.query_mode

    callbacks: list[Any] = []
    if settings.LANGFUSE_TRACING:
        # Initialize Langfuse CallbackHandler for Langchain (tracing)
        langfuse_handler = CallbackHandler()

        callbacks.append(langfuse_handler)

    if user_input.agent_config:
        # Check for reserved keys (including 'model' even if not in configurable)
        reserved_keys = {"thread_id", "user_id", "model"}
        if overlap := reserved_keys & user_input.agent_config.keys():
            raise HTTPException(
                status_code=422,
                detail=f"agent_config contains reserved keys: {overlap}",
            )
        configurable.update(user_input.agent_config)

    config = RunnableConfig(
        configurable=configurable,
        metadata={"user_id": user_id},
        run_id=run_id,
        callbacks=callbacks,
    )

    # Check for interrupts that need to be resumed
    state = await agent.aget_state(config=config)
    interrupted_tasks = [
        task for task in state.tasks if hasattr(task, "interrupts") and task.interrupts
    ]

    input: Command | dict[str, Any]
    if interrupted_tasks:
        # assume user input is response to resume agent execution from interrupt
        input = Command(resume=user_input.message)
    else:
        current_time = datetime.now(timezone.utc).isoformat()
        input = {
            "messages": [
                HumanMessage(
                    content=user_input.message,
                    additional_kwargs={"timestamp": current_time, "run_id": str(run_id)},
                )
            ]
        }

    kwargs = {
        "input": input,
        "config": config,
    }

    return kwargs, run_id


# token limit usage retrieving api endpoint
@router.get("/token-limit-usage/{client_id}")
async def get_token_limit_usage(client_id: str) -> Any:
    return token_limiter.get_limit_usage(client_id)


@router.post("/{agent_id}/invoke", operation_id="invoke_with_agent_id")
@router.post("/invoke")
async def invoke(
    request: Request,
    user_input: UserInput,
    background_tasks: BackgroundTasks,
    agent_id: str = DEFAULT_AGENT,
    chat_service: ChatService = Depends(get_chat_service),
) -> ChatMessage:
    """
    Invoke an agent with user input to retrieve a final response.

    If agent_id is not provided, the default agent will be used.
    Use thread_id to persist and continue a multi-turn conversation. run_id kwarg
    is also attached to messages for recording feedback.
    Use user_id to persist and continue a conversation across multiple threads.
    """
    # NOTE: Currently this only returns the last message or interrupt.
    # In the case of an agent outputting multiple AIMessages (such as the background step
    # in interrupt-agent, or a tool step in research-assistant), it's omitted. Arguably,
    # you'd want to include it. You could update the API to return a list of ChatMessages
    # in that case.
    agent: AgentGraph = get_agent(agent_id)

    client_id = chat_service.user_id or request.client.host if request.client else "unknown"
    token_limiter.check_limit(client_id)
    logger.info(f"Client ID: {client_id}")

    valid_thread_id = await chat_service.get_or_create_thread(
        thread_id=user_input.thread_id,
        user_query=user_input.message,
        background_tasks=background_tasks,
    )

    kwargs, run_id = await _handle_input(user_input, agent, chat_service.user_id, valid_thread_id)

    try:
        response_events: list[tuple[str, Any]] = await agent.ainvoke(**kwargs, stream_mode=["updates", "values"])  # type: ignore # fmt: skip
        response_type, response = response_events[-1]
        if response_type == "values":
            # Normal response, the agent completed successfully
            output = langchain_to_chat_message(response["messages"][-1])
        elif response_type == "updates" and "__interrupt__" in response:
            # The last thing to occur was an interrupt
            # Return the value of the first interrupt as an AIMessage
            output = langchain_to_chat_message(
                AIMessage(content=response["__interrupt__"][0].value)
            )
        else:
            raise ValueError(f"Unexpected response type: {response_type}")

        output.run_id = str(run_id)

        # Track token usage
        if hasattr(output, "usage_metadata") and output.usage_metadata:
            tokens = output.usage_metadata.get("total_tokens", 0)
            if tokens > 0:
                token_limiter.add_usage(client_id, tokens)

        return output
    except Exception as e:
        logger.error(f"An exception occurred: {e}")
        raise HTTPException(status_code=500, detail="Unexpected error")


import asyncio


# Hàm chạy ngầm xử lý việc lấy URL S3 và đẩy vào Queue
async def background_s3_task(artifacts: list, queue: asyncio.Queue):
    try:
        from rag_utils.reference import reference_service
        from core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            resolved_citations = await reference_service.resolve_citations(artifacts, db)
            if resolved_citations:
                sse_data = {"type": "citations_ready", "content": resolved_citations}
                await queue.put(f"data: {json.dumps(sse_data, ensure_ascii=False)}\n\n")
    except Exception as e:
        logger.error(f"Lỗi khi xử lý link S3: {e}")


# =========================================================================


async def message_generator(
    user_input: StreamInput,
    user_id: str,
    thread_id: str,
    agent_id: str = DEFAULT_AGENT,
) -> AsyncGenerator[str, None]:
    """
    Generate a stream of messages from the agent.

    This is the workhorse method for the /stream endpoint.
    """
    agent: AgentGraph = get_agent(agent_id)
    kwargs, run_id = await _handle_input(user_input, agent, user_id, thread_id)

    # THÊM MỚI: Khởi tạo hàng đợi trung chuyển và tập hợp quản lý task ngầm
    queue = asyncio.Queue()
    background_tasks = set()
    total_request_tokens = 0

    # THÊM MỚI: Bọc toàn bộ logic LangGraph gốc vào một hàm bất đồng bộ
    async def _run_graph():
        nonlocal total_request_tokens
        try:
            # Process streamed events from the graph and yield messages over the SSE stream.
            async for stream_event in agent.astream(
                **kwargs, stream_mode=["updates", "messages", "custom"], subgraphs=True
            ):
                if not isinstance(stream_event, tuple):
                    continue
                # Handle different stream event structures based on subgraphs
                if len(stream_event) == 3:
                    # With subgraphs=True: (node_path, stream_mode, event)
                    _, stream_mode, event = stream_event
                else:
                    # Without subgraphs: (stream_mode, event)
                    stream_mode, event = stream_event
                new_messages = []
                if stream_mode == "updates":
                    for node, updates in event.items():
                        # A simple approach to handle agent interrupts.
                        # In a more sophisticated implementation, we could add
                        # some structured ChatMessage type to return the interrupt value.
                        if node == "__interrupt__":
                            interrupt: Interrupt
                            for interrupt in updates:
                                new_messages.append(AIMessage(content=interrupt.value))
                            continue
                        updates = updates or {}
                        update_messages = updates.get("messages", [])
                        # special cases for using langgraph-supervisor library
                        if "supervisor" in node or "sub-agent" in node:
                            # the only tools that come from the actual agent are the handoff and handback tools
                            if isinstance(update_messages[-1], ToolMessage):
                                if "sub-agent" in node and len(update_messages) > 1:
                                    # If this is a sub-agent, we want to keep the last 2 messages - the handback tool, and it's result
                                    update_messages = update_messages[-2:]
                                else:
                                    # If this is a supervisor, we want to keep the last message only - the handoff result. The tool comes from the 'agent' node.
                                    update_messages = [update_messages[-1]]
                            else:
                                update_messages = []
                        new_messages.extend(update_messages)

                if stream_mode == "custom":
                    new_messages = [event]

                # THÊM MỚI: Quét qua các tin nhắn mới, nếu là Tool RAG thì kích hoạt background task
                for msg in new_messages:
                    # Log message type and attributes for debugging
                    if isinstance(msg, ToolMessage):
                        tool_name = getattr(msg, "name", "NO_NAME")
                        artifacts = getattr(msg, "artifact", None)
                        logger.info(
                            f"ToolMessage detected - name={tool_name}, has_artifact={artifacts is not None}, content_len={len(str(msg.content))}"
                        )
                        if tool_name == "lookup_hcmut_info":
                            if artifacts:
                                logger.info(f"FAQ artifacts found on ToolMessage: {artifacts}")
                                task = asyncio.create_task(background_s3_task(artifacts, queue))
                                background_tasks.add(task)
                                task.add_done_callback(background_tasks.discard)
                            else:
                                logger.warning("lookup_hcmut_info ToolMessage has NO artifacts!")
                    elif isinstance(msg, tuple) and len(msg) == 2:
                        key, value = msg
                        if key == "artifact":
                            logger.info(f"Found artifact in tuple format: {value}")
                            if value:
                                task = asyncio.create_task(background_s3_task(value, queue))
                                background_tasks.add(task)
                                task.add_done_callback(background_tasks.discard)
                    elif isinstance(msg, tuple) and len(msg) == 2:
                        key, value = msg
                        if key == "artifact":
                            logger.info(f"Found artifact in tuple format: {value}")
                            if value:
                                task = asyncio.create_task(background_s3_task(value, queue))
                                background_tasks.add(task)
                                task.add_done_callback(background_tasks.discard)

                # LangGraph streaming may emit tuples: (field_name, field_value)
                # e.g. ('content', <str>), ('tool_calls', [ToolCall,...]), ('additional_kwargs', {...}), etc.
                # We accumulate only supported fields into `parts` and skip unsupported metadata.
                # More info at: https://langchain-ai.github.io/langgraph/cloud/how-tos/stream_messages/
                processed_messages = []
                current_message: dict[str, Any] = {}
                current_artifact: list | None = None
                for message in new_messages:
                    if isinstance(message, tuple):
                        key, value = message
                        # Store parts in temporary dict
                        current_message[key] = value
                        # Capture artifact if it comes as a tuple
                        if key == "artifact" and isinstance(value, list):
                            current_artifact = value
                            logger.info(f"Captured artifact from tuple: {value}")
                    else:
                        # Add complete message if we have one in progress
                        if current_message:
                            processed_messages.append(_create_ai_message(current_message))
                            current_message = {}
                        processed_messages.append(message)

                # Add any remaining message parts
                if current_message:
                    processed_messages.append(_create_ai_message(current_message))

                for message in processed_messages:
                    try:
                        chat_message = langchain_to_chat_message(message)
                        chat_message.run_id = str(run_id)
                    except Exception as e:
                        logger.error(f"Error parsing message: {e}")
                        # SỬA ĐỔI: yield -> await queue.put
                        await queue.put(
                            f"data: {json.dumps({'type': 'error', 'content': 'Unexpected error'})}\n\n"
                        )
                        continue
                    # LangGraph re-sends the input message, which feels weird, so drop it
                    if chat_message.type == "human" and chat_message.content == user_input.message:
                        continue

                    # SỬA ĐỔI: yield -> await queue.put
                    await queue.put(
                        f"data: {json.dumps({'type': 'message', 'content': chat_message.model_dump()})}\n\n"
                    )

                if stream_mode == "messages":
                    if not user_input.stream_tokens:
                        continue
                    msg, metadata = event
                    if "skip_stream" in metadata.get("tags", []):
                        continue
                    # For some reason, astream("messages") causes non-LLM nodes to send extra messages.
                    # Drop them.
                    if not isinstance(msg, AIMessageChunk):
                        continue

                    if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                        tokens = msg.usage_metadata.get("total_tokens", 0)
                        if tokens > 0:
                            total_request_tokens = tokens

                    content = remove_tool_calls(msg.content)
                    if content:
                        # Empty content in the context of OpenAI usually means
                        # that the model is asking for a tool to be invoked.
                        # So we only print non-empty content.

                        # SỬA ĐỔI: yield -> await queue.put
                        await queue.put(
                            f"data: {json.dumps({'type': 'token', 'content': convert_message_content_to_string(content)})}\n\n"
                        )

        except Exception as e:
            logger.error(f"Error in message generator: {e}")
            # SỬA ĐỔI: yield -> await queue.put
            await queue.put(
                f"data: {json.dumps({'type': 'error', 'content': 'Internal server error'})}\n\n"
            )
        finally:
            # Add token usage
            if total_request_tokens > 0:
                token_limiter.add_usage(user_id, total_request_tokens)

            # THÊM MỚI: Đợi các task lấy link S3 hoàn tất (nếu có) trước khi đóng stream
            if background_tasks:
                await asyncio.gather(*background_tasks, return_exceptions=True)

            # SỬA ĐỔI: yield -> await queue.put
            await queue.put("data: [DONE]\n\n")

            # THÊM MỚI: Gửi Sentinel value (None) để báo hiệu vòng lặp chính kết thúc
            await queue.put(None)

    # THÊM MỚI: Kích hoạt _run_graph() chạy ngầm
    asyncio.create_task(_run_graph())

    # THÊM MỚI: Vòng lặp chính liên tục rút dữ liệu từ queue và yield ra Client
    while True:
        item = await queue.get()
        if item is None:
            break
        yield item


# ---------------
# import asyncio
# async def background_s3_task(artifacts: list, queue: asyncio.Queue):
#     """ Mở kết nối DB, dùng Reference Service giải mã path và đẩy vào Queue """
#     try:
#         # Tạo session độc lập không chặn luồng chính
#         async with AsyncSessionLocal() as db:
#             resolved_citations = await reference_service.resolve_citations(artifacts, db)

#             # Đẩy vào stream cho Client
#             await queue.put(f"data: {json.dumps({'type': 'citations_ready', 'content': resolved_citations})}\n\n")
#     except Exception as e:
#         logger.error(f"Lỗi khi resolve S3 citations: {e}")

# async def message_generator(
#     user_input: StreamInput,
#     user_id: str,
#     thread_id: str,
#     agent_id: str = DEFAULT_AGENT,
# ) -> AsyncGenerator[str, None]:
#     """
#     Generate a stream of messages from the agent.

#     This is the workhorse method for the /stream endpoint.
#     """
#     agent: AgentGraph = get_agent(agent_id)
#     kwargs, run_id = await _handle_input(user_input, agent, user_id, thread_id)

#     try:
#         # Process streamed events from the graph and yield messages over the SSE stream.
#         async for stream_event in agent.astream(
#             **kwargs, stream_mode=["updates", "messages", "custom"], subgraphs=True
#         ):
#             if not isinstance(stream_event, tuple):
#                 continue
#             # Handle different stream event structures based on subgraphs
#             if len(stream_event) == 3:
#                 # With subgraphs=True: (node_path, stream_mode, event)
#                 _, stream_mode, event = stream_event
#             else:
#                 # Without subgraphs: (stream_mode, event)
#                 stream_mode, event = stream_event
#             new_messages = []
#             if stream_mode == "updates":
#                 for node, updates in event.items():
#                     # A simple approach to handle agent interrupts.
#                     # In a more sophisticated implementation, we could add
#                     # some structured ChatMessage type to return the interrupt value.
#                     if node == "__interrupt__":
#                         interrupt: Interrupt
#                         for interrupt in updates:
#                             new_messages.append(AIMessage(content=interrupt.value))
#                         continue
#                     updates = updates or {}
#                     update_messages = updates.get("messages", [])
#                     # special cases for using langgraph-supervisor library
#                     if "supervisor" in node or "sub-agent" in node:
#                         # the only tools that come from the actual agent are the handoff and handback tools
#                         if isinstance(update_messages[-1], ToolMessage):
#                             if "sub-agent" in node and len(update_messages) > 1:
#                                 # If this is a sub-agent, we want to keep the last 2 messages - the handback tool, and it's result
#                                 update_messages = update_messages[-2:]
#                             else:
#                                 # If this is a supervisor, we want to keep the last message only - the handoff result. The tool comes from the 'agent' node.
#                                 update_messages = [update_messages[-1]]
#                         else:
#                             update_messages = []
#                     new_messages.extend(update_messages)

#             if stream_mode == "custom":
#                 new_messages = [event]

#             # LangGraph streaming may emit tuples: (field_name, field_value)
#             # e.g. ('content', <str>), ('tool_calls', [ToolCall,...]), ('additional_kwargs', {...}), etc.
#             # We accumulate only supported fields into `parts` and skip unsupported metadata.
#             # More info at: https://langchain-ai.github.io/langgraph/cloud/how-tos/stream_messages/
#             processed_messages = []
#             current_message: dict[str, Any] = {}
#             for message in new_messages:
#                 if isinstance(message, tuple):
#                     key, value = message
#                     # Store parts in temporary dict
#                     current_message[key] = value
#                 else:
#                     # Add complete message if we have one in progress
#                     if current_message:
#                         processed_messages.append(_create_ai_message(current_message))
#                         current_message = {}
#                     processed_messages.append(message)

#             # Add any remaining message parts
#             if current_message:
#                 processed_messages.append(_create_ai_message(current_message))

#             for message in processed_messages:
#                 try:
#                     chat_message = langchain_to_chat_message(message)
#                     chat_message.run_id = str(run_id)
#                 except Exception as e:
#                     logger.error(f"Error parsing message: {e}")
#                     yield f"data: {json.dumps({'type': 'error', 'content': 'Unexpected error'})}\n\n"
#                     continue
#                 # LangGraph re-sends the input message, which feels weird, so drop it
#                 if chat_message.type == "human" and chat_message.content == user_input.message:
#                     continue
#                 yield f"data: {json.dumps({'type': 'message', 'content': chat_message.model_dump()})}\n\n"

#             if stream_mode == "messages":
#                 if not user_input.stream_tokens:
#                     continue
#                 msg, metadata = event
#                 if "skip_stream" in metadata.get("tags", []):
#                     continue
#                 # For some reason, astream("messages") causes non-LLM nodes to send extra messages.
#                 # Drop them.
#                 if not isinstance(msg, AIMessageChunk):
#                     continue
#                 content = remove_tool_calls(msg.content)
#                 if content:
#                     # Empty content in the context of OpenAI usually means
#                     # that the model is asking for a tool to be invoked.
#                     # So we only print non-empty content.
#                     yield f"data: {json.dumps({'type': 'token', 'content': convert_message_content_to_string(content)})}\n\n"
#     except Exception as e:
#         logger.error(f"Error in message generator: {e}")
#         yield f"data: {json.dumps({'type': 'error', 'content': 'Internal server error'})}\n\n"
#     finally:
#         yield "data: [DONE]\n\n"


def _create_ai_message(parts: dict) -> AIMessage:
    sig = inspect.signature(AIMessage)
    valid_keys = set(sig.parameters)
    filtered = {k: v for k, v in parts.items() if k in valid_keys}
    return AIMessage(**filtered)


def _sse_response_example() -> dict[int | str, Any]:
    return {
        status.HTTP_200_OK: {
            "description": "Server Sent Event Response",
            "content": {
                "text/event-stream": {
                    "example": "data: {'type': 'token', 'content': 'Hello'}\n\ndata: {'type': 'token', 'content': ' World'}\n\ndata: [DONE]\n\n",
                    "schema": {"type": "string"},
                }
            },
        }
    }


@router.post(
    "/{agent_id}/stream",
    response_class=StreamingResponse,
    responses=_sse_response_example(),
    operation_id="stream_with_agent_id",
)
@router.post("/stream", response_class=StreamingResponse, responses=_sse_response_example())
async def stream(
    request: Request,
    user_input: StreamInput,
    background_tasks: BackgroundTasks,
    chat_service: ChatService = Depends(get_chat_service),
    agent_id: str = DEFAULT_AGENT,
) -> StreamingResponse:
    """
    Stream an agent's response to a user input, including intermediate messages and tokens.

    If agent_id is not provided, the default agent will be used.
    Use thread_id to persist and continue a multi-turn conversation. run_id kwarg
    is also attached to all messages for recording feedback.
    Use user_id to persist and continue a conversation across multiple threads.

    Set `stream_tokens=false` to return intermediate messages but not token-by-token.
    """
    client_id = chat_service.user_id or request.client.host if request.client else "unknown"
    token_limiter.check_limit(client_id)
    logger.info(f"Client ID: {client_id}")

    valid_thread_id = await chat_service.get_or_create_thread(
        thread_id=user_input.thread_id,
        user_query=user_input.message,
        background_tasks=background_tasks,
    )
    return StreamingResponse(
        message_generator(user_input, chat_service.user_id, valid_thread_id, agent_id),
        media_type="text/event-stream",
    )


@router.post("/feedback")
async def feedback(feedback: Feedback) -> FeedbackResponse:
    """
    Record feedback for a run to LangSmith.

    This is a simple wrapper for the LangSmith create_feedback API, so the
    credentials can be stored and managed in the service rather than the client.
    See: https://api.smith.langchain.com/redoc#tag/feedback/operation/create_feedback_api_v1_feedback_post
    """
    client = LangsmithClient()
    kwargs = feedback.kwargs or {}
    client.create_feedback(
        run_id=feedback.run_id,
        key=feedback.key,
        score=feedback.score,
        **kwargs,
    )
    return FeedbackResponse()


# TODO: cải thiện bảo mật, hiện giờ đưa thread_id cái là được coi
@router.post("/history")
async def history(
    input: ChatHistoryInput, chat_service: ChatService = Depends(get_chat_service)
) -> ChatHistory:
    """
    Get chat history.
    """
    # Ép buộc phải có thread_id hợp lệ, sai ID là ăn 404 ngay
    logger.info(f"USER_ID: {chat_service.user_id}")
    await chat_service.get_thread_strictly(input.thread_id)

    agent: AgentGraph = get_agent(DEFAULT_AGENT)
    try:
        state_snapshot = await agent.aget_state(
            config=RunnableConfig(configurable={"thread_id": input.thread_id})
        )
        messages: list[AnyMessage] = state_snapshot.values.get("messages", [])

        chat_messages: list[ChatMessage] = []
        current_run_id = None

        for m in messages:
            # 1. Nếu là tin nhắn của user, rút run_id từ additional_kwargs ra
            if isinstance(m, HumanMessage) and "run_id" in m.additional_kwargs:
                current_run_id = m.additional_kwargs["run_id"]

            chat_msg = langchain_to_chat_message(m)

            # 2. Gán run_id cho tin nhắn.
            # Dùng current_run_id gốc của bạn, nếu không có thì fallback sang m.id (phòng hờ cho các đoạn chat cũ trong DB)
            if current_run_id:
                chat_msg.run_id = current_run_id
            elif hasattr(m, "id") and m.id:
                chat_msg.run_id = str(m.id)

            chat_messages.append(chat_msg)

        return ChatHistory(messages=chat_messages)
    except Exception as e:
        logger.error(f"An exception occurred: {e}")
        raise HTTPException(status_code=500, detail="Unexpected error")


@router.get(
    "/threads",
    response_model=ThreadListResponse,
    summary="Lấy danh sách lịch sử hội thoại",
    description="Lấy tất cả các threads đang hoạt động của user hiện tại, có hỗ trợ phân trang.",
)
async def get_history_threads(
    chat_service: ChatService = Depends(get_chat_service),
    limit: int = Query(20, ge=1, le=100, description="Limit (1-100)"),
    offset: int = Query(0, ge=0, description="Offset (pagination)"),
):
    try:
        threads = await chat_service.get_all_threads(offset=offset, limit=limit)

        # Trả về theo format của ThreadListResponse
        return ThreadListResponse(items=threads, limit=limit, offset=offset)

    except Exception as e:
        logger.error(f"An exception occurred while fetching threads: {e}")
        # Không nên throw chi tiết lỗi hệ thống ra cho client, chỉ trả về 500
        raise HTTPException(status_code=500, detail="Internal server error")


@router.patch(
    "/threads/{thread_id}/title",
    summary="Cập nhật tiêu đề hội thoại",
    description="Đổi tên (title) của một hội thoại theo thread_id của user hiện tại.",
)
async def update_thread_title(
    thread_id: str,
    payload: UpdateTitleRequest,
    status_code=status.HTTP_204_NO_CONTENT,
    chat_service: ChatService = Depends(get_chat_service),
):
    try:
        await chat_service.update_thread_title(thread_id, payload.new_title)
        return {
            "message": "Cập nhật tiêu đề hội thoại thành công.",
            "thread_id": thread_id,
            "new_title": payload.new_title,
        }
    except HTTPException as he:
        # Bắt và trả về nguyên trạng các lỗi 400, 403, 404 từ tầng chat_service
        raise he
    except Exception as e:
        logger.error(f"Lỗi khi cập nhật tiêu đề thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete(
    "/threads/{thread_id}",
    summary="Xóa một lịch sử hội thoại",
    description="Thực hiện xóa (soft delete) một hội thoại theo thread_id của user hiện tại.",
)
async def delete_thread(thread_id: str, chat_service: ChatService = Depends(get_chat_service)):
    try:
        await chat_service.delete_thread(thread_id)
        return {"message": "Đã xóa hội thoại thành công.", "thread_id": thread_id}
    except HTTPException as he:
        # Cho phép các lỗi 403, 404 từ get_thread_strictly bay thẳng ra client
        raise he
    except Exception as e:
        logger.error(f"An exception occurred while deleting thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# THÊM MỚI: API Xóa tất cả thread của user
@router.delete(
    "/threads",
    summary="Xóa toàn bộ lịch sử hội thoại",
    description="Thực hiện xóa (soft delete) tất cả các hội thoại của user hiện tại.",
)
async def delete_all_threads(chat_service: ChatService = Depends(get_chat_service)):
    try:
        await chat_service.delete_all_threads()
        return {"message": "Đã xóa tất cả lịch sử hội thoại thành công."}
    except Exception as e:
        logger.error(
            f"An exception occurred while deleting all threads for user {chat_service.user_id}: {e}"
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/health")
async def health_check():
    """Health check endpoint."""

    health_status = {"status": "ok"}

    if settings.LANGFUSE_TRACING:
        try:
            langfuse = Langfuse()
            health_status["langfuse"] = "connected" if langfuse.auth_check() else "disconnected"
        except Exception as e:
            logger.error(f"Langfuse connection error: {e}")
            health_status["langfuse"] = "disconnected"

    return health_status


def _parse_iso_datetime(raw: str) -> datetime:
    value = raw.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@app.get(
    "/admin/conversations/messages",
    response_model=AdminConversationMessagesResponse,
    # dependencies=[Depends(verify_topic_modeling_admin_token)],
)
async def get_admin_conversation_messages(
    from_ts: datetime = Query(..., description="UTC lower-bound timestamp (inclusive)."),
    to_ts: datetime = Query(..., description="UTC upper-bound timestamp (exclusive)."),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> AdminConversationMessagesResponse:
    """Read-only export of human messages for dashboard topic modeling."""
    if from_ts.tzinfo is None:
        from_ts = from_ts.replace(tzinfo=timezone.utc)
    else:
        from_ts = from_ts.astimezone(timezone.utc)
    if to_ts.tzinfo is None:
        to_ts = to_ts.replace(tzinfo=timezone.utc)
    else:
        to_ts = to_ts.astimezone(timezone.utc)

    if to_ts <= from_ts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="to_ts must be greater than from_ts",
        )

    # Fetch candidate conversations first, then normalize/filter human messages from checkpoints.
    conversation_stmt = (
        select(Conversation)
        .where(Conversation.is_archived == False)
        .order_by(Conversation.updated_at.desc())
        .limit(2000)
    )
    conversation_result = await db.execute(conversation_stmt)
    conversations = list(conversation_result.scalars().all())

    agent: AgentGraph = get_agent(DEFAULT_AGENT)
    collected: list[AdminConversationMessage] = []

    for conversation in conversations:
        try:
            state_snapshot = await agent.aget_state(
                config=RunnableConfig(configurable={"thread_id": conversation.id})
            )
            messages: list[AnyMessage] = state_snapshot.values.get("messages", [])
        except Exception:
            logger.warning("failed to load messages for thread_id=%s", conversation.id)
            continue

        for message in messages:
            if not isinstance(message, HumanMessage):
                continue

            chat_message = langchain_to_chat_message(message)
            raw_timestamp = chat_message.timestamp
            if raw_timestamp:
                try:
                    msg_ts = _parse_iso_datetime(raw_timestamp)
                except ValueError:
                    msg_ts = conversation.updated_at
            else:
                msg_ts = conversation.updated_at

            if msg_ts is None:
                continue
            if msg_ts.tzinfo is None:
                msg_ts = msg_ts.replace(tzinfo=timezone.utc)
            else:
                msg_ts = msg_ts.astimezone(timezone.utc)

            if not (from_ts <= msg_ts < to_ts):
                continue

            collected.append(
                AdminConversationMessage(
                    thread_id=conversation.id,
                    user_id=conversation.user_id,
                    type=chat_message.type,
                    content=chat_message.content,
                    timestamp=msg_ts,
                )
            )

    collected.sort(
        key=lambda item: item.timestamp or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )

    offset = (page - 1) * page_size
    page_items = collected[offset : offset + page_size]
    has_more = (offset + page_size) < len(collected)

    return AdminConversationMessagesResponse(
        messages=page_items,
        page=page,
        page_size=page_size,
        has_more=has_more,
    )


app.include_router(router)
