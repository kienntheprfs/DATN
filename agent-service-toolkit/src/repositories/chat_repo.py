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
    
    async def get_all_thread_by_user_id(
        self,
        user_id: str,
        offset: int = 0,
        limit: int = 20
    ) -> list[Conversation]:

        query = (
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.is_archived == False
            )
            .order_by(Conversation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.db.execute(query)

        return result.scalars().all()