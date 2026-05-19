import asyncio
import os
import sys
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.runnables import RunnableConfig

load_dotenv()
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"d:\Code\DATN\DATN-Chatbot\agent-service-toolkit\src")

from agents import get_agent

async def main():
    agent = get_agent("router-agent")
    thread_id = "test-classification"
    config = RunnableConfig(configurable={"thread_id": thread_id})
    
    queries = [
        "tui muốn tới tham quan khoa máy tính",
        "tới tham quan khoa máy tính thì đi đường nào",
        "cho hỏi khoa máy tính ở đâu",
        "tui muốn đến khoa máy tính"
    ]
    
    for q in queries:
        print("\n" + "="*50)
        print(f"QUERY: {q}")
        print("="*50)
        async for event in agent.astream({"messages": [HumanMessage(content=q)]}, config, stream_mode="updates"):
            for node_name, node_output in event.items():
                if node_name == "classify_query":
                    print(f"Classifications: {node_output.get('classifications')}")

if __name__ == "__main__":
    asyncio.run(main())
