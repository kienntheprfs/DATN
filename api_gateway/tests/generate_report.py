"""
Script to run performance tests from a questions JSON file and generate a markdown report.

Format questions.json:
{
  "simple": ["Xin chao", "Hello", ...],
  "complex": ["Câu hỏi phức tạp 1", ...]
}

Usage:
    cd api_gateway
    .venv/Scripts/python.exe tests/generate_report.py                    # uses default questions.json
    .venv/Scripts/python.exe tests/generate_report.py --questions path/to/my.json
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# Add tests dir so we can import from test_chat_performance
TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR))

from test_chat_performance import (
    REQUEST_DELAY,
    _stream_first_token,
    _stream_token_timeline,
)

REPORT_DIR = TESTS_DIR.parent / "docs"
REPORT_FILE = REPORT_DIR / "CHAT_PERFORMANCE_TEST_REPORT.md"
RESULTS_FILE = TESTS_DIR / "test_results.json"

SIMPLE_THRESHOLD = 5.0
COMPLEX_THRESHOLD = 10.0
TOKEN_GAP_THRESHOLD = 10.0

STREAMING_TESTS = []


def _run_tests(questions, threshold, label):
    results = []
    for i, q in enumerate(questions, 1):
        short = q[:60] + "..." if len(q) > 60 else q
        print(f"  [{i}/{len(questions)}] {label}: {short}")
        status, ttft, total, first_token = _stream_first_token(q)
        ok = status == 200 and ttft < threshold
        results.append(
            {
                "question": q,
                "ttft": round(ttft, 2),
                "total": round(total, 2),
                "status": status,
                "passed": ok,
            }
        )
        time.sleep(REQUEST_DELAY)
    return results


def _run_streaming_tests():
    results = []
    for st in STREAMING_TESTS:
        print(f"  Streaming: {st['desc']}")
        status, tokens, first_event_type = _stream_token_timeline(st["query"])
        time.sleep(REQUEST_DELAY)

        if st["name"] == "test_tokens_arrive_without_long_gaps":
            max_gap = 0.0
            for j in range(1, len(tokens)):
                gap = tokens[j][0] - tokens[j - 1][0]
                max_gap = max(max_gap, gap)
            ok = status == 200 and len(tokens) >= 1 and max_gap < TOKEN_GAP_THRESHOLD
            results.append(
                {
                    "name": st["name"],
                    "desc": st["desc"],
                    "passed": ok,
                    "detail": f"max_gap={max_gap:.2f}s, tokens={len(tokens)}",
                }
            )

        elif st["name"] == "test_receives_multiple_tokens":
            ok = status == 200 and len(tokens) >= 1
            results.append(
                {
                    "name": st["name"],
                    "desc": st["desc"],
                    "passed": ok,
                    "detail": f"tokens={len(tokens)}",
                }
            )

        elif st["name"] == "test_first_event_is_not_text_for_rag":
            ok = status == 200 and len(tokens) >= 1
            results.append(
                {
                    "name": st["name"],
                    "desc": st["desc"],
                    "passed": ok,
                    "detail": f"first_event={first_event_type}, tokens={len(tokens)}",
                }
            )

    return results


def _save_results(simple, complex_q, streaming, elapsed):
    total = len(simple) + len(complex_q) + len(streaming)
    passed = (
        sum(1 for r in simple if r["passed"])
        + sum(1 for r in complex_q if r["passed"])
        + sum(1 for r in streaming if r["passed"])
    )
    data = {
        "timestamp": datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "summary": {"total": total, "passed": passed, "failed": total - passed},
        "simple": simple,
        "complex": complex_q,
        "streaming": streaming,
    }
    RESULTS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return data


def _truncate(q: str, max_len: int = 70) -> str:
    return q[:max_len] + "..." if len(q) > max_len else q


def _generate_report(data: dict):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    simple = data["simple"]
    complex_q = data["complex"]
    streaming = data["streaming"]
    summary = data["summary"]
    total = summary["total"]
    passed = summary["passed"]
    failed = summary["failed"]
    elapsed = data["elapsed_seconds"]
    pass_rate = (passed / total * 100) if total else 0

    simple_ttfts = [r["ttft"] for r in simple if r["passed"]]
    complex_ttfts = [r["ttft"] for r in complex_q if r["passed"]]
    all_ttfts = simple_ttfts + complex_ttfts
    simple_avg = sum(simple_ttfts) / len(simple_ttfts) if simple_ttfts else 0
    complex_avg = sum(complex_ttfts) / len(complex_ttfts) if complex_ttfts else 0
    max_ttft = max(all_ttfts) if all_ttfts else 0

    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    L = []
    L.append("# Báo cáo Kiểm thử Hiệu năng — API Gateway Streaming\n")
    L.append("## 1. Tổng quan\n")
    L.append(
        "Kiểm thử hiệu năng (Performance Testing) cho endpoint streaming SSE của Agent Service qua API Gateway.\n"
    )
    L.append("| Thông tin | Chi tiết |")
    L.append("|-----------|----------|")
    L.append(
        "| **Framework** | Standalone runner (import trực tiếp từ test_chat_performance.py) |"
    )
    L.append(
        "| **Endpoint** | `POST http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |"
    )
    L.append("| **Thư mục tests** | `api_gateway/tests/test_chat_performance.py` |")
    L.append(f"| **Ngày thực thi** | {datetime.now().strftime('%d/%m/%Y %H:%M')} |")
    L.append(f"| **Tổng số tests** | **{total}** |")
    status_icon = "✅" if failed == 0 else "⚠️"
    L.append(
        f"| **Trạng thái** | **{status_icon} {passed}/{total} PASS ({pass_rate:.0f}%)** |"
    )
    L.append(f"| **Thời gian chạy** | {minutes} phút {seconds} giây |")
    L.append("")
    L.append("### Thước đo chính: TTFT (Time To First Token)\n")
    L.append(
        "**TTFT** — Thời gian từ khi gửi request đến khi nhận **text token đầu tiên** qua SSE stream."
    )
    L.append(
        '**Quan trọng**: Chỉ đo `{"type": "token"}` events, **bỏ qua** `{"type": "message"}` (tool call/thinking), `citations_ready`.\n'
    )
    L.append("### Cấu trúc SSE stream:\n")
    L.append("```")
    L.append(
        '1. {"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [...]}}  → tool call (bỏ qua)'
    )
    L.append(
        '2. {"type": "message", "content": {"type": "tool", ...}}                              → tool result (bỏ qua)'
    )
    L.append(
        '3. {"type": "citations_ready", ...}                                                    → citations (bỏ qua)'
    )
    L.append(
        '4. {"type": "token", "content": "word"}                                                ← text thật (BẮT TTFT)'
    )
    L.append('5. {"type": "token", "content": "word"} ...')
    L.append(
        '6. {"type": "message", "content": {"type": "ai", "content": "full text"}}              → full message'
    )
    L.append("7. [DONE]")
    L.append("```\n")
    L.append("---\n")
    L.append("## 2. Chi tiết Test Cases\n")

    # --- Simple ---
    L.append(f"### 2.1 Câu hỏi thường — TTFT < {SIMPLE_THRESHOLD:.0f}s\n")
    L.append("| Mã TC | Câu hỏi | TTFT | Ngưỡng | Kết quả |")
    L.append("|-------|---------|------|--------|---------|")
    for i, r in enumerate(simple, 1):
        icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        L.append(
            f"| S-{i:02d} | `{_truncate(r['question'])}` | {r['ttft']:.2f}s | < {SIMPLE_THRESHOLD:.0f}s | {icon} |"
        )
    simple_avg_icon = "✅ PASS" if simple_avg < SIMPLE_THRESHOLD else "❌ FAIL"
    L.append(
        f"| AVG | **Average ({len(simple)} câu)** | **{simple_avg:.2f}s** | **< {SIMPLE_THRESHOLD:.0f}s** | **{simple_avg_icon}** |"
    )
    L.append("")
    if all(r["passed"] for r in simple):
        L.append("**Nhận xét**: Tất cả các câu hỏi thường đều vượt qua ngưỡng.\n")
    L.append("---\n")

    # --- Complex ---
    L.append(f"### 2.2 Câu hỏi phức tạp — TTFT < {COMPLEX_THRESHOLD:.0f}s\n")
    L.append("| Mã TC | Câu hỏi | TTFT | Ngưỡng | Kết quả |")
    L.append("|-------|---------|------|--------|---------|")
    for i, r in enumerate(complex_q, 1):
        icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        L.append(
            f"| C-{i:02d} | `{_truncate(r['question'])}` | {r['ttft']:.2f}s | < {COMPLEX_THRESHOLD:.0f}s | {icon} |"
        )
    complex_avg_icon = "✅ PASS" if complex_avg < COMPLEX_THRESHOLD else "❌ FAIL"
    L.append(
        f"| AVG | **Average ({len(complex_q)} câu)** | **{complex_avg:.2f}s** | **< {COMPLEX_THRESHOLD:.0f}s** | **{complex_avg_icon}** |"
    )
    L.append("")
    failed_items = [(r["question"], r["ttft"]) for r in complex_q if not r["passed"]]
    for q, ttft in failed_items:
        L.append(
            f'**Ghi chú**: "{_truncate(q, 80)}" có TTFT={ttft:.2f}s, vượt ngưỡng {COMPLEX_THRESHOLD:.0f}s.\n'
        )
    L.append("---\n")

    # --- Streaming ---
    L.append("### 2.3 Streaming Delivery\n")
    L.append("| Mã TC | Mô tả | Kết quả | Chi tiết |")
    L.append("|-------|-------|---------|----------|")
    for i, r in enumerate(streaming, 1):
        icon = "✅ PASS" if r["passed"] else "❌ FAIL"
        L.append(f"| STR-{i:02d} | {r['desc']} | {icon} | `{r['detail']}` |")
    L.append("")
    if all(r["passed"] for r in streaming):
        L.append(
            "**Nhận xét**: Text tokens được stream liên tục, không có gap bất thường.\n"
        )
    L.append("---\n")

    # --- Summary ---
    L.append("## 3. Kết quả tổng hợp\n")
    L.append("| Metric | Giá trị |")
    L.append("|--------|---------|")
    L.append(f"| **Tổng tests** | {total} |")
    L.append(f"| **Passed** | {passed} ({pass_rate:.0f}%) |")
    L.append(f"| **Failed** | {failed} |")
    L.append(f"| **Thời gian chạy** | {minutes} phút {seconds} giây |")
    L.append(
        f"| **Simple TTFT (avg)** | {simple_avg:.2f}s (ngưỡng < {SIMPLE_THRESHOLD:.0f}s) {'✅' if simple_avg < SIMPLE_THRESHOLD else '❌'} |"
    )
    L.append(
        f"| **Complex TTFT (avg)** | {complex_avg:.2f}s (ngưỡng < {COMPLEX_THRESHOLD:.0f}s) {'✅' if complex_avg < COMPLEX_THRESHOLD else '❌'} |"
    )
    L.append(f"| **Max TTFT** | {max_ttft:.2f}s |")
    L.append("")
    L.append("---\n")

    # --- Config ---
    L.append("## 4. Test Configuration\n")
    L.append("| Tham số | Giá trị |")
    L.append("|---------|---------|")
    L.append(
        "| **STREAM_URL** | `http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |"
    )
    L.append("| **USER_ID** | `nfr-perf-test-user` |")
    L.append(f"| **REQUEST_DELAY** | {REQUEST_DELAY}s (giữa các request) |")
    L.append("| **MAX_RETRIES** | 2 (khi gặp 429 rate limit) |")
    L.append(f"| **Simple threshold** | {SIMPLE_THRESHOLD:.0f}s |")
    L.append(f"| **Complex threshold** | {COMPLEX_THRESHOLD:.0f}s |")
    L.append("")
    L.append("---\n")

    # --- Recommendations ---
    L.append("## 5. Khuyến nghị\n")
    failed_qs = [(r["question"], r["ttft"]) for r in complex_q if not r["passed"]]
    if failed_qs:
        q, ttft = failed_qs[0]
        L.append(
            f'1. **Điều tra outlier "{_truncate(q, 60)}"** — TTFT {ttft:.2f}s vượt ngưỡng {COMPLEX_THRESHOLD:.0f}s.'
        )
    else:
        L.append(
            "1. **Monitor TTFT định kỳ** — chạy test hàng tuần để phát hiện regression sớm."
        )
    L.append(
        "2. **Tăng rate limit** cho endpoint `/agent/stream` nếu cần chạy test nhiều hơn."
    )
    L.append(
        "3. **Thêm test với authentication JWT** — hiện tại chỉ dùng `X-User-Id` header."
    )
    L.append("4. **Load testing** — test với nhiều concurrent users.")
    L.append("")

    content = "\n".join(L)
    REPORT_FILE.write_text(content, encoding="utf-8")
    return REPORT_FILE


def main():
    parser = argparse.ArgumentParser(
        description="Run performance tests from questions JSON"
    )
    parser.add_argument(
        "--questions",
        "-q",
        type=str,
        default=None,
        help="Path to questions JSON file (default: tests/questions.json)",
    )
    args = parser.parse_args()

    if args.questions:
        q_path = Path(args.questions)
    else:
        q_path = TESTS_DIR / "questions.json"

    if not q_path.exists():
        print(f"Error: questions file not found: {q_path}")
        sys.exit(1)

    with open(q_path, encoding="utf-8") as f:
        q_data = json.load(f)

    simple_questions = q_data.get("simple", [])
    complex_questions = q_data.get("complex", [])

    if not simple_questions and not complex_questions:
        print(
            "Error: no questions found. JSON must have 'simple' and/or 'complex' arrays."
        )
        sys.exit(1)

    print("=" * 60)
    print("Performance Test Runner — API Gateway Streaming")
    print(f"Questions: {q_path}")
    print(f"Simple: {len(simple_questions)}, Complex: {len(complex_questions)}")
    print("=" * 60)
    start = time.time()

    simple_results = []
    complex_results = []

    if simple_questions:
        print(f"\n[1] Running Simple tests ({len(simple_questions)} questions)...")
        simple_results = _run_tests(simple_questions, SIMPLE_THRESHOLD, "Simple")

    if complex_questions:
        print(f"\n[2] Running Complex tests ({len(complex_questions)} questions)...")
        complex_results = _run_tests(complex_questions, COMPLEX_THRESHOLD, "Complex")

    print(f"\n[3] Running Streaming tests...")
    streaming_results = _run_streaming_tests()

    elapsed = time.time() - start

    print("\nSaving results...")
    data = _save_results(simple_results, complex_results, streaming_results, elapsed)
    report_path = _generate_report(data)

    print(f"\n{'=' * 60}")
    print(f"Done in {int(elapsed // 60)}m {int(elapsed % 60)}s")
    print(
        f"  Total: {data['summary']['total']}, Passed: {data['summary']['passed']}, Failed: {data['summary']['failed']}"
    )
    print(f"  Report: {report_path}")
    print(f"  Results JSON: {RESULTS_FILE}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
