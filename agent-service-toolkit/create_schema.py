import asyncio
import asyncpg


async def create_schema():
    conn = await asyncpg.connect("postgresql://postgres:postgres@localhost:5432/knowledge_db")
    await conn.execute("CREATE SCHEMA IF NOT EXISTS agent_schema")
    await conn.close()
    print("Schema created")


asyncio.run(create_schema())
