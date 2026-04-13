# # ============= VERSION 5: AGENTIC DECISION & GUARDRAILS ============

import logging
import asyncio
from typing import Any, List, Annotated, Literal

# --- LangChain / LangGraph imports ---
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from langchain_tavily import TavilySearch
from datetime import datetime, timezone

# --- Project imports ---
from core import get_model, settings
from rag_utils.retriever import QdrantHybridRetriever
from rag_utils.reranker import BaseReranker, JinaReranker
from rag_utils.lightrag_service import LightRAGService
from rag_utils.semantic_cache import semantic_cache_service

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ==============================================================================
# CONFIGURATION
# ==============================================================================
# Ngưỡng điểm để đánh dấu High Confidence (để format đẹp hơn cho Agent đọc)
HIGH_CONFIDENCE_THRESHOLD = 0.75 
MAX_TURNS = 6  # Số lượt hội thoại tối đa để ngắt mạch

# ==============================================================================
# INIT SERVICES
# ==============================================================================
retriever_service = QdrantHybridRetriever()
reranker_service: BaseReranker = JinaReranker()
lightrag_service: LightRAGService = LightRAGService()

# ==============================================================================
# DEFINING TOOLS
# ==============================================================================
class UnifiedDocument:
    def __init__(self, content: str, source_type: str, doc_id: str):
        self.content = content
        self.source_type = source_type
        self.doc_id = doc_id

@tool("lookup_hcmut_info", response_format="content_and_artifact")
async def lookup_hcmut_info(query: str, config: RunnableConfig):
    """
    Tìm kiếm thông tin nội bộ. 
    search_depth: "normal" (Tìm kiếm nhanh) hoặc "deep" (Tìm kiếm sâu trên đồ thị tri thức).
    """
    # Lấy query_mode từ config (mặc định là 'normal' nếu API không truyền)
    query_mode = str(config.get("configurable", {}).get("query_mode", "normal")).strip().lower()
    
    logger.info(f"CALL TOOL: lookup_hcmut_info | QUERY: {query} | MODE: {query_mode}")

    configurable = config.get("configurable", {}) if isinstance(config, dict) else {}
    kb_id = configurable.get("kb_id")
    explicit_collection = str(configurable.get("kb_collection", "")).strip()
    collection_name = explicit_collection or (f"kb_{kb_id}" if kb_id else settings.SEM_CACHE_NAMESPACE)
    cache_namespace = collection_name

    # Ánh xạ query_mode (normal/deep) sang search_depth của logic cũ
    search_depth = "deep" if query_mode == "deep" else "normal"
    lightrag_mode = "hybrid" if search_depth == "deep" else "naive"

    try:
        cached_dense_vector: list[float] | None = None
        query_vector: dict[str, Any] | None = None
        kb_version = 1
        try:
            query_vector = await retriever_service.encoder.encode_query(query)
            cached_dense_vector = query_vector.get("dense")
            kb_version = await semantic_cache_service.get_kb_version(namespace=cache_namespace)
            if cached_dense_vector:
                cache_hit = await semantic_cache_service.search(
                    dense_vector=cached_dense_vector,
                    query_mode=query_mode,
                    kb_version=kb_version,
                    namespace=cache_namespace,
                )
                if cache_hit and cache_hit.response_text:
                    logger.info(
                        "semantic_cache_hit mode=%s similarity=%.4f kb_version=%s key=%s",
                        query_mode,
                        cache_hit.similarity,
                        kb_version,
                        cache_hit.cache_key,
                    )
                    return cache_hit.response_text, cache_hit.artifacts
            logger.info("semantic_cache_miss mode=%s kb_version=%s", query_mode, kb_version)
        except Exception:
            logger.exception("semantic_cache_lookup_failed")

        # 1. CHẠY SONG SONG QDRANT VÀ LIGHTRAG
        task_qdrant = retriever_service.search(
            query=query,
            collection_name=cache_namespace,
            top_k=5,
            precomputed_query_vec=query_vector,
        )
        task_lightrag = lightrag_service.query_data(query=query, mode=lightrag_mode, chunk_top_k=5)
        
        qdrant_docs, lightrag_result = await asyncio.gather(task_qdrant, task_lightrag)

        # 2. XỬ LÝ CHUNKS (GỘP & RERANK)
        unified_chunks: List[UnifiedDocument] = []

        # Đưa Qdrant chunks vào pool
        for doc in qdrant_docs:
            unified_chunks.append(UnifiedDocument(content=doc.content, source_type="Normal", doc_id=str(doc.doc_id)))
                
        # Đưa LightRAG chunks vào pool
        for chunk in lightrag_result.chunks:
            unified_chunks.append(UnifiedDocument(content=chunk.content, source_type="Formal", doc_id=chunk.chunk_id))

        output_lines = []
        artifacts = []

        # Rerank toàn bộ pool hỗn hợp
        if unified_chunks:
            # Lưu ý: Pass unified_chunks vào reranker_service của bạn. 
            # Đảm bảo reranker_service đọc được thuộc tính `content` từ object truyền vào.
            reranked_docs = await reranker_service.rerank(query=query, documents=unified_chunks, top_n=5)
            
            output_lines.append(f"### THÔNG TIN TỪ VĂN BẢN ({len(reranked_docs)} đoạn phù hợp nhất):")
            for doc in reranked_docs:
                output_lines.append(f"- [Nguồn: {doc.source_type} | Điểm: {doc.score:.2f}]: {doc.content}")
                artifacts.append({
                    "doc_id": doc.doc_id, # Hoặc chunk.chunk_id tuỳ cấu trúc của bạn
                    "source_type": getattr(doc, 'source_type', 'Normal')
                })

        # 3. XỬ LÝ ĐỒ THỊ TRI THỨC (Chỉ áp dụng cho Mode Deep)
        if search_depth == "deep":
            entities = lightrag_result.entities
            relationships = lightrag_result.relationships
            
            # Truncate bớt để tránh nổ Context Window của LLM (VD: chỉ lấy top 10 entities/relations)
            entities = entities[:10]
            relationships = relationships[:10]

            if entities or relationships:
                output_lines.append("\n### TÓM TẮT TỪ ĐỒ THỊ TRI THỨC (KNOWLEDGE GRAPH):")
                
                if entities:
                    output_lines.append("**Thực thể chính:**")
                    for e in entities:
                        output_lines.append(f"- {e.entity_name} ({e.entity_type}): {e.description}")
                
                if relationships:
                    output_lines.append("\n**Mối quan hệ:**")
                    for r in relationships:
                        output_lines.append(f"- {r.src_id} -> {r.tgt_id}: {r.description}")

        if not output_lines:
            output_text = "SYSTEM_NOTE: Không tìm thấy thông tin phù hợp trong cả Vector DB và Knowledge Graph."
            if cached_dense_vector:
                try:
                    await semantic_cache_service.upsert(
                        query_text=query,
                        response_text=output_text,
                        artifacts=[],
                        dense_vector=cached_dense_vector,
                        query_mode=query_mode,
                        kb_version=kb_version,
                        namespace=cache_namespace,
                    )
                    logger.info("semantic_cache_write mode=%s kb_version=%s", query_mode, kb_version)
                except Exception:
                    logger.exception("semantic_cache_write_failed")
            return output_text

        output_text = "\n".join(output_lines)
        if cached_dense_vector:
            try:
                await semantic_cache_service.upsert(
                    query_text=query,
                    response_text=output_text,
                    artifacts=artifacts,
                    dense_vector=cached_dense_vector,
                    query_mode=query_mode,
                    kb_version=kb_version,
                    namespace=cache_namespace,
                )
                logger.info("semantic_cache_write mode=%s kb_version=%s", query_mode, kb_version)
            except Exception:
                logger.exception("semantic_cache_write_failed")

        return output_text, artifacts

    except Exception as e:
        logger.exception("Lỗi trong quá trình truy xuất dữ liệu")
        return f"Database Error: {str(e)}"
    
# OLD TOOL: NOT INTEGRATE WITH LIGHTRAG
# @tool
# async def lookup_hcmut_info(query: str, mode: str = "naive"):
#     """
#     Sử dụng công cụ này ĐẦU TIÊN để tìm kiếm thông tin nội bộ về Đại học Bách Khoa TP.HCM (HCMUT).
#     Kết quả trả về sẽ bao gồm độ tin cậy (Score).
#     """
#     logger.error(f"CALL TOOL: lookup_hcmut_info \n QUERY: {query}")

#     collection_doc = "kb_1"
#     collection_faq = "faqs"

#     try:
#         # Lấy Top-K và Score Threshold thấp (0.3) để Agent có dữ liệu đánh giá
#         task_doc = retriever_service.search(
#             query=query, collection_name=collection_doc, top_k=5, score_threshold=0.3
#         )
#         task_faq = retriever_service.search(
#             query=query, collection_name=collection_faq, top_k=2, score_threshold=0.5
#         )
        
#         initial_docs, faq_result = await asyncio.gather(task_doc, task_faq)

#         # Xử lý kết quả trả về cho Agent đọc
#         output_lines = []

#         # 1. Ưu tiên FAQ nếu điểm rất cao
#         # CHECK: Tạm tắt do chất lượng hoạt động kém
#         # if faq_result and faq_result[0].score > 0.98:
#         #      return f"FOUND_EXACT_MATCH (FAQ): {faq_result[0].answer}"

#         # 2. Format Documents kèm Score
#         if initial_docs:
#             docs_result = await reranker_service.rerank(
#                 query=query, 
#                 documents=initial_docs, 
#                 top_n=5
#             )

#             output_lines.append(f"Tìm thấy {len(docs_result)} tài liệu liên quan:")
#             for doc in docs_result:
#                 output_lines.append(
#                     f"\n--- Doc {doc.doc_id} (Score: {doc.score:.2f}) ---\n"
#                     f"Nội dung: {doc.content}"
#                 )
#         else:
#             output_lines.append("SYSTEM_NOTE: Không tìm thấy tài liệu nào khớp trong Database nội bộ.")

#         logger.info(f"FINISH TOOL: lookup_hcmut_info")

#         return "\n".join(output_lines)

#     except Exception as e:
#         return f"Database Error: {str(e)}"

# Tool 2: Web Search (Tavily)
web_search_tool = TavilySearch(
    tavily_api_key=settings.TAVILY_API_KEY,
    max_results=3,
    topic="general",
)

# --- Helper chạy ngầm lưu lại câu hỏi bị thiếu kiến thức---
async def background_log_missing_knowledge(user_id: str, thread_id: str, query: str):
    """Mở một session DB độc lập để lưu log mà không chặn luồng chính."""
    from core.database import AsyncSessionLocal
    from repositories.missing_knowledge_repo import MissingKnowledgeRepository
    
    async with AsyncSessionLocal() as db:
        repo = MissingKnowledgeRepository(db)
        await repo.log_missing_query(user_id=user_id, thread_id=thread_id, query=query)
        logger.info(f"Background task: Logged missing knowledge for query: '{query}'")


# --- Wrapper Tool ---
@tool("tavily_search_results_json")
async def tavily_search_results_json(query: str, config: RunnableConfig):
    """
    CÔNG CỤ TÌM KIẾM WEB DỰ PHÒNG (FALLBACK).
    BẠN CHỈ ĐƯỢC PHÉP SỬ DỤNG CÔNG CỤ NÀY KHI VÀ CHỈ KHI: 
    Bạn đã gọi tool 'lookup_hcmut_info' nhưng các tài liệu trả về KHÔNG LIÊN QUAN hoặc KHÔNG ĐỦ THÔNG TIN để trả lời câu hỏi.
    """
    
    # 1. Trích xuất metadata từ config
    thread_id = config.get("configurable", {}).get("thread_id", "unknown_thread")
    user_id = config.get("configurable", {}).get("user_id", "unknown_user")

    # 2. FIRE-AND-FORGET: Đẩy việc ghi DB ra một task chạy ngầm
    # Agent sẽ đi tiếp ngay lập tức mà không cần đợi DB lưu xong
    asyncio.create_task(background_log_missing_knowledge(
        user_id=user_id, 
        thread_id=thread_id, 
        query=query
    ))

    # 3. Kích hoạt tool Web Search thật (Đã định nghĩa web_search_tool từ trước)
    try:
        result = await web_search_tool.ainvoke({"query": query}, config)
        return result
    except Exception as e:
        logger.exception("Web Search Tool Error")
        return "SYSTEM_ERROR: Không thể truy cập Internet lúc này."

# Agent được nhìn thấy cả 2 tool
tools = [lookup_hcmut_info, tavily_search_results_json]
tool_node = ToolNode(tools)

# ==============================================================================
# AGENT STATE & MODEL
# ==============================================================================

class AgentState(MessagesState):
    pass

async def call_model(state: AgentState, config: RunnableConfig) -> AgentState:
    m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
    m_with_tools = m.bind_tools(tools)

    sys_msg = SystemMessage(content="""
    Bạn là trợ lý ảo AI của trường Đại học Bách Khoa TP.HCM (HCMUT).

    QUY TRÌNH SUY LUẬN (AGENTIC FLOW):
    0. TỪ CHỐI câu hỏi không liên quan tới ngữ cảnh trường đại học và việc hỗ trợ thông tin trường.
    
    1. **Bước 1: Luôn khởi đầu bằng `lookup_hcmut_info`.**
    
    2. **Bước 2: Đánh giá kết quả (Self-Reflection):**
       - Đọc kỹ kết quả trả về từ tool nội bộ.
       - Đánh giá nội dung cung cấp từ `lookup_hcmut_info` có đủ để trả lời câu hỏi không.
       - NẾU tài liệu có ĐỦ THÔNG TIN trả lời đúng câu hỏi -> Trả lời người dùng NGAY và TRÍCH DẪN nguồn tài liệu.
       - NẾU tài liệu KHÔNG LIÊN QUAN hoặc không đủ để đưa ra câu trả lời chính xác -> BẠN KHÔNG ĐƯỢC TRẢ LỜI NGAY. Bắt buộc phải gọi công cụ `tavily_search_results_json` để tìm kiếm trên internet.
    
    3. **Bước 3: Tổng hợp:**
       - Nếu phải dùng Web Search, hãy trả lời kèm cảnh báo: "⚠️ Thông tin tham khảo từ internet".
       - Nếu cả 2 nguồn đều bế tắc, hãy xin lỗi người dùng và nói không có thông tin.

    LƯU Ý QUAN TRỌNG:
    - KHÔNG BỊA ĐẶT thông tin.
    """)

    # Đảm bảo System Message luôn ở đầu
    current_messages = list(state["messages"])
    if not isinstance(current_messages[0], SystemMessage):
        current_messages.insert(0, sys_msg)
    else:
        current_messages[0] = sys_msg # Cập nhật prompt mới nhất

    response = await m_with_tools.ainvoke(current_messages, config)

    # Add time to 
    current_time = datetime.now(timezone.utc).isoformat()
    response.additional_kwargs["timestamp"] = current_time

    return {"messages": [response]}

async def handle_error(state: AgentState):
    last_message = state["messages"][-1]
    tool_outputs = []

    # 1. Phải hồi đáp tất cả các tool_calls đang treo bằng một thông báo lỗi
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_outputs.append(
                ToolMessage(
                    tool_call_id=tool_call["id"],
                    name=tool_call["name"],
                    content="Lỗi: Luồng xử lý bị ngắt do vi phạm logic an toàn hoặc quá giới hạn lượt truy cập."
                )
            )
    
    # 2. Tạo câu trả lời lịch sự cho người dùng
    error_content = "Rất tiếc, tôi không thể tiếp tục tìm kiếm thêm thông tin cho câu hỏi này để đảm bảo độ chính xác. Bạn có thể thử đặt câu hỏi khác cụ thể hơn được không?"
    
    # if len(state["messages"]) > MAX_TURNS * 2:
    #     error_content = "Cuộc hội thoại đã đạt giới hạn tối đa. Bạn vui lòng làm mới (reset) hoặc tóm tắt lại ý chính để mình hỗ trợ tiếp nhé!"

    # Trả về cả ToolMessages (để đóng tool call) và AIMessage (để trả lời user)
    return {"messages": tool_outputs + [AIMessage(content=error_content)]}

# ==============================================================================
# ROUTING LOGIC (GUARDRAILS / CIRCUIT BREAKER)
# ==============================================================================

def route_tools(state: AgentState) -> Literal["tools", "__end__"]:
    """
    Hàm này kiểm soát luồng đi của Agent, ngăn chặn vòng lặp vô tận.
    """
    messages = state["messages"]
    last_message = messages[-1]

    # 1. Nếu Agent trả lời Text (không gọi tool) -> Kết thúc
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        logger.info(f"END: không gọi tool")
        return END

    # # 2. Safety Check: Nếu hội thoại quá dài -> Cắt để tránh tốn tiền
    # if len(messages) > MAX_TURNS * 2:
    #     logger.info(f"END: hội thoại quá dài")
    #     return "handle_error"

    # 3. Phân tích hành vi Agent
    # Lấy danh sách tool Agent ĐANG MUỐN gọi
    current_tool_calls = [tc["name"] for tc in last_message.tool_calls]
    logger.info(f"TOOL: {current_tool_calls}")

    last_human_index = 0
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            last_human_index = i
            break
            
    # Chỉ lấy các tin nhắn trong lượt hội thoại hiện tại (từ lúc user hỏi đến giờ)
    current_turn_messages = messages[last_human_index:]

    # Lấy danh sách tool ĐÃ từng gọi trong lượt này
    past_tools_called = [
        msg.name for msg in current_turn_messages 
        if isinstance(msg, ToolMessage)
    ]

    # --- RULE 1: BLOCK LOOP WEB SEARCH ---
    # Nếu muốn gọi Tavily, mà trước đó đã gọi Tavily rồi -> CẤM
    if "tavily_search_results_json" in current_tool_calls:
        if "tavily_search_results_json" in past_tools_called:
            logger.info(f"END: trước đó đã gọi Tavily rồi")
            return "handle_error"

    # --- RULE 2: BLOCK REGRESSION (KHÔNG QUAY ĐẦU) ---
    # Nếu muốn gọi Lookup (Internal), mà trước đó đã gọi Web Search rồi -> CẤM
    # (Vì logic là: Internal -> Web -> End. Không có chiều ngược lại)
    if "lookup_hcmut_info" in current_tool_calls:
        if "tavily_search_results_json" in past_tools_called:
            logger.info(f"END: Không có chiều ngược lại")
            return "handle_error"

    # Nếu hợp lệ -> Cho phép đi vào node Tools
    return "tools"

# ==============================================================================
# GRAPH DEFINITION
# ==============================================================================
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("agent", call_model)
workflow.add_node("tools", tool_node)
workflow.add_node("handle_error", handle_error)

# Entry Point
workflow.set_entry_point("agent")

# Conditional Edges (Dùng hàm route_tools tự viết)
workflow.add_conditional_edges(
    "agent",
    route_tools,
    {
        "tools": "tools",
        "handle_error": "handle_error", # Trỏ về node xử lý lỗi
        "__end__": END
    }
)

# Edge quay lại
workflow.add_edge("tools", "agent")
workflow.add_edge("handle_error", END)

# Compile
kb_agent = workflow.compile()


# # # ============= VERSION 3: 10/02/2026 ============

# import logging
# import asyncio
# from typing import Any, List, Annotated

# # --- LangChain / LangGraph imports ---
# from langchain_core.language_models.chat_models import BaseChatModel
# from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
# from langchain_core.tools import tool
# from langchain_core.runnables import RunnableConfig
# from langgraph.graph import END, MessagesState, StateGraph
# from langgraph.prebuilt import ToolNode, tools_condition
# from langchain_tavily import TavilySearch

# # --- Project imports ---
# from core import get_model, settings
# from rag_utils.retriever import QdrantHybridRetriever

# logger = logging.getLogger(__name__)

# # ==============================================================================
# # CONFIGURATION
# # ==============================================================================
# FAQ_THRESHOLD = 0.90

# # ==============================================================================
# # INIT SERVICES
# # ==============================================================================
# retriever_service = QdrantHybridRetriever()

# # ==============================================================================
# # DEFINING TOOLS
# # ==============================================================================

# @tool
# async def lookup_hcmut_info(query: str):
#     """
#     Sử dụng công cụ này ĐẦU TIÊN để tìm kiếm thông tin về Trường Đại học Bách Khoa TP.HCM (HCMUT).
#     Bao gồm: quy chế, tuyển sinh, chương trình học, học phí, hoạt động sinh viên, FAQ...
#     """
#     # 1. Cấu hình Collection (Có thể hardcode hoặc lấy từ logic dynamic nếu cần)
#     collection_doc = "kb_1"
#     collection_faq = "faqs"

#     try:
#         # 2. Tìm kiếm song song (FAQ + Docs)
#         task_doc = retriever_service.search(
#             query=query, collection_name=collection_doc, top_k=4, score_threshold=0.4
#         )
#         task_faq = retriever_service.search(
#             query=query, collection_name=collection_faq, top_k=2, score_threshold=0.6
#         )
        
#         docs_result, faq_result = await asyncio.gather(task_doc, task_faq)

#         # 3. Logic ưu tiên FAQ
#         best_faq = faq_result[0] if faq_result else None
        
#         # Nếu trúng FAQ điểm cao -> Trả về câu trả lời ngay
#         if best_faq and best_faq.score >= FAQ_THRESHOLD:
#             # Lấy câu trả lời từ metadata hoặc fallback
#             final_answer = getattr(best_faq, "answer", None) 
#             if not final_answer: 
#                  final_answer = best_faq.metadata.get("answer") or best_faq.content
            
#             return f"FOUND_IN_FAQ: {final_answer}"

#         # 4. Nếu không trúng FAQ -> Trả về danh sách Documents
#         if not docs_result:
#             return "Xin lỗi, không tìm thấy thông tin nào trong cơ sở dữ liệu nội bộ."

#         # Format kết quả trả về cho LLM đọc
#         formatted_docs = "\n\n".join(
#             [
#                 f"--- Source (Score: {doc.score:.2f}) ---\n{doc.content}"
#                 for doc in docs_result
#             ]
#         )
#         return f"FOUND_DOCUMENTS:\n{formatted_docs}"

#     except Exception as e:
#         return f"Error searching database: {str(e)}"

# # Tool 2: Web Search (Tavily)
# web_search_tool = TavilySearch(
#     tavily_api_key=settings.TAVILY_API_KEY,
#     max_results=3,
#     topic="general",
# )

# # Danh sách Tools
# tools = [lookup_hcmut_info, web_search_tool]

# # Tạo ToolNode
# tool_node = ToolNode(tools)

# # ==============================================================================
# # AGENT STATE
# # ==============================================================================
# # Với Agentic RAG, state đơn giản chỉ cần danh sách messages
# class AgentState(MessagesState):
#     pass

# # ==============================================================================
# # MODEL NODE LOGIC
# # ==============================================================================

# async def call_model(state: AgentState, config: RunnableConfig) -> AgentState:
#     m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
    
#     # Bind tools để model biết nó có quyền dùng
#     m_with_tools = m.bind_tools(tools)

#     # System Prompt "Brain" của Agent
#     sys_msg = SystemMessage(content="""
#     Bạn là trợ lý ảo AI hỗ trợ cho sinh viên và phụ huynh trường Đại học Bách Khoa TP.HCM (HCMUT).

#     QUY TRÌNH SUY LUẬN (THỰC HIỆN THEO THỨ TỰ):
    
#     1. **PHÂN LOẠI CÂU HỎI:**
#        - Nếu là chào hỏi xã giao (Hi, Xin chào) -> Trả lời lịch sự ngay, KHÔNG dùng tool.
#        - Nếu câu hỏi KHÔNG liên quan đến Bách Khoa TP.HCM (vd: nấu ăn, bóng đá, thời tiết) -> Từ chối lịch sự.
#        - Nếu câu hỏi liên quan đến trường -> Chuyển sang bước 2.

#     2. **TRA CỨU NỘI BỘ (Ưu tiên số 1):**
#        - BẮT BUỘC dùng tool `lookup_hcmut_info` trước tiên.
#        - Nếu tool trả về "FOUND_IN_FAQ: ...", hãy dùng nội dung đó trả lời y hệt cho người dùng.
#        - Nếu tool trả về "FOUND_DOCUMENTS: ...", hãy tổng hợp thông tin từ đó để trả lời.
#        - KHÔNG ĐƯỢC ĐƯA THÔNG TIN KHÁC NGOÀI tool `lookup_hcmut_info` cung cấp. Khi không có thông tin phù hợp thì sử dụng TÌM KIẾM WEB

#     3. **TÌM KIẾM WEB (Ưu tiên số 2 - Fallback):**
#        - CHỈ KHI tool nội bộ trả về "không tìm thấy thông tin" HOẶC thông tin quá sơ sài, bạn mới được dùng tool `tavily_search_results_json`.
    
#     4. **CẢNH BÁO:**
#        - Nếu bạn trả lời dựa trên kết quả từ `tavily_search_results_json`, CUỐI CÂU TRẢ LỜI PHẢI CÓ DÒNG SAU:
#          "⚠️ *Lưu ý: Thông tin này được tìm kiếm từ internet để tham khảo, không phải thông tin từ cơ sở dữ liệu chính thống của trường.*"
#     """)

#     # Ghép System Message vào đầu conversation
#     # Lưu ý: check xem trong messages đã có system message chưa để tránh duplicate
#     if state["messages"] and isinstance(state["messages"][0], SystemMessage):
#         messages = state["messages"] # Đã có rồi thì thôi (thường LangGraph giữ state)
#         # Tuy nhiên nếu muốn override prompt động thì replace cái đầu tiên
#         messages[0] = sys_msg
#     else:
#         messages = [sys_msg] + state["messages"]

#     response = await m_with_tools.ainvoke(messages, config)
#     return {"messages": [response]}

# # ==============================================================================
# # GRAPH DEFINITION
# # ==============================================================================
# workflow = StateGraph(AgentState)

# # Add Nodes
# workflow.add_node("agent", call_model)
# workflow.add_node("tools", tool_node)

# # Set Entry Point -> Vào thẳng Agent (LLM) để nó suy nghĩ
# workflow.set_entry_point("agent")

# # Conditional Edge: Agent quyết định đi đâu?
# # - Có tool_calls -> Qua node "tools"
# # - Trả lời xong (text) -> END
# workflow.add_conditional_edges(
#     "agent",
#     tools_condition,
# )

# # Edge: Tools chạy xong thì quay lại Agent để đọc kết quả
# workflow.add_edge("tools", "agent")

# # Compile
# kb_agent = workflow.compile()


# # ============= VERSION 2: 08/02/2026 ============

# import logging
# import asyncio
# from typing import Any, List

# # --- LangChain / LangGraph imports ---
# from langchain_core.language_models.chat_models import BaseChatModel
# from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
# from langchain_core.runnables import RunnableConfig, RunnableLambda, RunnableSerializable
# from langchain_core.runnables.base import RunnableSequence
# from langgraph.graph import END, MessagesState, StateGraph
# from langgraph.managed import RemainingSteps
# from langchain_tavily import TavilySearch
# from langgraph.prebuilt import ToolNode, tools_condition

# # --- Project imports ---
# from core import get_model, settings
# from rag_utils.retriever import QdrantHybridRetriever, RetrievedChunk
# logger = logging.getLogger(__name__)

# # ==============================================================================
# # CONFIGURATION
# # ==============================================================================
# # Ngưỡng tin cậy để quyết định dùng FAQ. 
# # Nếu FAQ score >= 0.80 -> Dùng FAQ. Thấp hơn -> Dùng Documents.
# FAQ_THRESHOLD = 0.80 

# # ==============================================================================
# # STATE DEFINITION
# # ==============================================================================
# class AgentState(MessagesState, total=False):
#     """State for Knowledge Base agent."""
#     remaining_steps: RemainingSteps
#     retrieved_documents: list[dict[str, Any]]
#     kb_documents: str
#     is_faq_hit: bool  # Cờ đánh dấu xem có phải hit FAQ không

# # ==============================================================================
# # INIT RETRIEVER (Singleton)
# # ==============================================================================
# retriever_service = QdrantHybridRetriever()

# # ==============================================================================
# # TOOLS
# # ==============================================================================
# # Khởi tạo Tavily Search Tool
# web_search_tool = TavilySearch(
#     tavily_api_key=settings.TAVILY_API_KEY,
#     max_results=5,
#     topic="general",
# )
# tools = [web_search_tool]

# # Tạo ToolNode để LangGraph tự động chạy tool khi LLM yêu cầu
# tool_node = ToolNode(tools)

# # ==============================================================================
# # NODES
# # ==============================================================================

# async def retrieve_documents(state: AgentState, config: RunnableConfig) -> AgentState:
#     """
#     Node LangGraph: Tìm kiếm song song từ FAQ và Documents (Hybrid Search)
#     """
#     human_messages = [msg for msg in state["messages"] if isinstance(msg, HumanMessage)]
#     if not human_messages:
#         return {"retrieved_documents": [], "is_faq_hit": False}

#     query = human_messages[-1].content
    
#     # 1. Xác định Collection Names
#     collection_faq = "faqs" # Giả sử quy tắc đặt tên là faq_{id}
#     kb_id = config.get("configurable", {}).get("kb_id")
#     if not kb_id:
#         collection_doc = "kb_1" 
#         logger.warning("Không tìm thấy kb_id, dùng default: 'kb_1'")
#     else:
#         collection_doc = f"kb_{kb_id}"
#         collection_faq = f"faq_{kb_id}" # Hoặc "global_faq" tùy logic của bạn

#     try:
#         # 2. Chạy tìm kiếm song song (Parallel Execution)
#         # Task 1: Tìm trong Documents (Lấy top 5)
#         task_doc = retriever_service.search(
#             query=query, collection_name=collection_doc, top_k=5, score_threshold=0.4
#         )
        
#         # Task 2: Tìm trong FAQ (Chỉ cần top 1 hoặc 3 để check match)
#         task_faq = retriever_service.search(
#             query=query, collection_name=collection_faq, top_k=3, score_threshold=0.6
#         )

#         # Chờ cả 2 xong
#         docs_result, faq_result = await asyncio.gather(task_doc, task_faq)

#         # 3. Logic Quyết định: Ưu tiên FAQ
#         # Kiểm tra xem có FAQ nào điểm cao vượt ngưỡng không
#         best_faq = faq_result[0] if faq_result else None
        
#         if best_faq and best_faq.score >= FAQ_THRESHOLD:
#             logger.info(f"FAQ HIT! Score: {best_faq.score} - Query: {query}")
            
#             # --- XỬ LÝ ĐẶC BIỆT CHO FAQ ---
#             # Lấy câu trả lời gốc từ metadata
#             final_answer = best_faq.answer
            
#             # QUAN TRỌNG: Tạo AIMessage ngay tại đây
#             # Đây chính là hành động "không gen", mà lấy text có sẵn trả về luôn
#             direct_response = AIMessage(content=final_answer)
            
#             return {
#                 "messages": [direct_response], # Append tin nhắn này vào lịch sử
#                 "is_faq_hit": True,            # Cờ để router biết đường đi
#                 "retrieved_documents": []
#             }

#         # 4. Fallback: Nếu không trúng FAQ, dùng kết quả Documents
#         logger.info(f"Using Documents. Retrieved {len(docs_result)} docs from {collection_doc}")
        
#         document_summaries = []
#         for doc in docs_result:
#             document_summaries.append({
#                 "id": doc.chunk_id,
#                 "doc_id": doc.doc_id,
#                 "type": doc.source_type,
#                 "content": doc.content, # Với doc thường, content là nội dung cần đọc
#                 "score": doc.score,
#                 "metadata": doc.metadata
#             })
            
#         return {
#             "retrieved_documents": document_summaries,
#             "is_faq_hit": False
#         }

#     except Exception as e:
#         logger.exception(f"Retrieval failed for query: '{query}: \n {e}'")
#         return {"retrieved_documents": [], "is_faq_hit": False}


# async def prepare_augmented_prompt(state: AgentState, config: RunnableConfig) -> AgentState:
#     """Prepare a prompt augmented with retrieved document content."""
#     documents = state.get("retrieved_documents", [])

#     if not documents:
#         return {"kb_documents": "", "messages": []}

#     # Format chuẩn cho Document Chunk
#     formatted_docs = "\n\n".join(
#         [
#             f"--- Document {i + 1} ---\n"
#             f"Source: {doc.get('type', 'Unknown')} (ID: {doc.get('doc_id')})\n"
#             f"{doc.get('content', '')}"
#             for i, doc in enumerate(documents)
#         ]
#     )

#     return {"kb_documents": formatted_docs, "messages": []}


# def wrap_model(model: BaseChatModel) -> RunnableSerializable[AgentState, AIMessage]:
#     """Wrap the model with a system prompt dynamically based on context."""

#     # def create_system_message(state):
        
#     #     # Base prompt chung
#     #     base_prompt = "You are a helpful assistant."

#     #     # Prompt suy luận cho Documents
#     #     instructions = """
#     #     You will receive retrieved documents from a knowledge base.
        
#     #     Guidelines:
#     #     1. Base your answer primarily on the retrieved documents.
#     #     2. If documents are insufficient, state that you don't have enough info.
#     #     3. Always cite sources if possible.
#     #     """

#     #     # Context injection
#     #     document_prompt = f"\n\nCONTEXT INFORMATION:\n{state['kb_documents']}\n\nPlease answer the user based on the context above."
#     #     full_content = base_prompt + instructions + document_prompt

#     #     return [SystemMessage(content=full_content)] + state["messages"]

#     # preprocessor = RunnableLambda(
#     #     create_system_message,
#     #     name="StateModifier",
#     # )
#     # return RunnableSequence(preprocessor, model)

#     def create_system_message(state):
#         base_prompt = "You are a helpful assistant for HCMUT (Trường Đại học Bách Khoa ĐHQG-HCM)."

#         # CẬP NHẬT LOGIC VỚI GUARDRAIL
#         instructions = """
#         You have access to a knowledge base (retrieved documents) and a web search tool.
        
#         INSTRUCTIONS:
#         0. **SCOPE VALIDATION (CRITICAL):** - FIRST, evaluate if the user's question is related to "Trường Đại học Bách Khoa TP.HCM" (HCMUT), its academic programs, student life, regulations, or campus activities.
#            - If the question is **completely unrelated** (e.g., "How to cook pasta", "Weather in Tokyo", "Who is Messi"), you must **REFUSE** to answer. 
#            - In this case, reply politely: "Tôi chỉ có thể hỗ trợ các câu hỏi liên quan đến trường Đại học Bách Khoa TP.HCM." and **DO NOT use any tools**.

#         1. **CHECK CONTEXT:** - If the question IS related to the university, check the "CONTEXT INFORMATION" below.
#            - If the context contains the answer, answer ONLY based on the context. Do NOT use the search tool.
#            - Always cite sources if using CONTEXT INFORMATION.

#         2. **WEB SEARCH FALLBACK:** - ONLY if the question is related to the university BUT the context is empty or insufficient, you MUST use the 'tavily_search_results_json' tool to find the answer.
#            - 
#         3. **SYNTHESIS & DISCLAIMER:**
#            - If you use the search tool, synthesize the answer based on the search results.
#            - **IMPORTANT:** If the answer is derived from the search tool, you MUST end your response with the following disclaimer:
             
#              "⚠️ *Lưu ý: Thông tin này được tìm kiếm từ internet để tham khảo, không phải thông tin từ cơ sở dữ liệu chính thống của trường.*"
#         """

#         # Context injection
#         # Nếu không có docs thì kb_documents là chuỗi rỗng
#         document_prompt = f"\n\nCONTEXT INFORMATION:\n{state.get('kb_documents', 'No documents found.')}\n\nPlease answer the user."
        
#         full_content = base_prompt + instructions + document_prompt

#         return [SystemMessage(content=full_content)] + state["messages"]

#     preprocessor = RunnableLambda(
#         create_system_message,
#         name="StateModifier",
#     )
#     return RunnableSequence(preprocessor, model)


# async def acall_model(state: AgentState, config: RunnableConfig) -> AgentState:
#     """Generate a response."""
#     m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))

#     m_with_tools = m.bind_tools(tools)

#     model_runnable = wrap_model(m_with_tools)
#     response = await model_runnable.ainvoke(state, config)
#     return {"messages": [response]}

# def route_retrieval(state: AgentState):
#     """
#     Điều hướng:
#     - Nếu đã trúng FAQ (is_faq_hit=True) -> Kết thúc luôn (END).
#     - Nếu chưa -> Qua bước RAG (prepare_augmented_prompt).
#     """
#     if state.get("is_faq_hit"):
#         return END
    
#     return "prepare_augmented_prompt"

# # ==============================================================================
# # GRAPH DEFINITION
# # ==============================================================================
# agent = StateGraph(AgentState)

# # Add nodes
# agent.add_node("retrieve_documents", retrieve_documents)
# agent.add_node("prepare_augmented_prompt", prepare_augmented_prompt)
# agent.add_node("model", acall_model)
# agent.add_node("tools", tool_node) # Node mới để chạy Tavily

# # Set entry point
# agent.set_entry_point("retrieve_documents")

# # Edge 1: Retrieve -> Router (Check FAQ)
# agent.add_conditional_edges(
#     "retrieve_documents",
#     route_retrieval, # Hàm cũ của bạn
#     {
#         END: END, # Trúng FAQ -> End
#         "prepare_augmented_prompt": "prepare_augmented_prompt" # Không trúng -> RAG
#     }
# )

# # Edge 2: Prepare -> Model
# agent.add_edge("prepare_augmented_prompt", "model")

# # Edge 3 (MỚI): Model -> Tools Condition (Check xem LLM có muốn search web không)
# # tools_condition là hàm có sẵn của LangGraph, nó check message cuối có tool_calls không
# agent.add_conditional_edges(
#     "model",
#     tools_condition, 
#     {
#         "tools": "tools", # Nếu LLM gọi tool -> Sang node tools
#         END: END          # Nếu LLM trả lời text thường -> End
#     }
# )

# # Edge 4 (MỚI): Tools -> Model (Search xong thì quay lại Model để tóm tắt kết quả)
# agent.add_edge("tools", "model")

# # Compile
# kb_agent = agent.compile()

# # ==============================================================================
# # GRAPH DEFINITION
# # ==============================================================================
# # Define the graph
# agent = StateGraph(AgentState)

# # Add nodes
# agent.add_node("retrieve_documents", retrieve_documents)
# agent.add_node("prepare_augmented_prompt", prepare_augmented_prompt)
# agent.add_node("model", acall_model)

# # Set entry point
# agent.set_entry_point("retrieve_documents")

# # dùng add_conditional_edges
# agent.add_conditional_edges(
#     "retrieve_documents",   # Node bắt đầu
#     route_retrieval,        # Hàm quyết định
#     {
#         END: END,   # Nếu hàm trả về END -> Kết thúc
#         "prepare_augmented_prompt": "prepare_augmented_prompt" # Nếu trả về tên node -> đi tiếp
#     }
# )

# # Các cạnh còn lại của luồng RAG giữ nguyên
# agent.add_edge("prepare_augmented_prompt", "model")
# agent.add_edge("model", END)

# # Compile
# kb_agent = agent.compile()

# ============= VERSION 1: 07/02/2026 ============

# import logging
# import os
# from typing import Any

# from langchain_aws import AmazonKnowledgeBasesRetriever
# from langchain_core.language_models.chat_models import BaseChatModel
# from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
# from langchain_core.runnables import RunnableConfig, RunnableLambda, RunnableSerializable
# from langchain_core.runnables.base import RunnableSequence
# from langgraph.graph import END, MessagesState, StateGraph
# from langgraph.managed import RemainingSteps

# from core import get_model, settings

# logger = logging.getLogger(__name__)


# # Define the state
# class AgentState(MessagesState, total=False):
#     """State for Knowledge Base agent."""

#     remaining_steps: RemainingSteps
#     retrieved_documents: list[dict[str, Any]]
#     kb_documents: str

# # ========= NEW ==============

# import logging
# from typing import List, Dict, Any
# from pydantic import BaseModel
# from langchain_core.messages import HumanMessage
# from langchain_core.runnables import RunnableConfig

# from rag_utils.retriever import QdrantHybridRetriever

# logger = logging.getLogger(__name__)

# class RetrievedChunk(BaseModel):
#     chunk_id: str
#     content: str       # Nội dung trả lời
#     score: float       # Độ liên quan
#     doc_id: int        # ID file gốc (để trích dẫn nếu cần)
#     source_type: str   # 'pdf', 'docx', etc.
#     metadata: Dict[str, Any]

# # --- INIT RETRIEVER (Singleton) ---
# # Khởi tạo 1 lần duy nhất ở cấp module để tái sử dụng connection pool & models
# # Retriever này tự động init Encoder (Azure + Sparse) bên trong nó.
# retriever_service = QdrantHybridRetriever()

# async def retrieve_documents(state: AgentState, config: RunnableConfig) -> AgentState:
#     """
#     Node LangGraph: Tìm kiếm tài liệu từ Qdrant (Hybrid Search)
#     """
#     # 1. Lấy câu query từ tin nhắn cuối cùng của user
#     human_messages = [
#         msg for msg in state["messages"]
#         if isinstance(msg, HumanMessage)
#     ]
#     if not human_messages:
#         return {"retrieved_documents": []}

#     query = human_messages[-1].content
    
#     # 2. Xác định Knowledge Base ID (Collection Name)
#     # Trong môi trường Production, ID này thường đến từ config của phiên chat (user đang chat với bot nào?)
#     # Config này được truyền vào khi invoke graph: app.invoke(..., config={"configurable": {"kb_id": "123"}})
    
#     kb_id = config.get("configurable", {}).get("kb_id")
    
#     # Fallback: Nếu không có kb_id, dùng ID mặc định hoặc hardcode (theo logic cũ của bạn)
#     # Ví dụ: nếu storage_id của document upload lên là '1', thì collection là 'kb_1'
#     if not kb_id:
#         # TODO: Bạn hãy thay '1' bằng logic lấy ID thực tế của bạn
#         collection_name = "kb_1" 
#         logger.warning("Không tìm thấy kb_id trong config, dùng default: 'kb_1'")
#     else:
#         collection_name = f"kb_{kb_id}"

#     try:
#         # 🔥 3. GỌI RETRIEVER MỚI
#         # Hàm này trả về List[RetrievedChunk] (Pydantic Object)
#         docs = await retriever_service.search(
#             query=query,
#             collection_name=collection_name,
#             top_k=5,
#             score_threshold=0.4 # Lọc bớt kết quả nhiễu nếu cần
#         )

#         # 4. Map kết quả sang định dạng JSON cho LLM/Prompt
#         document_summaries = []
#         for i, doc in enumerate(docs, 1):
#             document_summaries.append({
#                 # doc là Object, dùng dấu chấm (.) để truy cập, KHÔNG dùng doc["key"]
#                 "id": doc.chunk_id,
#                 "doc_id": doc.doc_id, # ID file gốc để trích dẫn
#                 "type": doc.source_type, # pdf/docx...
                
#                 # Content lấy trực tiếp từ Payload Qdrant (code cũ là lấy từ SQLite)
#                 "content": doc.content, 
                
#                 "score": doc.score,
#                 "metadata": doc.metadata
#             })

#         logger.info(f"Retrieved {len(document_summaries)} docs from {collection_name}")
        
#         return {
#             "retrieved_documents": document_summaries
#         }

#     except Exception as e:
#         logger.exception(f"Retrieval failed for query: '{query}'")
#         return {"retrieved_documents": []}

# # =============================

# def wrap_model(model: BaseChatModel) -> RunnableSerializable[AgentState, AIMessage]:
#     """Wrap the model with a system prompt for the Knowledge Base agent."""

#     def create_system_message(state):
#         base_prompt = """You are a helpful assistant that provides accurate information based on retrieved documents.

#         You will receive a query along with relevant documents retrieved from a knowledge base. Use these documents to inform your response.

#         Follow these guidelines:
#         1. Base your answer primarily on the retrieved documents
#         2. If the documents contain the answer, provide it clearly and concisely
#         3. If the documents are insufficient, state that you don't have enough information
#         4. Never make up facts or information not present in the documents
#         5. Always cite the source documents when referring to specific information
#         6. If the documents contradict each other, acknowledge this and explain the different perspectives

#         Format your response in a clear, conversational manner. Use markdown formatting when appropriate.
#         """

#         # Check if documents were retrieved
#         if "kb_documents" in state:
#             # Append document information to the system prompt
#             document_prompt = f"\n\nI've retrieved the following documents that may be relevant to the query:\n\n{state['kb_documents']}\n\nPlease use these documents to inform your response to the user's query. Only use information from these documents and clearly indicate when you are unsure."
#             return [SystemMessage(content=base_prompt + document_prompt)] + state["messages"]
#         else:
#             # No documents were retrieved
#             no_docs_prompt = (
#                 "\n\nNo relevant documents were found in the knowledge base for this query."
#             )
#             return [SystemMessage(content=base_prompt + no_docs_prompt)] + state["messages"]

#     preprocessor = RunnableLambda(
#         create_system_message,
#         name="StateModifier",
#     )
#     return RunnableSequence(preprocessor, model)

# async def prepare_augmented_prompt(state: AgentState, config: RunnableConfig) -> AgentState:
#     """Prepare a prompt augmented with retrieved document content."""
#     # Get retrieved documents
#     documents = state.get("retrieved_documents", [])

#     if not documents:
#         return {"messages": []}

#     # Format retrieved documents for the model
#     formatted_docs = "\n\n".join(
#         [
#             f"--- Document {i + 1} ---\n"
#             f"Source: {doc.get('source', 'Unknown')}\n"
#             f"Title: {doc.get('title', 'Unknown')}\n\n"
#             f"{doc.get('content', '')}"
#             for i, doc in enumerate(documents)
#         ]
#     )

#     # Store formatted documents in the state
#     return {"kb_documents": formatted_docs, "messages": []}


# async def acall_model(state: AgentState, config: RunnableConfig) -> AgentState:
#     """Generate a response based on the retrieved documents."""
#     m = get_model(config["configurable"].get("model", settings.DEFAULT_MODEL))
#     model_runnable = wrap_model(m)

#     response = await model_runnable.ainvoke(state, config)

#     return {"messages": [response]}


# # Define the graph
# agent = StateGraph(AgentState)

# # Add nodes
# agent.add_node("retrieve_documents", retrieve_documents)
# agent.add_node("prepare_augmented_prompt", prepare_augmented_prompt)
# agent.add_node("model", acall_model)

# # Set entry point
# agent.set_entry_point("retrieve_documents")

# # Add edges to define the flow
# agent.add_edge("retrieve_documents", "prepare_augmented_prompt")
# agent.add_edge("prepare_augmented_prompt", "model")
# agent.add_edge("model", END)

# # Compile the agent
# kb_agent = agent.compile()
