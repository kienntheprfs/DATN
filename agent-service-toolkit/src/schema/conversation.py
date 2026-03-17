from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Conversation(Base):
    __tablename__ = "conversations"

    __table_args__ = {"schema": "agent_schema"}

    id = Column(String, primary_key=True, index=True) 
    user_id = Column(String, index=True, nullable=False) 
    title = Column(String, nullable=True, default="Hội thoại mới") 
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_archived = Column(Boolean, default=False)