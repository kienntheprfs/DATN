import asyncio
from sqlalchemy import select, func
from src.core.database import AsyncSessionLocal
from src.models.topic_pipeline import DashboardTopicResult, DashboardTopicAssignment

async def debug_topic(title_query: str):
    async with AsyncSessionLocal() as db:
        # Find all results
        stmt = select(DashboardTopicResult).order_by(DashboardTopicResult.created_at.desc())
        res = await db.execute(stmt)
        results = res.scalars().all()
        
        found = False
        for result in results:
            for tid, summary in result.topic_summary.items():
                if title_query in summary:
                    print(f"Found in Result ID: {result.id} ({result.topic_type})")
                    print(f"Topic ID: {tid}")
                    
                    # Count assignments
                    count_stmt = select(func.count(DashboardTopicAssignment.id)).where(
                        DashboardTopicAssignment.result_id == result.id,
                        DashboardTopicAssignment.topic_id == int(tid)
                    )
                    count_res = await db.execute(count_stmt)
                    count = count_res.scalar_one()
                    print(f"Assignments count: {count}")
                    
                    # Check first 5 assignments for timestamps
                    assign_stmt = select(DashboardTopicAssignment).where(
                        DashboardTopicAssignment.result_id == result.id,
                        DashboardTopicAssignment.topic_id == int(tid)
                    ).limit(5)
                    assign_res = await db.execute(assign_stmt)
                    assigns = assign_res.scalars().all()
                    for a in assigns:
                        print(f"  - Assignment ID: {a.id} | Orig: {a.original_created_at} | Created: {a.created_at}")
                    
                    found = True
                    # Check trend query logic
                    ts_expr = func.coalesce(DashboardTopicAssignment.original_created_at, DashboardTopicAssignment.created_at)
                    trend_stmt = select(func.date_trunc('day', ts_expr).label('p'), func.count(DashboardTopicAssignment.id)).where(
                        DashboardTopicAssignment.result_id == result.id,
                        DashboardTopicAssignment.topic_id == int(tid)
                    ).group_by(func.date_trunc('day', ts_expr))
                    trend_res = await db.execute(trend_stmt)
                    rows = trend_res.all()
                    print(f"Trend rows: {len(rows)}")
                    for r in rows:
                        print(f"  - {r[0]}: {r[1]}")
                    
        if not found:
            print(f"Topic '{title_query}' not found in any results.")

if __name__ == "__main__":
    import sys
    query = "Thông tin trường Đại học Bách Khoa"
    asyncio.run(debug_topic(query))
