from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from schema.missing_knowledge import MissingKnowledgeLog

class MissingKnowledgeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_missing_query(self, thread_id: str, query: str):
        try:
            new_log = MissingKnowledgeLog(
                thread_id=thread_id,
                query=query
            )
            self.db.add(new_log)
            await self.db.commit()
        except Exception as e:
            await self.db.rollback()
            # Log lỗi ra console/file để monitor thay vì ném exception làm sập app
            import logging
            logging.getLogger(__name__).error(f"Failed to log missing knowledge: {e}")

    async def get_all(self, skip: int = 0, limit: int = 100):
        """Lấy danh sách tất cả câu hỏi bị thiếu, sắp xếp mới nhất lên đầu."""
        stmt = (
            select(MissingKnowledgeLog)
            .order_by(MissingKnowledgeLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        # .scalars().all() giúp trích xuất object entity ra khỏi tuple của database
        return result.scalars().all()

    async def get_by_id(self, log_id: str):
        """Lấy chính xác 1 record dựa vào ID."""
        stmt = select(MissingKnowledgeLog).where(MissingKnowledgeLog.id == log_id)
        result = await self.db.execute(stmt)
        return result.scalars().first() # Trả về None nếu không tìm thấy

    async def get_by_time_range(self, start_time: datetime, end_time: datetime, limit: int = 100):
        """
        Lấy các câu hỏi thiếu trong một khoảng thời gian nhất định.
        Lưu ý: start_time và end_time truyền vào nên là timezone-aware (có múi giờ UTC).
        """
        stmt = (
            select(MissingKnowledgeLog)
            .where(
                MissingKnowledgeLog.created_at >= start_time,
                MissingKnowledgeLog.created_at <= end_time
            )
            .order_by(MissingKnowledgeLog.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()