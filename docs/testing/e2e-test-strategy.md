# End-to-End (E2E) Testing Strategy

## 1. Tổng quan
Tài liệu này xác định chiến lược E2E Test cho dự án DATN-Chatbot. E2E Test mô phỏng hành vi của người dùng thật tương tác trên trình duyệt, đi từ giao diện Frontend qua Backend API, xuống Database và quay ngược lại, đảm bảo toàn bộ hệ thống hoạt động thống nhất.

| Thông tin | Chi tiết |
|-----------|----------|
| **Cấp độ Test** | End-to-End (E2E) |
| **Framework** | Playwright |
| **Browsers** | Chromium (Desktop & Mobile view) |
| **Môi trường** | Staging / Local (Full stack running) |

## 2. Chiến lược thiết kế E2E Test

### 2.1 Nguyên tắc Cốt lõi
1. **Mô phỏng như Người dùng:** Không gọi trực tiếp function/API từ code test, mà phải dùng locator (click, type) trên UI.
2. **Không phụ thuộc trạng thái (State Independence):** Mỗi test case phải tự setup dữ liệu (ví dụ: tạo user mới) và teardown, không phụ thuộc vào kết quả của test case trước.
3. **Black-box Testing:** Không quan tâm đến code thực thi ra sao, chỉ quan tâm đến UI input và UI output.

### 2.2 User Journeys (Hành trình người dùng)
Chúng ta sẽ thiết kế E2E Test xoay quanh các hành trình chính của hệ thống.

#### Journey 1: Authentication Flow
- **Scenario:** Người dùng truy cập hệ thống và đăng nhập thành công.
- **Steps:**
  1. Navigate tới trang `/auth`.
  2. Điền `email` và `password` hợp lệ.
  3. Click nút "Đăng nhập".
  4. Xác nhận URL chuyển sang `/` (trang chủ).
  5. Xác nhận Header hiển thị thông tin User/Avatar.

#### Journey 2: Core Chat & Wayfinder Flow (Happy Path)
- **Scenario:** Người dùng hỏi đường và hệ thống hiển thị bản đồ chỉ đường.
- **Steps:**
  1. Login vào hệ thống (sử dụng storageState để bỏ qua bước gõ mật khẩu nếu cần).
  2. Tại trang chat, gõ vào ô input: *"Chỉ đường cho tôi từ Sảnh A đến Phòng 101"*.
  3. Nhấn phím Enter hoặc click "Gửi".
  4. Đợi AI phản hồi (có thể mất 2-5s, sử dụng Playwright `waitForResponse` hoặc wait text).
  5. Kiểm tra UI hiển thị tin nhắn trả lời của bot.
  6. Kiểm tra UI hiển thị Component Bản đồ Mini (Mini Map).
  7. Click vào nút "Xem chi tiết bản đồ".
  8. Xác nhận Modal Fullscreen Map mở lên và hiển thị Polyline chỉ đường.

#### Journey 3: Voice Interaction Flow
- **Scenario:** Sử dụng tính năng Voice để hỏi đáp.
- **Steps:**
  1. Cấp quyền truy cập Microphone cho trình duyệt (Playwright browser context config).
  2. Click nút "Micro" trên thanh chat.
  3. UI hiển thị hiệu ứng đang lắng nghe (Listening status).
  4. *Note:* Để test tự động phần này, có thể cần mock file audio truyền vào thay cho micro thật, hoặc dùng một API ẩn để trigger fake voice.
  5. Xác nhận UI hiển thị text sau khi Speech-to-Text chạy xong.

#### Journey 4: Admin Dashboard Flow
- **Scenario:** Quản trị viên cập nhật dữ liệu bản đồ.
- **Steps:**
  1. Login với tài khoản Admin.
  2. Chuyển hướng tới `/admin/map-management`.
  3. Click "Thêm Node mới".
  4. Nhập Tên điểm (VD: "Phòng Họp 2"), Tọa độ (X: 100, Y: 200).
  5. Click "Lưu".
  6. Verify hiển thị thông báo "Tạo thành công".
  7. Kiểm tra bảng dữ liệu đã có dòng "Phòng Họp 2".

---

## 3. Cấu hình Playwright & Data Management

### 3.1 Global Setup & Teardown
- Tránh việc test nào cũng phải điền form đăng nhập gây tốn thời gian.
- **Giải pháp:** Sử dụng file `global-setup.ts` của Playwright để đăng nhập 1 lần -> Lưu lại cookies/localStorage (gọi là `storageState`) -> Các test case khác kế thừa state này để luôn ở trạng thái đã đăng nhập.

### 3.2 Xử lý API chậm / Flaky Tests
- Dùng `page.waitForResponse('**/api/chat')` để chờ backend xử lý xong thay vì dùng `page.waitForTimeout()` cứng ngắc.
- Bật chế độ tự động retry trên CI (VD: `retries: 2`).

### 3.3 Test Database
- E2E Test nên chạy trên một DB hoàn toàn tách biệt khỏi môi trường Dev để tránh rác dữ liệu.
- Viết script reset DB trước khi chạy bộ E2E Test.

## 4. Tổ chức thư mục Playwright

```text
e2e/
├── auth.spec.ts         # Tests cho Đăng nhập/Đăng ký
├── chat.spec.ts         # Tests cho nhắn tin text
├── wayfinder.spec.ts    # Tests cho chỉ đường, bản đồ
├── admin.spec.ts        # Tests cho trang quản lý
└── support/
    └── global-setup.ts  # Setup auth state
```

## 5. Lệnh Thực Thi

```bash
# Chạy E2E ở chế độ headless (thường dùng trên CI/CD)
npx playwright test

# Chạy E2E hiển thị trình duyệt trực quan (để debug)
npx playwright test --ui

# Chạy E2E với công cụ Inspector
npx playwright test --debug
```
