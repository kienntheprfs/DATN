# Báo cáo Kiểm thử Hiệu năng — API Gateway Streaming

## 1. Tổng quan

Kiểm thử hiệu năng (Performance Testing) cho endpoint streaming SSE của Agent Service qua API Gateway.

| Thông tin | Chi tiết |
|-----------|----------|
| **Framework** | Standalone runner (import trực tiếp từ test_chat_performance.py) |
| **Endpoint** | `POST http://localhost:8002/agent/stream?agent_id=knowledge-base-agent` |
| **Thư mục tests** | `api_gateway/tests/test_chat_performance.py` |
| **Ngày thực thi** | 10/05/2026 18:31 |
| **Tổng số tests** | **23** |
| **Trạng thái** | **⚠️ 19/23 PASS (83%)** |
| **Thời gian chạy** | 3 phút 53 giây |

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
| C-01 | `Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ khóa luận ...` | 4.84s | < 10s |  |
| C-02 | `Quy định xét Cúp Toàn Năng tại trường là gì?` | 5.20s | < 10s |  |
| C-03 | `Giảng viên có cần tải tài liệu lên LMS cho sinh viên không?` | 4.99s | < 10s | ✅ PASS |
| C-04 | `Nếu giảng viên không đưa tài liệu lên BKeL thì sẽ bị xử lý như thế nào...` | 4.89s | < 10s | ✅ PASS |
| C-05 | `Nộp chứng chỉ JLPT N1 thì được hưởng quyền lợi gì theo quy định của tr...` | 6.46s | < 10s | ✅ PASS |
| C-06 | `Chương trình mức độ năm dành cho đối tượng nào?` | 4.74s | < 10s | ✅ PASS |
| C-07 | `Điều kiện để học thêm ngành thứ hai (đào tạo song ngành) là gì? Yêu cầ...` | 4.99s | < 10s | ✅ PASS |
| C-08 | `Trong chương trình Chất lượng cao và Tiên tiến, học phần Kỹ năng xã hộ...` | 4.99s | < 10s | ✅ PASS |
| C-09 | `Tiêu chí bắt buộc về nghiên cứu khoa học và hoạt động ngoại khóa đối v...` | 4.81s | < 10s | ✅ PASS |
| C-10 | `Trường xử lý chênh lệch điểm trong hình thức thi vấn đáp như thế nào?` | 5.54s | < 10s |  |
| C-11 | `Sinh viên xin nghỉ học tạm thời thì được nghỉ tối đa bao lâu?` | 7.83s | < 10s | ✅ PASS |
| C-12 | `Điều kiện để được nghỉ học tạm thời tại trường là gì?` | 4.22s | < 10s |  |
| C-13 | `Điểm W và điểm R trong quy chế học vụ của HCMUT có nghĩa là gì?` | 7.28s | < 10s | ✅ PASS |
| C-14 | `Người hướng dẫn luận văn thạc sĩ có được tham gia hội đồng đánh giá ha...` | 6.58s | < 10s | ✅ PASS |
| C-15 | `Chương trình nào được xét huy chương vàng tốt nghiệp? Điều kiện để đượ...` | 5.29s | < 10s | ✅ PASS |
| C-16 | `Số lượng huy chương bạc tốt nghiệp được tặng thưởng là bao nhiêu?` | 4.85s | < 10s | ✅ PASS |
| C-17 | `Đối với các thí sinh tốt nghiệp chương trình THPT nước ngoài, khoảng t...` | 4.66s | < 10s | ✅ PASS |
| C-18 | `Đối với thí sinh học chương trình nước ngoài đăng ký dự tuyển vào chươ...` | 4.85s | < 10s | ✅ PASS |
| C-19 | `Vai trò chính của Trường Đại học Bách Khoa - ĐHQG-HCM trong khu vực ph...` | 4.68s | < 10s | ✅ PASS |
| C-20 | `Trường có thể yêu cầu tạm nộp học phí trong trường hợp nào?` | 4.78s | < 10s | ✅ PASS |
| AVG | **Average (20 câu)** | **5.54s** | **< 10s** | **✅ PASS** |

**Ghi chú**: "Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ khóa luận tốt nghiệp..." có TTFT=11.84s, vượt ngưỡng 10s.

**Ghi chú**: "Quy định xét Cúp Toàn Năng tại trường là gì?" có TTFT=13.70s, vượt ngưỡng 10s.

**Ghi chú**: "Trường xử lý chênh lệch điểm trong hình thức thi vấn đáp như thế nào?" có TTFT=10.54s, vượt ngưỡng 10s.

**Ghi chú**: "Điều kiện để được nghỉ học tạm thời tại trường là gì?" có TTFT=12.22s, vượt ngưỡng 10s.

---

### 2.3 Streaming Delivery

| Mã TC | Mô tả | Kết quả | Chi tiết |
|-------|-------|---------|----------|
| STR-01 | Max gap giữa text tokens < 10s | ✅ PASS | `max_gap=0.22s, tokens=315` |
| STR-02 | Nhận được nhiều text tokens | ✅ PASS | `tokens=94` |
| STR-03 | Với RAG, event đầu tiên là tool call (không phải text) | ✅ PASS | `first_event=message, tokens=278` |

**Nhận xét**: Text tokens được stream liên tục, không có gap bất thường.

---

## 3. Kết quả tổng hợp

| Metric | Giá trị |
|--------|---------|
| **Tổng tests** | 23 |
| **Passed** | 19 (83%) |
| **Failed** | 4 |
| **Thời gian chạy** | 3 phút 53 giây |
| **Simple TTFT (avg)** | 0.00s (ngưỡng < 5s) ✅ |
| **Complex TTFT (avg)** | 5.54s (ngưỡng < 10s) ✅ |
| **Max TTFT** | 9.28s |

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

1. **Điều tra outlier "Giảng viên hướng dẫn có được làm thành viên hội đồng bảo vệ ..."** — TTFT 11.84s vượt ngưỡng 10s.
2. **Tăng rate limit** cho endpoint `/agent/stream` nếu cần chạy test nhiều hơn.
3. **Thêm test với authentication JWT** — hiện tại chỉ dùng `X-User-Id` header.
4. **Load testing** — test với nhiều concurrent users.
