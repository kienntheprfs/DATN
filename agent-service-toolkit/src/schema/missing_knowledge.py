import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from core.database import Base

class MissingKnowledgeLog(Base):
    __tablename__ = "missing_knowledge_logs"
    __table_args__ = {"schema": "agent_schema"}

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    # user_id = Column(String, index=True, nullable=False)
    thread_id = Column(String, index=True, nullable=False)
    query = Column(String, nullable=False)
    
    # Lưu thời điểm phát sinh dưới dạng UTC
    created_at = Column(DateTime(timezone=True), server_default=func.now())