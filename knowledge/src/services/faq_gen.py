import json
import logging
from typing import List, Dict, Optional
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from src.core.config import settings

logger = logging.getLogger(__name__)

class FAQGeneration:
    _chat_model: Optional[AzureChatOpenAI] = None

    def __init__(self):
        # Singleton: Khởi tạo model 1 lần duy nhất
        if FAQGeneration._chat_model is None:
            FAQGeneration._chat_model = AzureChatOpenAI(
                deployment_name=settings.AZURE_OPENAI_API_MODEL_NAME,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
                api_key=settings.AZURE_OPENAI_API_KEY,
                api_version=settings.AZURE_OPENAI_API_VERSION,
                
                # Temperature 0.1 - 0.3: Giúp model "nghiêm túc", bám sát văn bản, ít bịa đặt (hallucination)
                temperature=0.1, 
                
                # Auto Retry: Tự động thử lại nếu Azure bị rate limit hoặc lỗi 5xx
                max_retries=3,
                
                # JSON Mode: Bắt buộc model trả về JSON (Quan trọng)
                model_kwargs={"response_format": {"type": "json_object"}}
            )
        self.client = FAQGeneration._chat_model

    async def generate_faq_from_text(self, text: str) -> List[Dict]:
        """
        Input: Text chunk (Tiếng Việt)
        Output: List FAQ (JSON struct)
        """
        
        # --- 1. PROMPT ENGINEERING (CHUẨN TIẾNG VIỆT) ---
        system_prompt = """
        Bạn là một Chuyên gia Quản lý Tri thức và Trợ lý AI cao cấp.
        Nhiệm vụ của bạn là phân tích văn bản kỹ thuật được cung cấp và trích xuất danh sách các "Câu hỏi thường gặp" (FAQ).

        YÊU CẦU BẮT BUỘC:
        1.  **Ngôn ngữ:** Sử dụng Tiếng Việt 100%, văn phong chuyên nghiệp, rõ ràng.
        2.  **Nội dung:** Chỉ trích xuất thông tin CÓ THẬT trong văn bản. Tuyệt đối không bịa đặt.
        3.  **Cấu trúc câu hỏi:**
            -   Tạo ra 1 câu hỏi chính (ngắn gọn, trực diện).
            -   Tạo thêm 3 "biến thể" (variants) cho câu hỏi đó (cùng ý nghĩa nhưng khác cách diễn đạt, ví dụ: dùng từ đồng nghĩa, đảo ngữ) để tăng khả năng tìm kiếm vector.
        4.  **Định dạng Output:** Chỉ trả về JSON hợp lệ.

        JSON SCHEMA (Bắt buộc tuân thủ):
        {
            "faqs": [
                {
                    "question": "Câu hỏi chính là gì?",
                    "answer": "Câu trả lời chi tiết dựa trên văn bản.",
                    "variants": ["Cách diễn đạt khác 1?", "Cách diễn đạt khác 2?"]
                }
            ]
        }
        """

        # Cắt ngắn text để tránh lỗi token limit của Azure (thường là 4k - 128k tùy model)
        # 3000 ký tự là ngưỡng an toàn cho chunk trung bình
        user_prompt = f"Văn bản cần xử lý:\n\n---\n{text[:3000]}\n---\n\nHãy trích xuất FAQ dưới dạng JSON:"

        try:
            # --- 2. GỌI AZURE OPENAI ---
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            # Gọi Async để không chặn luồng Celery
            response = await self.client.ainvoke(messages)
            content = response.content

            # --- 3. PARSE & VALIDATE JSON ---
            parsed_data = self._clean_and_parse_json(content)
            
            # Kiểm tra xem JSON có đúng schema "faqs" list không
            faqs = parsed_data.get("faqs", [])
            if not isinstance(faqs, list):
                logger.warning("LLM trả về JSON nhưng thiếu key 'faqs' hoặc sai định dạng.")
                return []
            
            # Filter các FAQ rỗng hoặc lỗi
            valid_faqs = []
            for item in faqs:
                if item.get("question") and item.get("answer"):
                    valid_faqs.append(item)

            return valid_faqs

        except Exception as e:
            # Log lỗi chi tiết để debug (quan trọng trong môi trường Prod)
            logger.error(f"Lỗi khi gọi Azure OpenAI sinh FAQ: {str(e)}")
            # Trả về list rỗng để Pipeline không bị crash, chỉ là chunk đó không có FAQ
            return []

    def _clean_and_parse_json(self, raw_content: str) -> Dict:
        """
        Hàm clean data "nồi đồng cối đá" để xử lý các trường hợp 
        LLM trả về kèm markdown (```json ... ```)
        """
        try:
            cleaned = raw_content.strip()
            # Loại bỏ markdown fences nếu có
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            elif cleaned.startswith("```"): # Trường hợp nó quên chữ json
                cleaned = cleaned[3:]
            
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.error(f"Không thể parse JSON từ LLM. Raw content: {raw_content[:100]}...")
            return {}