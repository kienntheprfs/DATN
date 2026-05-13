import asyncio
from uuid import UUID
from sqlalchemy import select, func
from src.core.database import AsyncSessionLocal
from src.models.topic_pipeline import DashboardTopicResult, DashboardTopicAssignment

async def check_topic_data():
    async with AsyncSessionLocal() as db:
        # Find the latest result for popular_questions
        stmt = select(DashboardTopicResult).where(DashboardTopicResult.topic_type == 'popular_questions').order_by(DashboardTopicResult.created_at.desc()).limit(1)
        res = await db.execute(stmt)
        result = res.scalar_one_or_none()
        
        if not result:
            print("No results found")
            return

        print(f"Latest Result ID: {result.id}")
        
        # Find topic_id for "Giới thiệu trường và Thông tin chung"
        # It's in result.topic_summary (dict)
        topic_id = None
        for tid, summary in result.topic_summary.items():
            if "Giới thiệu trường" in summary:
                topic_id = int(tid)
                break
        
        if topic_id is None:
            print("Topic not found in summary")
            return
            
        print(f"Found Topic ID: {topic_id}")
        
        # Check assignments for this topic and result
        stmt = select(func.date_trunc('day', DashboardTopicAssignment.original_created_at).label('day'), func.count(DashboardTopicAssignment.id)).where(
            DashboardTopicAssignment.result_id == result.id,
            DashboardTopicAssignment.topic_id == topic_id
        ).group_by('day').order_by('day')
        
        res = await db.execute(stmt)
        rows = res.all()
        print(f"Trend data (Day): {len(rows)} points")
        for row in rows:
            print(f"  {row.day}: {row[1]}")

if __name__ == "__main__":
    asyncio.run(check_topic_data())
