# UI Unit Testing Strategy

## 1. Tổng quan
Tài liệu này xác định chiến lược, quy trình, và các nguyên tắc thiết kế kịch bản Unit Test cho UI của hệ thống Frontend (Next.js/React). Mục tiêu là đảm bảo mọi thành phần giao diện (UI Components), logic tái sử dụng (Custom Hooks), và các hàm tiện ích (Utils) hoạt động đúng đắn và độc lập.

| Thông tin | Chi tiết |
|-----------|----------|
| **Cấp độ Test** | Unit Testing (Kiểm thử mức Đơn vị) |
| **Framework** | Jest + React Testing Library (RTL) |
| **Mục tiêu Coverage** | > 80% (Statements, Branches, Functions, Lines) |

## 2. Phân loại Cấp độ Test trong UI

Để chiến lược logic và bao quát, chúng ta phân tầng UI Unit Test thành 3 lớp:

1. **Utils/Helpers Level:** Các hàm thuần túy (pure functions), tính toán, format dữ liệu không phụ thuộc vào React.
2. **Hooks Level:** Các Custom React Hooks xử lý logic state, fetching data, subscriptions.
3. **Components Level:** Các UI Components (từ Dump Components tới Smart Components).

---

## 3. Chiến lược & Kịch bản Test cụ thể

### 3.1 Cấp độ Utils/Helpers (Hàm tiện ích)
- **Đặc điểm:** Không có giao diện, là pure functions.
- **Tiêu chí:** Test MỌI nhánh điều kiện (branch), bắt tất cả edge cases (giá trị rỗng, undefined, sai định dạng).
- **Ví dụ test case:**
  - `formatDate(dateString)`:
    - Trả về đúng định dạng "DD/MM/YYYY" nếu truyền ngày chuẩn.
    - Xử lý lỗi an toàn (trả về N/A) nếu `dateString` là null/undefined/sai định dạng.

### 3.2 Cấp độ Custom Hooks
- **Đặc điểm:** Chứa state và lifecycle (useEffect), thường gắn liền với fetching data hoặc window object.
- **Cách test:** Sử dụng `renderHook` từ `@testing-library/react`.
- **Kịch bản test (Ví dụ với `useChat` hook):**
  - Khởi tạo hook với state mặc định (messages rỗng, isLoading = false).
  - Test hành vi thay đổi state: Gọi hàm `sendMessage()`, kiểm tra `isLoading` chuyển thành true, sau đó message mới được thêm vào danh sách.
  - Test xử lý lỗi: Mock API trả về lỗi, đảm bảo `error` state được cập nhật chính xác.

### 3.3 Cấp độ UI Components
- **Đặc điểm:** Render DOM, phản hồi sự kiện người dùng. Được chia làm 2 loại nhỏ:
  - *Dumb Components (UI thuần):* Chỉ nhận props và render (VD: Button, Icon).
  - *Smart Components (Container):* Chứa logic phức tạp, kết nối hooks (VD: ChatInterface, WayfinderMap).

#### Kịch bản Test Smart Components (Ví dụ: `WayfinderMap.tsx`)
1. **Trạng thái Khởi tạo (Initial Render):**
   - Đảm bảo component render đúng container map mà không bị crash.
   - Hiển thị Skeleton/Loading spinner khi data chưa sẵn sàng.
2. **Tương tác Người dùng (User Interactions):**
   - Click vào một "Marker" -> Phải hiển thị Tooltip chứa thông tin phòng.
   - Nhấn nút "Zoom In/Out" -> Hàm xử lý zoom phải được gọi.
3. **Integration với Hooks/Props:**
   - Mock giá trị `routeData` trả về từ API -> Kiểm tra polyline (đường vẽ) có được render tương ứng với tọa độ hay không.
4. **Xử lý Không có dữ liệu (Empty States):**
   - Khi không có `routeData`, hiển thị thông báo "Chưa có tuyến đường".

#### Kịch bản Test Dumb Components (Ví dụ: `ChatMessage.tsx`)
1. **Render dữ liệu tĩnh:**
   - Nhận prop `text="Hello"`, kiểm tra `screen.getByText("Hello")` có tồn tại.
2. **Dynamic Styling:**
   - Nếu `isBot={true}`, kiểm tra component có class CSS `.bot-bubble` hoặc hiển thị avatar của Bot.
   - Nếu `isBot={false}`, kiểm tra component có class CSS `.user-bubble`.
3. **Sự kiện UI (Events):**
   - Click nút "Copy message" -> Hàm `onCopy` phải được gọi 1 lần (`toHaveBeenCalledTimes(1)`).

---

## 4. Best Practices & Quy tắc khi viết Test

1. **Tìm kiếm theo ý nghĩa (Accessibility Queries):**
   - *Khuyên dùng:* `getByRole`, `getByLabelText`, `getByText`.
   - *Hạn chế:* `getByTestId` (chỉ dùng khi không thể dùng các query trên).
2. **Không test implementation details:**
   - Test NHỮNG GÌ user thấy và thao tác, chứ không test cách component thực thi bên trong (ví dụ: không test việc component gọi `setState` như thế nào, mà test UI thay đổi ra sao sau khi click).
3. **Mocking Dependencies:**
   - Mock tất cả các external API (fetch/axios) bằng `jest.mock`.
   - Mock các service phức tạp (như WebGL/Canvas/Three.js) để tránh lỗi trên JSDOM (vì JSDOM không hỗ trợ đồ họa thật).
   - Mock `ResizeObserver`, `IntersectionObserver` nếu component có sử dụng.

## 5. Tổ chức Thư mục
```text
frontend/
├── components/
│   ├── Chat/
│   │   ├── ChatMessage.tsx
│   │   └── ChatMessage.test.tsx      <-- File test nằm cùng thư mục
│   └── Map/
│       ├── WayfinderMap.tsx
│       └── WayfinderMap.test.tsx
├── hooks/
│   ├── useChat.ts
│   └── useChat.test.ts
```

## 6. Lệnh Thực Thi

```bash
# Chạy toàn bộ Unit Tests
npm run test

# Chạy test trong chế độ Watch (đang code)
npm run test:watch

# Chạy test và xuất báo cáo Coverage
npm run test:coverage
```
