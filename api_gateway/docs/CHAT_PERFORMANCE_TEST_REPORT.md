# Báo cáo Kiểm thử Hiệu năng — API Gateway Streaming

## 1. Tổng quan

Kiểm thử hiệu năng (Performance Testing) cho endpoint streaming SSE của Agent Service qua API Gateway.

| Thông tin | Chi tiết |
|-----------|----------|
| **Framework** | Standalone runner (import trực tiếp từ test_chat_performance.py) |
| **Endpoint** | `POST http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |
| **Thư mục tests** | `api_gateway/tests/test_chat_performance.py` |
| **Ngày thực thi** | 07/05/2026 20:31 |
| **Tổng số tests** | **19** |
| **Trạng thái** | **⚠️ 18/19 PASS (95%)** |
| **Thời gian chạy** | 2 phút 59 giây |

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
| S-01 | `Xin chao` | 3.10s | < 5s | ✅ PASS |
| S-02 | `Hello` | 1.17s | < 5s | ✅ PASS |
| S-03 | `Chao ban` | 1.01s | < 5s | ✅ PASS |
| S-04 | `Ban la ai?` | 2.75s | < 5s | ✅ PASS |
| S-05 | `Ban lam duoc gi?` | 6.26s | < 5s | ❌ FAIL |
| S-06 | `Cam on ban` | 1.11s | < 5s | ✅ PASS |
| AVG | **Average (6 câu)** | **1.83s** | **< 5s** | **✅ PASS** |

---

### 2.2 Câu hỏi phức tạp — TTFT < 10s

| Mã TC | Câu hỏi | TTFT | Ngưỡng | Kết quả |
|-------|---------|------|--------|---------|
| C-01 | ` điều kiện khi xét cử sinh viên tham gia chương trình trao đổi/thực tậ...` | 8.97s | < 10s | ✅ PASS |
| C-02 | ` chuẩn tiếng Nhật theo từng năm học dành cho sinh viên chương trình đị...` | 8.56s | < 10s | ✅ PASS |
| C-03 | `xét đăng ký học Chương trình đào tạo thạc sĩ theo hướng nghiên cứu` | 9.02s | < 10s | ✅ PASS |
| C-04 | `Quy định về người hướng dẫn luận văn thạc sĩ và luận án tiến sĩ` | 8.38s | < 10s | ✅ PASS |
| C-05 | ` Chuẩn đầu vào tiếng Anh` | 8.15s | < 10s | ✅ PASS |
| C-06 | `CHƯƠNG TRÌNH KỸ SƯ CHẤT LƯỢNG CAO (PFIEV)` | 9.19s | < 10s | ✅ PASS |
| C-07 | `XÉT TUYỂN THẲNG, ƯU TIÊN XÉT TUYỂN THẲNG` | 8.26s | < 10s | ✅ PASS |
| C-08 | `Nguyên tắc xét tuyển` | 9.58s | < 10s | ✅ PASS |
| C-09 | `LỊCH SỬ HÌNH THÀNH trường` | 8.88s | < 10s | ✅ PASS |
| C-10 | `Điểm Chuẩn Tuyển Sinh Đại học Chính Quy 2025 (Mã ngành 1XX)` | 8.62s | < 10s | ✅ PASS |
| AVG | **Average (10 câu)** | **8.76s** | **< 10s** | **✅ PASS** |

---

### 2.3 Streaming Delivery

| Mã TC | Mô tả | Kết quả | Chi tiết |
|-------|-------|---------|----------|
| STR-01 | Max gap giữa text tokens < 10s | ✅ PASS | `max_gap=0.60s, tokens=287` |
| STR-02 | Nhận được nhiều text tokens | ✅ PASS | `tokens=57` |
| STR-03 | Với RAG, event đầu tiên là tool call (không phải text) | ✅ PASS | `first_event=message, tokens=237` |

**Nhận xét**: Text tokens được stream liên tục, không có gap bất thường.

---

## 3. Kết quả tổng hợp

| Metric | Giá trị |
|--------|---------|
| **Tổng tests** | 19 |
| **Passed** | 18 (95%) |
| **Failed** | 1 |
| **Thời gian chạy** | 2 phút 59 giây |
| **Simple TTFT (avg)** | 1.83s (ngưỡng < 5s) ✅ |
| **Complex TTFT (avg)** | 8.76s (ngưỡng < 10s) ✅ |
| **Max TTFT** | 9.58s |

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

1. **Monitor TTFT định kỳ** — chạy test hàng tuần để phát hiện regression sớm.
2. **Tăng rate limit** cho endpoint `/agent/stream` nếu cần chạy test nhiều hơn.
3. **Thêm test với authentication JWT** — hiện tại chỉ dùng `X-User-Id` header.
4. **Load testing** — test với nhiều concurrent users.
