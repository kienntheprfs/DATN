"""Test SSE token-by-token streaming and detect buffering behavior.

Examples:
  uv run python scripts/test_sse_stream_token_by_token.py
  uv run python scripts/test_sse_stream_token_by_token.py --url http://localhost:8002/agent/stream --delay-sec 0.05 --repeat 200
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from typing import Iterator, Tuple

import httpx


def iter_sse_events(response: httpx.Response) -> Iterator[Tuple[str, str]]:
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SSE token-by-token streaming test")
    parser.add_argument("--url", default="http://localhost:8002/agent/stream")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--repeat", type=int, default=120)
    parser.add_argument("--delay-sec", type=float, default=0.05)
    parser.add_argument("--mode", choices=["word", "char"], default="word")
    parser.add_argument(
        "--text",
        default="kiem tra gateway co stream tung token hay bi buffer",
    )
    parser.add_argument("--internal-secret", default="")
    return parser


def main() -> None:
    args = build_parser().parse_args()

    headers = {
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    if args.internal_secret:
        headers["X-Internal-Secret"] = args.internal_secret

    payload = {
        "text": args.text,
        "repeat": args.repeat,
        "delay_sec": args.delay_sec,
        "mode": args.mode,
    }

    deltas_ms: list[float] = []
    token_count = 0
    started_at = time.perf_counter()
    prev_token_ts: float | None = None

    print(f"URL: {args.url}")
    print("Streaming started...")

    with httpx.Client(timeout=args.timeout) as client:
        with client.stream("POST", args.url, headers=headers, json=payload) as resp:
            print(f"HTTP status: {resp.status_code}")
            if resp.status_code >= 400:
                try:
                    body_preview = resp.read().decode("utf-8", errors="replace")[:500]
                except Exception as exc:
                    body_preview = f"<cannot read response body: {exc}>"
                print(f"HTTP error body: {body_preview}")
                if resp.status_code == 502:
                    print(
                        "Hint: gateway khong ket noi duoc upstream. "
                        "Kiem tra AGENT_UPSTREAM_ADDR va cong mock SSE server."
                    )
                raise SystemExit(1)

            for event_name, data in iter_sse_events(resp):
                now = time.perf_counter()

                if event_name == "meta":
                    print(f"META: {data}")
                    continue

                if event_name == "token":
                    token_count += 1
                    delta_ms = 0.0 if prev_token_ts is None else (now - prev_token_ts) * 1000
                    prev_token_ts = now
                    deltas_ms.append(delta_ms)

                    token_value = data
                    try:
                        parsed = json.loads(data)
                        token_value = str(parsed.get("token", data))
                    except json.JSONDecodeError:
                        pass

                    print(f"[{token_count:04d}] +{delta_ms:8.2f} ms | token={token_value}")
                    continue

                if event_name == "done":
                    print(f"DONE: {data}")

    total_ms = (time.perf_counter() - started_at) * 1000
    print("\nSummary")
    print(f"- Tokens received: {token_count}")
    print(f"- Total time: {total_ms:.2f} ms")

    if token_count > 1 and len(deltas_ms) > 1:
        non_zero = [x for x in deltas_ms[1:] if x > 0]
        if non_zero:
            avg_ms = statistics.mean(non_zero)
            min_ms = min(non_zero)
            max_ms = max(non_zero)
            fast_chunks = sum(1 for x in non_zero if x < 5)
            ratio_fast = fast_chunks / len(non_zero)

            print(f"- Delta avg/min/max: {avg_ms:.2f}/{min_ms:.2f}/{max_ms:.2f} ms")
            print(f"- Fast chunk ratio (<5ms): {ratio_fast:.2%}")

            if args.delay_sec >= 0.02 and ratio_fast > 0.7:
                print("=> Co dau hieu bi buffer (nhieu token den sat nhau).")
            else:
                print("=> Co ve dang stream token by token (khong buffer ro ret).")


if __name__ == "__main__":
    main()
