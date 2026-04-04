from uuid import uuid4
from repositories.chat_repo import ChatRepository
from schema.conversation import Conversation
from core.settings import settings
from fastapi import HTTPException, BackgroundTasks

import logging
from core.database import AsyncSessionLocal 
from langchain_core.prompts import PromptTemplate
from langchain_groq import ChatGroq 

logger = logging.getLogger(__name__)

async def background_generate_title(thread_id: str, first_query: str):
    """
    Hàm gọi Groq tạo tiêu đề và lưu xuống DB.
    """
    try:
        # 1. Khởi tạo LLM với Groq
        # Llama 3.1 8B là lựa chọn cực tốt: siêu nhanh, siêu rẻ, khả năng tiếng Việt tốt
        llm = ChatGroq(
            model="llama-3.1-8b-instant", # Hoặc dùng "gemma2-9b-it" / "mixtral-8x7b-32768"
            temperature=0.3, 
            max_tokens=20,
            api_key=settings.MY_GROQ_API_KEY # Đổi sang biến môi trường của Groq
        )
        
        # 2. Prompt siêu ngắn gọn
        prompt = PromptTemplate.from_template(
            "Tóm tắt truy vấn sau thành tiêu đề hội thoại ngắn gọn (từ 5-8 từ). "
            "Không dùng dấu ngoặc kép, không giải thích dài dòng.\nTruy vấn: {query}"
        )
        
        chain = prompt | llm
        response = await chain.ainvoke({"query": first_query})
        
        # Xóa các ký tự thừa
        generated_title = response.content.strip(' "\'\n')
        
        # 3. Mở DB session MỚI để lưu dữ liệu
        async with AsyncSessionLocal() as db:
            repo = ChatRepository(db)
            await repo.update_thread_title(thread_id, generated_title)
            logger.info(f"Đã cập nhật title ngầm cho thread {thread_id}: {generated_title}")
            
    except Exception as e:
        logger.error(f"Lỗi khi generate title ngầm cho thread {thread_id}: {e}")

class ChatService:
    def __init__(self, repo: ChatRepository, user_id: str):
        self.repo = repo
        self.user_id = user_id

    # Dùng cho /invoke và /stream (Chat)
    async def get_or_create_thread(
        self, 
        thread_id: str | None, 
        user_query: str, 
        background_tasks: BackgroundTasks = None
    ) -> str:
        
        # Trường hợp 1: Client không truyền ID -> Tự sinh ID, tạo mới
        if not thread_id:
            new_id = str(uuid4())
            new_thread = Conversation(id=new_id, user_id=self.user_id, title="Hội thoại mới")
            await self.repo.create_thread(new_thread)
            
            # Đẩy task tóm tắt title vào background
            if background_tasks:
                background_tasks.add_task(background_generate_title, new_id, user_query)
            return new_id
            
        conversation = await self.repo.get_active_thread(thread_id)
        
        # Trường hợp 2: Client có truyền ID nhưng DB chưa có -> Tạo mới theo ID của client
        if not conversation:
            new_thread = Conversation(id=thread_id, user_id=self.user_id, title="Hội thoại mới")
            await self.repo.create_thread(new_thread)
            
            # Đẩy task tóm tắt title vào background
            if background_tasks:
                background_tasks.add_task(background_generate_title, thread_id, user_query)
            return thread_id

        # Trường hợp 3: Thread đã tồn tại -> Kiểm tra quyền
        if conversation.user_id != self.user_id:
            raise HTTPException(status_code=403, detail="Cấm truy cập.")
            
        return thread_id

    # Dùng cho /history (Xem lịch sử)
    async def get_thread_strictly(self, thread_id: str) -> Conversation:
        # Lịch sử thì bắt buộc phải có sẵn trong DB, không có là 404
        if not thread_id:
            raise HTTPException(status_code=400, detail="Thiếu thread_id.")

        conversation = await self.repo.get_active_thread(thread_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Không tìm thấy lịch sử trò chuyện.")
            
        if conversation.user_id != self.user_id:
            raise HTTPException(status_code=403, detail="Cấm truy cập.")
            
        return conversation
    
    async def get_all_threads(
        self,
        offset: int = 0,
        limit: int = 20
    ) -> list[Conversation]:

        threads = await self.repo.get_all_thread_by_user_id(
            user_id=self.user_id,
            offset=offset,
            limit=limit
        )

        return threads
