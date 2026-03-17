from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from schema.conversation import Conversation

class ChatRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_thread(self, thread_id: str) -> Conversation | None:
        query = select(Conversation).where(
            Conversation.id == thread_id, 
            Conversation.is_archived == False
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create_thread(self, conversation: Conversation) -> Conversation:
        self.db.add(conversation)
        await self.db.commit()
        return conversation