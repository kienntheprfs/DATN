from fastapi import Header, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from repositories.chat_repo import ChatRepository
from service.chat_service import ChatService

async def get_current_user_id(
    x_user_id: str = Header(
        default=None, 
        alias="X-User-Id", 
        description="ID của user. Hiện tại truyền tay, sau này API Gateway sẽ tự động tiêm vào."
    )
) -> str:
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu header X-User-Id"
        )
    return x_user_id

async def get_chat_service(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> ChatService:
    repo = ChatRepository(db)
    return ChatService(repo, user_id)