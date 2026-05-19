import logging
import json
import uuid
from typing import Annotated, List, Literal, TypedDict
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.types import Send

from core import get_model, settings
from agents.knowledge_base_agent import kb_agent
from agents.agent_map import map_assistant

logger = logging.getLogger(__name__)

# ==============================================================================
# STATE DEFINITION
# ==============================================================================

class AgentOutput(TypedDict):
    source: str
    result: str

class Classification(TypedDict):
    source: Literal["knowledge_base_agent", "map_assistant"]
    query: str

def merge_results(existing: list | None, new_val: list | None) -> list:
    """
    Custom reducer to allow resetting the list of results at the start of a run,
    while still supporting list concatenation (addition) when parallel nodes return results.
    """
    if existing is None:
        existing = []
    if new_val is None:
        return existing
    if new_val and new_val[0] == "__RESET__":
        return new_val[1:]
    return existing + new_val

class RouterState(MessagesState, total=False):
    classifications: list[Classification]
    results: Annotated[list[AgentOutput], merge_results]

class WrapperState(TypedDict):
    messages: list
    query: str

# ==============================================================================
# SCHEMAS FOR STRUCTURED OUTPUT
# ==============================================================================

class ClassificationSchema(BaseModel):
    source: Literal["knowledge_base_agent", "map_assistant"] = Field(
        description=(
            "The specialized agent to route to:\n"
            "- 'map_assistant': for indoor wayfinding, routing, finding locations/positions of buildings, rooms, faculties, departments, utilities (e.g. canteen, parking, gate), event locations, and any response/dialogue related to positioning, describing surroundings, or identifying start/end points. This INCLUDES explicit requests to go to, visit, or find directions to a place (e.g., 'tui muốn tới...', 'chỉ đường tới...'), AND statements describing current location (e.g., 'Tôi đang ở Cổng 1', 'Mình thấy tòa B4').\n"
            "- 'knowledge_base_agent': for academic rules, enrollment guidelines, study programs, schedules, tuition fees, exams, contact information, working hours, and general greetings or chit-chat."
        )
    )
    query: str = Field(
        description="The reformulated, self-contained search query in Vietnamese. It must resolve all pronoun references (like 'đó', 'nó', 'ở đâu') using the conversation context, so that the query is completely self-contained for the sub-agent."
    )

class ClassifierOutput(BaseModel):
    classifications: List[ClassificationSchema] = Field(
        default_factory=list,
        description="List of classifications for parallel routing. If the query is just general conversation/greeting, route it to 'knowledge_base_agent'. BUT if it is a statement answering a location question or providing a location (e.g., 'Tôi đang ở...', 'Mình thấy...'), it MUST be routed to 'map_assistant'."
    )

# ==============================================================================
# INSTRUCTIONS AND PROMPTS
# ==============================================================================

classification_instructions = """Bạn là một bộ phân loại truy vấn (Query Classifier) chuyên nghiệp cho hệ thống Multi-Agent của trường Đại học Bách Khoa TP.HCM (HCMUT).
Nhiệm vụ của bạn là phân tích tin nhắn mới nhất của người dùng dựa trên ngữ cảnh lịch sử hội thoại bên dưới, và xác định Agent chuyên biệt phù hợp để xử lý.

Hệ thống bắt buộc định tuyến theo các quy tắc phân chia sau:

1. `map_assistant`:
   - Xử lý các câu hỏi về: tìm đường đi (indoor wayfinding), định hướng đường đi, vị trí của địa điểm/phòng học/tòa nhà/khoa/phòng ban/tiện ích (như căn tin, nhà vệ sinh, nhà xe, cổng trường, ATM) trong trường hoặc trên bản đồ.
   - Các câu hỏi chứa ý định tìm vị trí ("ở đâu", "nằm ở đâu", "tòa nào", "phòng nào", "ở chỗ nào") hoặc cách đi đến đó.
   - NẾU người dùng nói "tui muốn tới...", "tui muốn đi...", "chỉ đường cho tui...", "đường đi đến...", "muốn tham quan...", BẮT BUỘC phải định tuyến vào `map_assistant` để chỉ đường.
   - Bất kỳ câu trả lời nào cung cấp vị trí hiện tại hoặc chọn địa điểm (ví dụ: "Tôi đang ở Cổng 1", "Mình giống Cổng 1", "Tôi thấy tòa A4") ĐỀU BẮT BUỘC phải gửi cho `map_assistant`.
   - QUAN TRỌNG: Nếu hội thoại đang ở trong luồng định vị hoặc chỉ đường (ví dụ: Bot đang hỏi điểm xuất phát, và người dùng trả lời mô tả vị trí của họ như "tui mới tới trường", "chưa biết đang ở đâu", "thấy tòa B4", hoặc chọn một mốc địa điểm để xác nhận vị trí), bạn BẮT BUỘC phải chọn `map_assistant` để tiếp tục xử lý bản đồ/chỉ đường.

2. `knowledge_base_agent`:
   - Xử lý các câu hỏi thông tin hành chính, quy chế đào tạo, chương trình đào tạo, đăng ký môn học, học phí, lịch thi, lịch học, học bổng, các quy định học thuật.
   - Các thông tin phi vị trí địa lý của phòng ban/khoa (như số điện thoại liên hệ, email, chức năng nhiệm vụ, giờ làm việc, thủ tục làm giấy tờ).
   - Chào hỏi (ví dụ: "xin chào", "hi"), tự giới thiệu ("bạn là ai"), hoặc trò chuyện tự do bình thường không liên quan đến sơ đồ trường lớp.

HƯỚNG DẪN QUAN TRỌNG:
- Một câu hỏi có thể cần gọi đồng thời cả 2 Agent (ví dụ: "Phòng đào tạo làm việc giờ nào và ở tòa nào?" -> cần `knowledge_base_agent` để tra giờ làm việc, và `map_assistant` để định vị tòa nhà).
- ĐỐI VỚI MỖI CLASSIFICATION, bạn phải tạo một `query` (câu truy vấn) viết bằng tiếng Việt, đầy đủ nghĩa và tự diễn đạt (self-contained). Bạn phải giải quyết triệt để các đại từ thay thế hoặc ngữ cảnh ẩn (như "đó", "nó", "ở đó", "ở đây", "mới tới trường") dựa trên lịch sử hội thoại trước đó để Agent con hiểu độc lập.
  - Ví dụ 1:
    * Lịch sử: Bot đang hỏi điểm xuất phát để chỉ đường tới Khoa Khoa học Máy tính.
    * User: "tui mới tới trường à, chưa biết mình đang ở đâu nữa"
    * Classification tương ứng: `map_assistant` với query: "Xác định vị trí hiện tại của người dùng mới tới trường để chỉ đường tới Khoa Khoa học Máy tính".
  - Ví dụ 2:
    * Lịch sử: User: "Phòng Đào tạo ở đâu?" -> Bot trả lời vị trí.
    * User: "Họ làm việc từ mấy giờ?"
    * Classification tương ứng: `knowledge_base_agent` với query: "Thời gian làm việc của phòng Đào tạo trường HCMUT".
  - Ví dụ 3:
    * Lịch sử: (Trống)
    * User: "tui muốn tới phòng đào tạo ở A5 để hiểu rõ hơn"
    * Classification tương ứng: Trả về HAI classification (gọi đồng thời 2 Agent): 
      1) `map_assistant` với query: "Chỉ đường tới phòng Đào tạo tòa A5". 
      2) `knowledge_base_agent` với query: "Chức năng và các hỗ trợ của phòng Đào tạo".
"""

synthesis_instructions = """Bạn là trợ lý AI tổng hợp thông tin của trường Đại học Bách Khoa TP.HCM (HCMUT).
Nhiệm vụ của bạn là kết hợp các thông tin dưới đây thu được từ các agent chuyên biệt thành một câu trả lời duy nhất, mạch lạc, dễ hiểu và chuyên nghiệp cho người dùng.

Thông tin thu được từ các Agent con:
{formatted_results}

Yêu cầu:
- Kết hợp thông tin một cách tự nhiên, không lặp lại và không mâu thuẫn.
- Trả lời bằng tiếng Việt, rõ ràng và lịch sự.
- Giữ nguyên các thông tin quan trọng như giờ làm việc, tên phòng ban, tên tòa nhà, hoặc các đoạn hướng dẫn đường đi cụ thể.
- Nếu có bất kỳ liên kết hình ảnh hay mã ID địa điểm nào (ví dụ: "[ID: ...]"), hãy giữ nguyên chúng để hệ thống hiển thị chính xác. Do NOT change spatial landmarks, coordinates, or navigation syntax.
"""

# ==============================================================================
# NODES AND EDGES
# ==============================================================================

async def classify_query(state: RouterState, config: RunnableConfig):
    """
    Classifies the user query into zero, one, or both sub-agents.
    Resets the aggregated results from previous turns.
    """
    m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
    model_with_output = m.with_structured_output(ClassifierOutput)
    
    messages = [
        SystemMessage(content=classification_instructions)
    ] + state["messages"]
    
    # We want to skip streaming the classification model tokens to the client
    # So we add the "skip_stream" tag to the config.
    classifier_config = config.copy() if config else {}
    if "tags" not in classifier_config:
        classifier_config["tags"] = []
    else:
        classifier_config["tags"] = list(classifier_config["tags"])
    if "skip_stream" not in classifier_config["tags"]:
        classifier_config["tags"].append("skip_stream")
    
    try:
        response: ClassifierOutput = await model_with_output.ainvoke(messages, classifier_config)
        classifications = []
        if response and response.classifications:
            for c in response.classifications:
                classifications.append({
                    "source": c.source,
                    "query": c.query
                })
        logger.info(f"Classifier decided: {classifications}")
        
        # Create a mock tool call for query classification so it shows up in the tool collapsible list
        tool_call_id = f"call_classify_{str(uuid.uuid4())[:8]}"
        tool_call = {
            "name": "QueryClassifier",
            "args": {"query": state["messages"][-1].content if state["messages"] else ""},
            "id": tool_call_id,
            "type": "tool_call"
        }
        ai_msg = AIMessage(
            content="",
            tool_calls=[tool_call]
        )
        tool_msg = ToolMessage(
            content=json.dumps({"classifications": classifications}, ensure_ascii=False),
            name="QueryClassifier",
            tool_call_id=tool_call_id
        )
        
        # We return a RESET marker to empty results from previous run
        return {
            "classifications": classifications,
            "results": ["__RESET__"],
            "messages": [ai_msg, tool_msg]
        }
    except Exception as e:
        logger.error(f"Error during query classification: {e}", exc_info=True)
        return {
            "classifications": [],
            "results": ["__RESET__"]
        }

async def query_kb(state: WrapperState, config: RunnableConfig):
    """
    Wrapper node to query kb_agent graph isolatedly.
    Replaces the user query message with the reformulated classifier query.
    """
    messages = list(state["messages"])
    if messages and isinstance(messages[-1], HumanMessage):
        last_msg = messages[-1]
        messages[-1] = HumanMessage(
            content=state["query"],
            id=last_msg.id,
            additional_kwargs=last_msg.additional_kwargs
        )
        
    logger.info(f"Querying knowledge_base_agent with reformulated query: {state['query']}")
    try:
        response = await kb_agent.ainvoke({"messages": messages}, config)
        last_msg = response["messages"][-1]
        new_messages = response["messages"][len(messages):]
        return {
            "results": [{
                "source": "knowledge_base_agent",
                "result": last_msg.content
            }],
            "messages": new_messages
        }
    except Exception as e:
        logger.error(f"Error querying knowledge_base_agent: {e}", exc_info=True)
        err_msg = f"Có lỗi xảy ra khi truy vấn thông tin quy chế: {str(e)}"
        return {
            "results": [{
                "source": "knowledge_base_agent",
                "result": err_msg
            }],
            "messages": [AIMessage(content=err_msg)]
        }

async def query_map(state: WrapperState, config: RunnableConfig):
    """
    Wrapper node to query map_assistant graph isolatedly.
    Replaces the user query message with the reformulated classifier query.
    """
    messages = list(state["messages"])
    if messages and isinstance(messages[-1], HumanMessage):
        last_msg = messages[-1]
        messages[-1] = HumanMessage(
            content=state["query"],
            id=last_msg.id,
            additional_kwargs=last_msg.additional_kwargs
        )
        
    logger.info(f"Querying map_assistant with reformulated query: {state['query']}")
    try:
        response = await map_assistant.ainvoke({"messages": messages}, config)
        last_msg = response["messages"][-1]
        new_messages = response["messages"][len(messages):]
        return {
            "results": [{
                "source": "map_assistant",
                "result": last_msg.content
            }],
            "messages": new_messages
        }
    except Exception as e:
        logger.error(f"Error querying map_assistant: {e}", exc_info=True)
        err_msg = f"Có lỗi xảy ra khi truy vấn bản đồ: {str(e)}"
        return {
            "results": [{
                "source": "map_assistant",
                "result": err_msg
            }],
            "messages": [AIMessage(content=err_msg)]
        }

def route_to_agents(state: RouterState):
    """
    Conditional edge logic mapping classifications to Sends or falling back to synthesis.
    """
    classifications = state.get("classifications") or []
    if not classifications:
        logger.info("No sub-agents required. Defaulting to knowledge_base_agent.")
        last_query = state["messages"][-1].content if state["messages"] else "Xin chào"
        return [Send("query_kb", {"messages": state["messages"], "query": last_query})]
    
    sends = []
    for c in classifications:
        if c["source"] == "knowledge_base_agent":
            sends.append(Send("query_kb", {"messages": state["messages"], "query": c["query"]}))
        elif c["source"] == "map_assistant":
            sends.append(Send("query_map", {"messages": state["messages"], "query": c["query"]}))
            
    if not sends:
        logger.info("Classifications list was not empty but no valid target found. Defaulting to knowledge_base_agent.")
        last_query = state["messages"][-1].content if state["messages"] else "Xin chào"
        return [Send("query_kb", {"messages": state["messages"], "query": last_query})]
        
    logger.info(f"Routing to: {[s.node for s in sends]}")
    return sends

async def synthesize_results(state: RouterState, config: RunnableConfig):
    """
    Combines responses from parallel sub-agents or performs general chat fallback.
    """
    results = state.get("results") or []
    m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
    
    if not results:
        logger.info("No sub-agent results. Defaulting to knowledge_base_agent.")
        response = await kb_agent.ainvoke({"messages": state["messages"]}, config)
        new_messages = response["messages"][len(state["messages"]):]
        return {"messages": new_messages}
        
    if len(results) == 1:
        logger.info("Single sub-agent result. Preserving original response.")
        # Sub-agent's messages (including final text and tool calls/responses)
        # have already been merged into state["messages"] during query_kb/query_map execution.
        # Returning {"messages": []} prevents duplicating the final AIMessage in the output.
        return {"messages": []}
        
    logger.info(f"Synthesizing {len(results)} agent responses.")
    formatted_results = "\n\n".join([f"Agent [{r['source']}]:\n{r['result']}" for r in results])
    prompt = [
        SystemMessage(content=synthesis_instructions.format(formatted_results=formatted_results)),
    ] + state["messages"]
    
    response = await m.ainvoke(prompt, config)
    return {"messages": [AIMessage(content=response.content)]}

# ==============================================================================
# GRAPH COMPILATION
# ==============================================================================

workflow = StateGraph(RouterState)

# Add nodes
workflow.add_node("classify_query", classify_query)
workflow.add_node("query_kb", query_kb)
workflow.add_node("query_map", query_map)
workflow.add_node("synthesize_results", synthesize_results)

# Set entry point
workflow.set_entry_point("classify_query")

# Setup routing
workflow.add_conditional_edges(
    "classify_query",
    route_to_agents,
    {
        "query_kb": "query_kb",
        "query_map": "query_map",
        "synthesize_results": "synthesize_results"
    }
)

workflow.add_edge("query_kb", "synthesize_results")
workflow.add_edge("query_map", "synthesize_results")
workflow.add_edge("synthesize_results", END)

router_agent = workflow.compile()
router_agent.name = "router-agent"
