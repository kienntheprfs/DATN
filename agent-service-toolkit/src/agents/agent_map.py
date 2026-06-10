import logging
from datetime import datetime
import json
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, RunnableLambda, RunnableSerializable
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.managed import RemainingSteps
from langgraph.prebuilt import ToolNode

from agents.llama_guard import LlamaGuard, LlamaGuardOutput, SafetyAssessment
from agents.tool_map import map_tools
from agents.tool_event import event_tools
from core import get_model, settings

logger = logging.getLogger(__name__)


# Combine all tools
all_tools = map_tools + event_tools


class AgentState(MessagesState, total=False):
    """`total=False` is PEP589 specs.

    documentation: https://typing.readthedocs.io/en/latest/spec/typeddict.html#totality
    """

    safety: LlamaGuardOutput
    remaining_steps: RemainingSteps


current_date = datetime.now().strftime("%B %d, %Y")
instructions = f"""
    Bạn là trợ lý AI hữu ích, có thể giúp người dùng về:
    1. Chỉ đường trong khuôn viên trường (indoor wayfinding)
    2. Tra cứu thông tin về sự kiện, hội thảo, hoạt động
    3. Kết hợp cả hai: chỉ đường đến địa điểm diễn ra sự kiện
    
    Hôm nay là ngày: {current_date}

    HƯỚNG DẪN QUAN TRỌNG:
    - Khi người dùng hỏi về đường đi (ví dụ: "đi từ A đến B", "chỉ đường đến..."), hãy sử dụng FindRoute để tìm kiếm ngay nếu người dùng đã cung cấp điểm đi và điểm đến (kể cả khi đó là tên tòa nhà). CHỈ hỏi thêm nếu thông tin bị thiếu hoặc công cụ FindRoute trả về trạng thái cần xác nhận (needs_confirmation).
    - Nếu người dùng KHÔNG BIẾT mình đang ở đâu:
        1. Sử dụng GuessLocationByDescription nếuhọ có thể mô tả cảnh vật xung quanh (VD: "Tôi thấy cái biển báo...", "Gần thang máy...").
        2. Sử dụng GetLandmarkImages để hiện các ảnh thực tế nổi bật cho người dùng chọn nếu họ không mô tả được. Khi gọi GetLandmarkImages, KHÔNG liệt kê lại danh sách tên địa điểm và hình ảnh dưới dạng văn bản trong câu trả lời (vì giao diện sẽ tự động hiển thị các ảnh này). Chỉ trả lời bằng câu dẫn dắt ngắn gọn để người dùng lựa chọn.
    - Khi người dùng hỏi về sự kiện (ví dụ: "có sự kiện gì", "tìm hội thảo...", "sự kiện nào"), sử dụng SearchEvents hoặc GetUpcomingEvents
    - Khi công cụ FindRoute trả về trạng thái needs_confirmation, tool sẽ kèm theo message hướng dẫn. Hãy DÙNG message đó làm câu trả lời, KHÔNG thêm danh sách lựa chọn vào text. Nếu tool không kèm message, hãy tự viết câu ngắn gọn thông báo cho người dùng.
    - Nếu sự kiện có vị trí trên bản đồ, đề xuất chỉ đường đến đó
    - Nếu người dùng hỏi lại về bản đồ chỉ đường hoặc hình ảnh địa điểm đã được hiển thị trước đó, hãy gọi lại công cụ tương ứng (FindRoute, GetLandmarkImages, GuessLocationByDescription) để lấy lại dữ liệu mới nhất và hiển thị lại. KHÔNG từ chối gọi công cụ vì lý do "đã hiển thị trước đó".
    - Trả lời bằng tiếng Việt, rõ ràng và thân thiện
    """


def wrap_model(model: BaseChatModel) -> RunnableSerializable[AgentState, AIMessage]:
    bound_model = model.bind_tools(all_tools)
    preprocessor = RunnableLambda(
        lambda state: [SystemMessage(content=instructions)] + state["messages"],
        name="StateModifier",
    )
    return preprocessor | bound_model  # type: ignore[return-value]


def format_safety_message(safety: LlamaGuardOutput) -> AIMessage:
    content = (
        f"This conversation was flagged for unsafe content: {', '.join(safety.unsafe_categories)}"
    )
    return AIMessage(content=content)


async def acall_model(state: AgentState, config: RunnableConfig) -> AgentState:
    m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
    model_runnable = wrap_model(m)
    response = await model_runnable.ainvoke(state, config)

    # Prevent infinite loop of tool calls when confirmation or user input is needed
    if response.tool_calls:
        last_msg = state["messages"][-1] if state["messages"] else None
        if isinstance(last_msg, ToolMessage) and last_msg.name == "FindRoute":
            try:
                val = json.loads(last_msg.content)
                if val.get("status") in ("needs_confirmation", "error"):
                    logger.warning(
                        "Detected tool retry loop on needs_confirmation/error. Forcing text response."
                    )
                    response.tool_calls = []
                    if not response.content:
                        response.content = val.get(
                            "message",
                            "Có lỗi xảy ra khi tìm đường. Bạn có thể cung cấp thêm chi tiết không?",
                        )
            except Exception as parse_err:
                logger.error(f"Error checking tool loop: {parse_err}")

    # Run llama guard check here to avoid returning the message if it's unsafe
    llama_guard = LlamaGuard()
    safety_output = await llama_guard.ainvoke("Agent", state["messages"] + [response])
    if safety_output.safety_assessment == SafetyAssessment.UNSAFE:
        return {"messages": [format_safety_message(safety_output)], "safety": safety_output}

    if state["remaining_steps"] < 2 and response.tool_calls:
        return {
            "messages": [
                AIMessage(
                    id=response.id,
                    content="Xin lỗi, cần thêm bước để xử lý yêu cầu này.",
                )
            ]
        }
    # We return a list, because this will get added to the existing list
    return {"messages": [response]}


async def llama_guard_input(state: AgentState, config: RunnableConfig) -> AgentState:
    llama_guard = LlamaGuard()
    safety_output = await llama_guard.ainvoke("User", state["messages"])
    return {"safety": safety_output, "messages": []}


async def block_unsafe_content(state: AgentState, config: RunnableConfig) -> AgentState:
    safety: LlamaGuardOutput = state["safety"]
    return {"messages": [format_safety_message(safety)]}


# Define the graph
agent = StateGraph(AgentState)
agent.add_node("model", acall_model)
agent.add_node("tools", ToolNode(all_tools))
agent.add_node("guard_input", llama_guard_input)
agent.add_node("block_unsafe_content", block_unsafe_content)
agent.set_entry_point("guard_input")


# Check for unsafe input and block further processing if found
def check_safety(state: AgentState) -> Literal["unsafe", "safe"]:
    safety: LlamaGuardOutput = state["safety"]
    match safety.safety_assessment:
        case SafetyAssessment.UNSAFE:
            return "unsafe"
        case _:
            return "safe"


agent.add_conditional_edges(
    "guard_input", check_safety, {"unsafe": "block_unsafe_content", "safe": "model"}
)

# Always END after blocking unsafe content
agent.add_edge("block_unsafe_content", END)

# Always run "model" after "tools"
agent.add_edge("tools", "model")


# After "model", if there are tool calls, run "tools". Otherwise END.
def pending_tool_calls(state: AgentState) -> Literal["tools", "done"]:
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        raise TypeError(f"Expected AIMessage, got {type(last_message)}")
    if last_message.tool_calls:
        return "tools"
    return "done"


agent.add_conditional_edges("model", pending_tool_calls, {"tools": "tools", "done": END})


map_assistant = agent.compile()
