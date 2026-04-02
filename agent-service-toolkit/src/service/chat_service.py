from uuid import uuid4
from repositories.chat_repo import ChatRepository
from schema.conversation import Conversation
from fastapi import HTTPException

class ChatService:
    def __init__(self, repo: ChatRepository, user_id: str):
        self.repo = repo
        self.user_id = user_id

    # Dùng cho /invoke và /stream (Chat)
    async def get_or_create_thread(self, thread_id: str | None) -> str:
        if not thread_id:
            # Trường hợp client không truyền, backend tự sinh ID
            new_id = str(uuid4())
            new_thread = Conversation(id=new_id, user_id=self.user_id)
            await self.repo.create_thread(new_thread)
            return new_id
            
        # Kiểm tra xem thread đã tồn tại chưa
        conversation = await self.repo.get_active_thread(thread_id)
        
        if not conversation:
            # TRƯỜNG HỢP MỚI: Client tự sinh ID truyền lên nhưng DB chưa có
            # -> Coi như đây là tạo chat mới với ID của client
            new_thread = Conversation(id=thread_id, user_id=self.user_id)
            await self.repo.create_thread(new_thread)
            return thread_id

        # Nếu đã có, kiểm tra quyền sở hữu
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
