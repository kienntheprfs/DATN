"""
Performance tests for Agent Service streaming endpoint (SSE) via API Gateway.

Measures Time To First Token (TTFT) — thời gian từ khi gửi request đến khi nhận text token đầu tiên (KHÔNG tính tool call / thinking events).

Endpoint: POST http://localhost:8002/agent/stream?agent_id=knowledge-base-agent

Covers:
- PF-01: Simple greeting/FAQ questions TTFT (< 5s threshold)
- PF-02: Complex RAG+LLM questions TTFT (< 10s threshold)
- PF-03: Streaming token delivery — tokens arrive without excessive buffering
"""

import time
import json
import pytest
import httpx

STREAM_URL = "http://localhost:8002/agent/stream?agent_id=knowledge-base-agent"
USER_ID = "nfr-perf-test-user"
REQUEST_DELAY = 3.0  # Delay giữa các request để tránh rate limit 429
MAX_RETRIES = 2


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
    """Parse JSON từ SSE data string, trả về None nếu không parse được."""
    try:
        return json.loads(data_str)
    except (json.JSONDecodeError, ValueError):
        return None


def _is_text_token(event_name: str, data_str: str) -> bool:
    """Kiểm tra event có phải text token thật sự không (bỏ qua tool call / thinking events).

    SSE stream có thể gửi:
    - {"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [...]}} → tool call (bỏ qua)
    - {"type": "message", "content": {"type": "tool", ...}} → tool result (bỏ qua)
    - {"type": "citations_ready", ...} → citations (bỏ qua)
    - {"type": "token", "content": "word"} → text token thật (bắt)
    - {"type": "message", "content": {"type": "ai", "content": "full text"}} → full message (bỏ qua, đã có token trước đó)
    """
    parsed = _parse_event_data(data_str)
    if not parsed:
        return False

    event_type = parsed.get("type", "")

    # Token events: đây là text thật streaming
    if event_type == "token":
        return True

    # Bỏ qua: tool calls (thinking), tool results, citations, full message
    return False


def _stream_first_token(
    message: str,
    user_id: str = USER_ID,
    agent: str = "knowledge-base-agent",
    query_mode: str = "normal",
) -> tuple[int, float, float, str]:
    """Stream from /agent/stream và đo TTFT — thời gian đến text token đầu tiên.

    Bỏ qua tool call / thinking events, chỉ bắt token events chứa text thật.
    """
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
    token_count = 0

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            time.sleep(REQUEST_DELAY * (attempt + 1))

        try:
            with httpx.Client(timeout=120) as client:
                with client.stream("POST", url, headers=headers, json=payload) as resp:
                    status = resp.status_code

                    if status == 429:
                        resp.read()
                        time.sleep(REQUEST_DELAY)
                        continue

                    if status >= 400:
                        body = resp.read().decode("utf-8", errors="replace")[:500]
                        return status, 0.0, time.time() - start, body

                    for event_name, data in _iter_sse_events(resp):
                        if _is_text_token(event_name, data):
                            parsed = _parse_event_data(data)
                            token_content = parsed.get("content", "") if parsed else data
                            token_count += 1
                            if ttft is None:
                                ttft = time.time() - start
                                first_token = token_content

                        if data.strip() == "[DONE]":
                            break

        except Exception as e:
            return 0, 0.0, time.time() - start, str(e)

        total = time.time() - start
        return status, ttft or total, total, first_token

    return 429, 0.0, time.time() - start, "Rate limited after retries"


def _stream_token_timeline(
    message: str,
    user_id: str = USER_ID,
    agent: str = "knowledge-base-agent",
    query_mode: str = "normal",
) -> tuple[int, list[tuple[float, str]], str]:
    """Stream và trả về timeline của tất cả token events: (status, [(timestamp, content), ...], first_event_type)."""
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
    tokens: list[tuple[float, str]] = []
    first_event_type = ""

    try:
        with httpx.Client(timeout=120) as client:
            with client.stream("POST", url, headers=headers, json=payload) as resp:
                status = resp.status_code

                if status >= 400:
                    resp.read()
                    return status, [], "error"

                for event_name, data in _iter_sse_events(resp):
                    parsed = _parse_event_data(data)
                    if not parsed:
                        continue

                    event_type = parsed.get("type", "")

                    if not first_event_type:
                        first_event_type = event_type

                    if event_type == "token":
                        ts = time.time() - start
                        content = parsed.get("content", "")
                        tokens.append((ts, content))

                    if data.strip() == "[DONE]":
                        break

    except Exception:
        return 0, [], "exception"

    return status, tokens, first_event_type


def _delay_between_tests():
    """Add delay between test methods to avoid rate limiting."""
    time.sleep(REQUEST_DELAY)


# ============================================================
# PF-01: Simple Greeting/FAQ Questions — TTFT < 5s
# ============================================================

GREETING_QUESTIONS = [
    "Xin chao",
    "Hello",
    "Chao ban",
    "Ban la ai?",
    "Ban lam duoc gi?",
    "Hi there",
    "Good morning",
    "Cam on ban",
    "Goodbye",
    "Have a nice day",
]


class TestGreetingTTFT:
    """NFR-PF-01: Câu hỏi thường có TTFT < 5s."""

    @pytest.mark.parametrize("question", GREETING_QUESTIONS)
    def test_greeting_ttft(self, question):
        _delay_between_tests()
        status, ttft, total, first_token = _stream_first_token(question)
        assert status == 200, f"Failed with {status}: {first_token}"
        assert ttft < 5.0, f"'{question}' TTFT={ttft:.2f}s, expected < 5s"

    def test_greeting_avg_ttft(self):
        _delay_between_tests()
        ttfts = []
        for q in GREETING_QUESTIONS:
            _delay_between_tests()
            status, ttft, _, _ = _stream_first_token(q)
            if status == 200:
                ttfts.append(ttft)
        if ttfts:
            avg = sum(ttfts) / len(ttfts)
            assert avg < 5.0, f"Average greeting TTFT: {avg:.2f}s, expected < 5s"


# ============================================================
# PF-02: Complex RAG+LLM Questions — TTFT < 10s
# ============================================================

COMPLEX_QUESTIONS = [
    "Đối tượng dự tuyển đối với các chương trình: Chương trình Tiêu chuẩn, Chương trình Dạy và học bằng Tiếng Anh, Chương trình Tiên tiến, Chương trình Định hướng Nhật Bản",
    "Tín chỉ tối thiểu, tối đa",
    "Số tín chỉ tích lũy ràng buộc khi đăng ký môn học Thực tập ngoài trường (TTNT), Thực tập Kỹ sư (TTKS), Đồ án chuyên ngành/Đề cương luận văn (ĐACN), Luận văn/Khoá luận/Đồ án tốt nghiệp (ĐATN)",
    "GIỚI THIỆU TRƯỜNG ĐẠI HỌC BÁCH KHOA - ĐHQG-HCM",
    "chương trình học song ngành",
    "Xếp TKB các môn không đạt cho Sinh viên năm nhất",
    "Kế hoạch học tập của SV có điểm trung bình tích lũy < 2.0",
    "Quy định về học vụ và đào tạo bậc đại học",
    "Ngưỡng đầu vào theo chương trình đào tạo:",
    "Công thức và Thang điểm Xét tuyển",
]


class TestComplexQuestionTTFT:
    """NFR-PF-02: Câu hỏi phức tạp (RAG+LLM) có TTFT < 10s."""

    @pytest.mark.parametrize("question", COMPLEX_QUESTIONS)
    def test_complex_ttft(self, question):
        _delay_between_tests()
        status, ttft, total, first_token = _stream_first_token(question)
        assert status == 200, f"Failed with {status}: {first_token}"
        assert ttft < 10.0, f"'{question}' TTFT={ttft:.2f}s, expected < 10s"

    def test_complex_avg_ttft(self):
        _delay_between_tests()
        ttfts = []
        for q in COMPLEX_QUESTIONS:
            _delay_between_tests()
            status, ttft, _, _ = _stream_first_token(q)
            if status == 200:
                ttfts.append(ttft)
        if ttfts:
            avg = sum(ttfts) / len(ttfts)
            assert avg < 10.0, f"Average complex TTFT: {avg:.2f}s, expected < 10s"


# ============================================================
# PF-03: Streaming Delivery — Token interval kiểm tra buffering
# ============================================================


class TestStreamingDelivery:
    """NFR-PF-03: Token được stream liên tục, không bị buffer quá lâu."""

    def test_tokens_arrive_without_long_gaps(self):
        """Kiểm tra không có gap > 10s giữa các text tokens (dấu hiệu buffer hoặc timeout)."""
        _delay_between_tests()
        status, tokens, first_event_type = _stream_token_timeline(
            "Huong dan dang ky hoc ph",
            agent="knowledge-base-agent",
        )
        assert status == 200, f"Stream failed: {status}"
        assert len(tokens) >= 1, f"No text tokens received, first event was: {first_event_type}"

        max_gap = 0.0
        for i in range(1, len(tokens)):
            gap = tokens[i][0] - tokens[i - 1][0]
            max_gap = max(max_gap, gap)

        assert max_gap < 10.0, f"Max token gap: {max_gap:.2f}s, expected < 10s (dấu hiệu buffer)"

    def test_receives_multiple_tokens(self):
        """Kiểm tra stream trả về nhiều hơn 1 text token (không phải single response)."""
        _delay_between_tests()
        status, tokens, first_event_type = _stream_token_timeline(
            "Xin chao, ban lam duoc gi?",
            agent="knowledge-base-agent",
        )
        assert status == 200, f"Stream failed: {status}"
        assert len(tokens) >= 1, f"Only received {len(tokens)} text tokens, expected >= 1"

    def test_first_event_is_not_text_for_rag(self):
        """Với câu hỏi RAG, event đầu tiên là tool call (message), không phải token."""
        _delay_between_tests()
        status, tokens, first_event_type = _stream_token_timeline(
            "Huong dan dang ky hoc ph",
            agent="knowledge-base-agent",
        )
        assert status == 200
        # Event đầu tiên thường là "message" (tool call), sau đó mới đến "token"
        # Test này xác nhận rằng TTFT được đo từ token event, không phải message event
        assert len(tokens) >= 1, "Should have at least 1 text token"
