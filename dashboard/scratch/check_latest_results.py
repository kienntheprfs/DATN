import asyncio
from sqlalchemy import select
from src.core.database import AsyncSessionLocal
from src.models.topic_pipeline import DashboardTopicResult

async def check_latest():
    async with AsyncSessionLocal() as db:
        for ttype in ['popular_questions', 'missing_knowledge']:
            stmt = select(DashboardTopicResult).where(DashboardTopicResult.topic_type == ttype).order_by(DashboardTopicResult.created_at.desc()).limit(1)
            res = await db.execute(stmt)
            result = res.scalar_one_or_none()
            if result:
                print(f"Latest {ttype}: {result.id} created at {result.created_at}")
                # Check if "Thông tin trường Đại học Bách Khoa TP.HCM" is in summary
                found = False
                for tid, summary in result.topic_summary.items():
                    if "Thông tin trường Đại học Bách Khoa" in summary:
                        print(f"  -> FOUND Topic ID {tid} in this latest result")
                        found = True
                if not found:
                    print(f"  -> NOT FOUND in this latest result")

if __name__ == "__main__":
    asyncio.run(check_latest())
