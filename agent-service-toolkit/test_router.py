import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "src"))

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from core import get_model, settings
from agents.agents import get_agent

async def main():
    agent = get_agent("router-agent")
    
    messages = [
        HumanMessage(content="tui muốn tới phòng đào tạo ở A5 để hiểu rõ hơn"),
        AIMessage(content="Được nhé. Nếu bạn muốn đến Phòng Đào tạo ở A5 để hỏi thêm về học song ngành, mình có thể hỗ trợ theo 2 cách:\n1. Chỉ đường: bạn nhắn mình đang ở đâu\n2. Hỗ trợ thông tin trước..."),
        HumanMessage(content="oke chỉ đường cho tui tới đó đi, mà tui tới trường lần đầu nên chưa biết mình đang ở đâu nữa")
    ]
    
    sys.stdout.reconfigure(encoding='utf-8')
    print("RUNNING ROUTER AGENT:")
    response = await agent.ainvoke({"messages": messages}, {"configurable": {}})
    
    print("\nFINAL MESSAGES:")
    for m in response["messages"]:
        print(f"[{m.__class__.__name__}] {m.content}")
        if hasattr(m, 'tool_calls') and m.tool_calls:
            print("TOOL CALLS:", m.tool_calls)

if __name__ == "__main__":
    asyncio.run(main())
