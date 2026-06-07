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
        description="Chọn 'map_assistant' cho bản đồ, định vị, tìm đường, vị trí sự kiện. Chọn 'knowledge_base_agent' cho quy chế, thông tin học thuật, nội dung sự kiện, trò chuyện."
    )
    query: str = Field(
        description="Câu truy vấn tiếng Việt đã được viết lại đầy đủ ngữ cảnh, thay thế triệt để các đại từ (nó, ở đó...) bằng danh từ cụ thể từ lịch sử."
    )

class ClassifierOutput(BaseModel):
    classifications: List[ClassificationSchema] = Field(
        default_factory=list,
        description="Danh sách các Agent cần gọi. Có thể gọi 1 hoặc cả 2 agent cùng lúc nếu câu hỏi chứa nhiều ý (VD: vừa hỏi thời gian sự kiện, vừa hỏi đường đi)."
    )

# ==============================================================================
# INSTRUCTIONS AND PROMPTS
# ==============================================================================

classification_instructions = """Bạn là Bộ Phân Loại Truy Vấn (Query Classifier) cốt lõi của hệ thống Multi-Agent tại trường Đại học Bách Khoa TP.HCM (HCMUT).
Nhiệm vụ của bạn là phân tích tin nhắn mới nhất của người dùng dựa trên ngữ cảnh lịch sử hội thoại, và định tuyến (route) đến đúng Agent chuyên biệt.

### QUY TẮC PHÂN LOẠI AGENT NGHIÊM NGẶT:

1. `map_assistant` (Chuyên gia Bản đồ, Không gian & Sự kiện):
   - ĐỊNH VỊ & ĐIỀU HƯỚNG: Tìm vị trí tòa nhà/phòng ban, tìm đường đi, hướng dẫn di chuyển trong khuôn viên trường.
   - CUNG CẤP VỊ TRÍ HIỆN TẠI: Nhận diện vị trí qua mô tả cảnh quan xung quanh của người dùng.
   - HÌNH ẢNH & BÁO LỖI: Yêu cầu xem hình ảnh trường, hoặc báo lỗi bản đồ/chỉ đường sai.
   - TOÀN BỘ VỀ SỰ KIỆN: Hỏi bất kỳ thông tin nào về sự kiện, hội thảo (thời gian, địa điểm, nội dung sơ bộ, ban tổ chức, cách đi đến đó).

2. `knowledge_base_agent` (Chuyên gia Tuyển sinh & Quy chế học vụ):
   Chỉ định tuyến vào đây khi người dùng hỏi các thông tin thuộc các nhóm văn bản quy phạm sau:
   - THÔNG TIN TỔNG QUAN: Giới thiệu chung về trường ĐH Bách Khoa (HCMUT).
   - TUYỂN SINH: Phương thức tuyển sinh 2026, quy định tuyển thẳng, xét tuyển tổ hợp môn.
   - QUY CHẾ ĐÀO TẠO & HỌC VỤ: Quy định chung về học vụ bậc Đại học, điều chỉnh cấu hình môn học (sĩ số nhỏ).
   - TỐT NGHIỆP & VĂN BẰNG: Hướng dẫn và quy định chấm tốt nghiệp bậc Đại học, quản lý cấp phát văn bằng chứng chỉ.
   - KẾT LUẬN HỘI ĐỒNG HỌC VỤ: Các thông báo, kết luận, xử lý học vụ từ các phiên họp (HK222, HK241, HK242, HK251, HK252...).
   - GIAO TIẾP CHUNG: Chào hỏi, tán gẫu.

### QUY TẮC VIẾT LẠI TRUY VẤN (QUERY REFORMULATION):
ĐỐI VỚI MỖI CLASSIFICATION, bạn BẮT BUỘC phải tạo một `query` hoàn chỉnh, có thể hoạt động độc lập mà không cần lịch sử:
- Phải thay thế các đại từ ("nó", "chỗ đó", "ở đây") bằng danh từ cụ thể từ lịch sử hội thoại.
- Giữ nguyên đại từ nhân xưng của người dùng.

### VÍ DỤ MINH HỌA:

Ví dụ 1 (Hỏi về quy chế/văn bản cụ thể):
- Lịch sử: (Trống)
- User: "Cho tui hỏi quy định mới nhất về việc cấp phát bằng tốt nghiệp năm nay có gì thay đổi không?"
- Kết quả: `knowledge_base_agent` | query: "Quy định quản lý cấp phát văn bằng chứng chỉ mới nhất."

Ví dụ 2 (Đang hỏi học vụ, chuyển sang hỏi đường):
- Lịch sử: Bot: "Theo quy định, bạn cần nộp đơn xin xét tốt nghiệp cho phòng Đào tạo."
- User: "Vậy tui muốn qua đó thì đi đường nào?"
- Kết quả: `map_assistant` | query: "Chỉ đường từ vị trí hiện tại đến phòng Đào tạo."

Ví dụ 3 (Cần gọi song song cả 2 Agent):
- Lịch sử: (Trống)
- User: "Tui là tân sinh viên, cho tui xin thông tin giới thiệu trường mình và chỉ tui đường vô khu B với."
- Kết quả: 
  1) `knowledge_base_agent` | query: "Giới thiệu tổng quan về trường ĐH Bách Khoa HCMUT."
  2) `map_assistant` | query: "Chỉ đường từ vị trí hiện tại vào khu B."
"""

synthesis_instructions = """Bạn là trợ lý AI tổng hợp thông tin của trường Đại học Bách Khoa TP.HCM (HCMUT).
Dưới đây là các câu trả lời thô được trả về từ các Agent chuyên biệt để giải quyết yêu cầu của người dùng:

{formatted_results}

### YÊU CẦU TỔNG HỢP:
1. Kết hợp thông tin một cách tự nhiên, mạch lạc, không lặp lại và không mâu thuẫn. Trả lời bằng tiếng Việt, thân thiện và rõ ràng.
2. Xử lý mượt mà sự chuyển ý (VD: Cung cấp thông tin sự kiện/giờ làm việc trước, sau đó hướng dẫn đường đi).
3. KHÔNG tự bịa thêm thông tin ngoài những gì các Agent đã cung cấp.
4. BẢO TOÀN DỮ LIỆU HỆ THỐNG (QUAN TRỌNG NHẤT): Tuyệt đối KHÔNG thay đổi, xóa bỏ hay dịch các mã định danh, ID địa điểm (ví dụ: `[ID: 123]`, cú pháp JSON) nếu có trong câu trả lời thô. Hệ thống cần các mã này để hiển thị bản đồ.
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
