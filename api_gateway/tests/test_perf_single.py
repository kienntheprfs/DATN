"""
Performance test for Multi-Agent Router streaming endpoint (SSE).

Mục tiêu: Đo thời gian Time To First Token (TTFT) để xem Router Agent ngốn
bao nhiêu thời gian overhead (phân loại + định tuyến) trước khi trả về token đầu tiên.
"""

import time
import json
import httpx

# ============================================================
# CẤU HÌNH TEST CỦA BẠN Ở ĐÂY
# ============================================================
AGENT_ID = "router-agent"  # Đổi thành router-agent
USER_ID = "nfr-perf-test-user"
MAX_RETRIES = 2

# Câu hỏi test (Nên dùng câu hỏi cần gọi nhiều Agent để test mức độ chịu tải cao nhất)
TEST_QUESTION = "Điều kiện tốt nghiệp là gì?"

def _iter_sse_events(response: httpx.Response):
    """Parse SSE response into (event_name, data) tuples."""
    event_name = "message"
    data_lines: list[str] = []

    for line in response.iter_lines():
        if line is None:
            continue
        line = line.strip()

        if line == "":
            if data_lines:
                yield event_name, "\n".join(data_lines)
            event_name = "message"
            data_lines = []
            continue

        if line.startswith(":"):
            continue

        if line.startswith("event:"):
            event_name = line[len("event:") :].strip() or "message"
            continue

        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].strip())

def _parse_event_data(data_str: str) -> dict | None:
    try:
        return json.loads(data_str)
    except (json.JSONDecodeError, ValueError):
        return None

def _is_text_token(event_name: str, data_str: str) -> bool:
    parsed = _parse_event_data(data_str)
    if not parsed:
        return False
    return parsed.get("type", "") == "token"

def _stream_first_token(
    message: str,
    user_id: str = USER_ID,
    agent: str = AGENT_ID,
    query_mode: str = "normal",
) -> tuple[int, float, float, str]:
    """Stream from /agent/stream và đo TTFT."""
    url = f"http://localhost:8002/agent/stream?agent_id={agent}"
    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
        "X-User-Id": user_id,
    }

    payload = {
        "message": message,
        "agent": agent,
        "stream_tokens": True,
        "query_mode": query_mode,
    }

    start = time.time()
    ttft = None
    first_token = ""
    
    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            time.sleep(2.0)

        try:
            with httpx.Client(timeout=120) as client:
                with client.stream("POST", url, headers=headers, json=payload) as resp:
                    status = resp.status_code

                    if status == 429:
                        resp.read()
                        time.sleep(3.0)
                        continue

                    if status >= 400:
                        body = resp.read().decode("utf-8", errors="replace")[:500]
                        return status, 0.0, time.time() - start, body

                    for event_name, data in _iter_sse_events(resp):
                        if _is_text_token(event_name, data):
                            parsed = _parse_event_data(data)
                            token_content = parsed.get("content", "") if parsed else data
                            
                            if ttft is None:
                                ttft = time.time() - start
                                first_token = token_content

                        if data.strip() == "[DONE]":
                            break

        except Exception as e:
            return 0, 0.0, time.time() - start, str(e)

        total = time.time() - start
        return status, ttft or total, total, first_token

    return 429, 0.0, time.time() - start, "Rate limited"

# ============================================================
# BÀI TEST CHÍNH
# ============================================================

def test_router_overhead_single_question():
    """Đo lường chi phí thời gian của Multi-Agent Router."""
    print(f"\n--- BẮT ĐẦU TEST ---")
    print(f"Agent mục tiêu : {AGENT_ID}")
    print(f"Câu hỏi test   : '{TEST_QUESTION}'")
    print(f"Đang chờ stream...")
    
    status, ttft, total, first_token = _stream_first_token(TEST_QUESTION)
    
    print(f"\n--- KẾT QUẢ ---")
    print(f"Status HTTP    : {status}")
    print(f"TTFT           : {ttft:.2f} giây (Thời gian đến token đầu tiên)")
    print(f"Total Time     : {total:.2f} giây (Thời gian hoàn thành)")
    print(f"First Token    : '{first_token}'")
    
    # Assert cơ bản để pytest không báo lỗi nếu chạy thành công
    assert status == 200, f"Lỗi gọi API. Status: {status}, Detail: {first_token}"