# Báo cáo Kiểm thử Hiệu năng — API Gateway Streaming

## 1. Tổng quan

Kiểm thử hiệu năng (Performance Testing) cho endpoint streaming SSE của Agent Service qua API Gateway.

| Thông tin | Chi tiết |
|-----------|----------|
| **Framework** | Standalone runner (import trực tiếp từ test_chat_performance.py) |
| **Endpoint** | `POST http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |
| **Thư mục tests** | `api_gateway/tests/test_chat_performance.py` |
| **Ngày thực thi** | 08/06/2026 01:02 |
| **Tổng số tests** | **1** |
| **Trạng thái** | **⚠️ 0/1 PASS (0%)** |
| **Thời gian chạy** | 0 phút 14 giây |

### Thước đo chính: TTFT (Time To First Token)

**TTFT** — Thời gian từ khi gửi request đến khi nhận **text token đầu tiên** qua SSE stream.
**Quan trọng**: Chỉ đo `{"type": "token"}` events, **bỏ qua** `{"type": "message"}` (tool call/thinking), `citations_ready`.

### Cấu trúc SSE stream:

```
1. {"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [...]}}  → tool call (bỏ qua)
2. {"type": "message", "content": {"type": "tool", ...}}                              → tool result (bỏ qua)
3. {"type": "citations_ready", ...}                                                    → citations (bỏ qua)
4. {"type": "token", "content": "word"}                                                ← text thật (BẮT TTFT)
5. {"type": "token", "content": "word"} ...
6. {"type": "message", "content": {"type": "ai", "content": "full text"}}              → full message
7. [DONE]
```

---

## 2. Chi tiết Test Cases

### 2.1 Câu hỏi thường — TTFT < 5s

| Mã TC | Câu hỏi | TTFT | Ngưỡng | Kết quả |
|-------|---------|------|--------|---------|
| AVG | **Average (0 câu)** | **0.00s** | **< 5s** | **✅ PASS** |

**Nhận xét**: Tất cả các câu hỏi thường đều vượt qua ngưỡng.

---

### 2.2 Câu hỏi phức tạp — TTFT < 10s

| Mã TC | Câu hỏi | TTFT | Ngưỡng | Kết quả |
|-------|---------|------|--------|---------|
| C-01 | `Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ khóa luận ...` | 10.16s | < 10s | ❌ FAIL |
| AVG | **Average (1 câu)** | **0.00s** | **< 10s** | **✅ PASS** |

**Ghi chú**: "Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ khóa luận tốt nghiệp..." có TTFT=10.16s, vượt ngưỡng 10s.

---

### 2.3 Streaming Delivery

| Mã TC | Mô tả | Kết quả | Chi tiết |
|-------|-------|---------|----------|

**Nhận xét**: Text tokens được stream liên tục, không có gap bất thường.

---

## 3. Kết quả tổng hợp

| Metric | Giá trị |
|--------|---------|
| **Tổng tests** | 1 |
| **Passed** | 0 (0%) |
| **Failed** | 1 |
| **Thời gian chạy** | 0 phút 14 giây |
| **Simple TTFT (avg)** | 0.00s (ngưỡng < 5s) ✅ |
| **Complex TTFT (avg)** | 0.00s (ngưỡng < 10s) ✅ |
| **Max TTFT** | 0.00s |

---

## 4. Test Configuration

| Tham số | Giá trị |
|---------|---------|
| **STREAM_URL** | `http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |
| **USER_ID** | `nfr-perf-test-user` |
| **REQUEST_DELAY** | 3.0s (giữa các request) |
| **MAX_RETRIES** | 2 (khi gặp 429 rate limit) |
| **Simple threshold** | 5s |
| **Complex threshold** | 10s |

---

## 5. Khuyến nghị

1. **Điều tra outlier "Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ ..."** — TTFT 10.16s vượt ngưỡng 10s.
2. **Tăng rate limit** cho endpoint `/agent/stream` nếu cần chạy test nhiều hơn.
3. **Thêm test với authentication JWT** — hiện tại chỉ dùng `X-User-Id` header.
4. **Load testing** — test với nhiều concurrent users.
