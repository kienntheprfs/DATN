# Tổng quan Chiến lược & Công nghệ Kiểm thử (Master Test Strategy)

## 1. Triết lý Kiểm thử (Tại sao chúng ta test theo cách này?)

Hệ thống DATN-Chatbot có đặc thù là kết hợp giữa **Phần mềm web thông thường** (API, Database, UI) và **Luồng xử lý AI** (NLP, Chatbot, Voice). Vì sự phức tạp này, chúng ta không thể "test mọi thứ bằng tay" hoặc "chỉ test E2E giao diện cuối cùng". Triết lý ở đây là chia nhỏ để trị theo mô hình **Kim tự tháp (Testing Pyramid)** nhằm cân bằng giữa "Tốc độ phát hiện lỗi" và "Độ tin cậy của toàn hệ thống".

Cụ thể, tại sao lại áp dụng triết lý này vào DATN-Chatbot?

- **Tại sao cần Unit Tests (Mức cơ sở - Càng nhiều càng tốt)?**
  - *Vấn đề:* Các hàm tính toán đường đi (Route Logic), xử lý câu lệnh người dùng (NLP) hay các UI component (Chat Bubble, Map Marker) rất dễ hỏng khi sửa code. Nếu chỉ test bằng tay, dev phải tự nghĩ ra kịch bản (VD: nhập số âm, nhập text rỗng) rất mất thời gian.
  - *Giải pháp:* Unit test cô lập các đoạn code này lại và kiểm tra trong chớp mắt (vài milliseconds). Ví dụ: Nhờ Unit test, nếu thuật toán tính góc quay bản đồ bị sai lệch, terminal sẽ báo lỗi ngay lúc bạn vừa lưu file, thay vì bạn phải bật app lên, click thử việc đi từ "Sảnh A" đến "Phòng 101" rồi mới nhận ra mũi tên quay ngược hướng.

- **Tại sao cần Integration Tests (Mức giữa - Số lượng vừa đủ)?**
  - *Vấn đề:* Unit test báo code Frontend đúng, code Backend đúng, nhưng gọi API lại báo lỗi 500 do sai định dạng JSON. Hoặc logic lưu Database bị sai kiểu dữ liệu.
  - *Giải pháp:* Integration test sinh ra để kiểm tra các "điểm nối" này (Frontend <-> API, Backend <-> Database). Đặc biệt với AI: thay vì mỗi lần test lại gọi API thật lên LLM gây tốn tiền và chậm, ta dùng Integration test để "chặn" request lại, trả về câu trả lời giả lập (mocking) để xem Backend/Frontend hứng dữ liệu streaming (SSE) có bị giật lag hay văng lỗi không.

- **Tại sao E2E Tests là đỉnh kim tự tháp (Ít nhất nhưng quan trọng nhất)?**
  - *Vấn đề:* Cho dù Unit và Integration xanh (pass) 100%, user vẫn có thể kêu ca rằng "đăng nhập xong bị màn hình trắng" hoặc "nút micro bị thanh điều hướng che mất không bấm được".
  - *Giải pháp:* E2E test đóng vai trò một người dùng "máy móc" vô cùng khó tính. Nó sẽ mở trình duyệt thật (Chrome/Safari), bấm vào ô chat, gõ câu hỏi, ngồi chờ bot trả lời, rồi click vào bản đồ xem có render đúng polyline không.
  - *Tại sao E2E lại ít nhất?* Vì việc mở trình duyệt và chạy E2E cực kỳ tốn thời gian. Nếu bạn viết quá nhiều E2E, quá trình CI/CD có thể mất 20-30 phút, khiến đội dev phải đợi dài cổ mới được merge code. Do đó, chỉ dùng E2E cho các **luồng sống còn (Critical User Journeys)** như Auth, Flow hỏi đường, và Voice.

---

## 2. Tech Stack Kiểm thử & So sánh công nghệ

Dưới đây là các công cụ (Tech Stack) được lựa chọn cho dự án, kèm theo phân tích so sánh lý do tại sao chúng được chọn so với các đối thủ trên thị trường.

### 2.1 Frontend Unit & Component Testing
**Công cụ lựa chọn: `Jest` + `React Testing Library (RTL)`**

*Vai trò:* Kiểm thử các Component giao diện (UI), Custom Hooks và các hàm tiện ích của Next.js/React.

| Tiêu chí | Jest + RTL (Được chọn) | Vitest | Cypress Component Testing |
|----------|------------------------|--------|---------------------------|
| **Ưu điểm** | - Tiêu chuẩn công nghiệp (Industry standard) cho React.<br>- Khả năng mock (module, function, timer) cực kỳ mạnh mẽ.<br>- RTL khuyến khích viết test theo cách người dùng tương tác (Accessibility). | - Tốc độ chạy cực nhanh (dùng ESBuild).<br>- Cấu hình đơn giản nếu dự án dùng Vite. | - Test trên trình duyệt thật (Real Browser).<br>- Visual debugging tốt. |
| **Nhược điểm** | - Chạy chậm hơn Vitest trong các project lớn.<br>- Cấu hình đôi khi phức tạp với ESM. | - Còn khá mới, cộng đồng và thư viện plugin chưa phong phú bằng Jest. | - Chạy chậm hơn Jest/Vitest vì phải bật trình duyệt.<br>- Khó setup trên CI hơn. |

**👉 Lý do chọn:** Dự án DATN cần sự ổn định, tài liệu phong phú và khả năng mock API sâu. RTL giúp đảm bảo tính Accessibility (A11y) - điều rất quan trọng trong UI/UX hiện đại.

---

### 2.2 Backend Unit & Integration Testing
**Công cụ lựa chọn: `Pytest`**

*Vai trò:* Kiểm thử các logic xử lý đường đi (Wayfinder), API Endpoints (FastAPI) và truy xuất Database (SQLModel/PostgreSQL).

| Tiêu chí | Pytest (Được chọn) | `unittest` (Built-in Python) | Nose2 |
|----------|--------------------|------------------------------|-------|
| **Cú pháp** | Cực kỳ ngắn gọn, chỉ cần dùng `assert` tiêu chuẩn của Python. | Phức tạp, mang hơi hướng Java (phải dùng `self.assertEqual`, kế thừa class). | Khá cũ, ít được cập nhật. |
| **Fixtures** | Cơ chế Fixtures cực kỳ mạnh mẽ, linh hoạt (tái sử dụng DB connection, mock client dễ dàng theo từng scope: module, session). | Dùng `setUp` và `tearDown` rập khuôn, khó chia sẻ logic setup giữa các file test. | Tương tự unittest. |
| **Ecosystem** | Hỗ trợ hàng ngàn plugin (`pytest-asyncio`, `pytest-cov`). | Ít plugin hỗ trợ hơn. | Cũ. |

**👉 Lý do chọn:** FastAPI kết hợp với Pytest là bộ đôi hoàn hảo. Pytest hỗ trợ viết test cho các hàm `async` (rất nhiều trong hệ thống chatbot và streaming) một cách tự nhiên nhờ plugin `pytest-asyncio`.

---

### 2.3 End-to-End (E2E) Testing
**Công cụ lựa chọn: `Playwright`**

*Vai trò:* Đóng vai người dùng thật, mở trình duyệt, đăng nhập, chat với Bot, mở bản đồ và nghe voice.

| Tiêu chí | Playwright (Được chọn) | Cypress | Selenium |
|----------|------------------------|---------|----------|
| **Kiến trúc** | Giao tiếp qua WebSockets, tương tác trực tiếp với Chrome DevTools Protocol. | Chạy bên trong trình duyệt (In-browser), chung event loop với ứng dụng. | Giao tiếp qua HTTP (WebDriver), architecture khá cũ. |
| **Đa trình duyệt** | Hỗ trợ Chromium, Firefox, WebKit (Safari) rất tốt và cài đặt chỉ bằng 1 lệnh. | Chromium tốt, Firefox tạm được, không hỗ trợ WebKit thực sự. | Hỗ trợ tất cả nhưng setup driver thủ công rất cực. |
| **Đa tab / iframe** | Hỗ trợ test nhiều tab, iframe, nhiều user context cùng lúc cực tốt. | Rất yếu trong việc xử lý multi-tabs và cross-origin iframes. | Có hỗ trợ nhưng chậm và hay flaky. |
| **Tốc độ** | Rất nhanh, hỗ trợ chạy song song (Parallel) mặc định cực tốt. | Chạy song song phải trả phí Cloud hoặc config phức tạp. | Chậm nhất. |

**👉 Lý do chọn:** Hệ thống Chatbot yêu cầu xử lý các frame bản đồ phức tạp và luồng voice. Khả năng auto-wait, test nhiều user context cùng lúc (VD: Test Admin và User chat với nhau), và tốc độ của Playwright hoàn toàn vượt trội so với Cypress.

---

### 2.4 API Mocking (Frontend)
**Công cụ lựa chọn: `MSW (Mock Service Worker)`**

*Vai trò:* Chặn các API calls từ Frontend gửi xuống Backend trong lúc chạy Integration/Unit tests, thay thế bằng dữ liệu giả.

| Tiêu chí | MSW (Được chọn) | Nock / axios-mock-adapter |
|----------|-----------------|---------------------------|
| **Cách hoạt động**| Dùng Service Worker để chặn request ở cấp độ Network (Trình duyệt/Node). | Ghi đè (monkey-patch) trực tiếp các hàm `fetch` hoặc `axios`. |
| **Ưu điểm** | Code Frontend không biết là đang bị mock (cách test rất "sạch"). Cùng 1 file mock có thể dùng cho cả Jest, Storybook, và Browser lúc dev. | Dễ setup cho các project nhỏ. |
| **Nhược điểm** | Setup lần đầu hơi phức tạp một chút. | Bị dính chặt vào thư viện gọi API (nếu đổi từ axios sang fetch sẽ phải viết lại test). |

**👉 Lý do chọn:** MSW tạo ra môi trường giả lập API hoàn hảo nhất, giúp Frontend developer phát triển UI và viết test độc lập hoàn toàn kể cả khi Backend chưa code xong API đó.

---

## 3. Quản lý Môi trường & CI/CD Pipeline

Chiến lược thực thi (Execution Strategy) trên Pipeline (VD: GitHub Actions hoặc GitLab CI):

1. **Giai đoạn 1: Linting & Type Checking**
   - Chạy ESLint, Prettier, TypeScript `tsc` (Frontend) & `flake8`/`mypy` (Backend).
2. **Giai đoạn 2: Unit Testing (Fail Fast)**
   - Chạy Jest (UI) và Pytest (Backend functions).
   - *Yêu cầu:* Tốc độ phải rất nhanh (< 2 phút). Nếu tạch ở đây, dừng Pipeline ngay lập tức.
3. **Giai đoạn 3: Integration Testing**
   - Chạy các test kết nối Database (với một PostgreSQL container tạm thời) và MSW tests.
4. **Giai đoạn 4: E2E Testing (Nightly hoặc Before Release)**
   - Deploy code lên một môi trường Staging nội bộ.
   - Kích hoạt Playwright mở trình duyệt chạy full flow từ Login đến Chat.
   - Lọc và lưu trữ các Screenshot/Video nếu test bị lỗi (artifacts) để developer dễ debug.
