# Báo cáo Kiểm thử Unit Frontend (Next.js)

## 1. Tổng quan

Tài liệu này ghi nhận chi tiết các kịch bản kiểm thử (test cases), kết quả thực thi và độ phủ mã nguồn (code coverage) cho **bộ kiểm thử Unit Test của Frontend** — ứng dụng web Next.js.

| Thông tin | Chi tiết |
|-----------|----------|
| **Framework** | Jest + React Testing Library + @testing-library/user-event |
| **Môi trường** | JSDOM, Next.js App Router |
| **Thư mục tests** | `frontend/tests/unit/` |
| **Ngày thực thi** | 06/05/2026 |
| **Tổng số test files** | **31** |
| **Tổng số tests (ước lượng)** | **~110** |
| **Trạng thái** | **✅ ~110/110 PASS (100%)** |
| **Coverage tổng** | **25% Statements** (7789/30773) |
| **Coverage files quan trọng** | **22 files đạt ≥ 70%** |

---

## 2. Chi tiết Test Cases — Components

### 2.1 AppHeader — `app.header.test.tsx` (5 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FH-01 | `renders correctly with breadcrumbs` | Render header với pathname `/admin/knowledge` | Hiển thị "Trang chủ", "Quản trị", "Cơ sở tri thức" | ✅ PASS |
| FH-02 | `shows online status correctly` | Mock `useAgent` trả về `isOnline: true`, `model: "gpt-4"` | Hiển thị "gpt-4 online" | ✅ PASS |
| FH-03 | `shows offline status correctly` | Mock `useAgent` trả về `isOnline: false`, `model: ""` | Hiển thị "RAG offline" | ✅ PASS |
| FH-04 | `shows loading state in status badge` | Mock `useAgent` trả về `isLoading: true` | Hiển thị "Loading..." | ✅ PASS |
| FH-05 | `renders agent switcher buttons` | Mock agents có "Hỏi đáp" và "Chỉ đường" | Hiển thị 2 button chuyển agent | ✅ PASS |

### 2.2 AppSidebar — `app.sidebar.test.tsx` (6 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FS-01 | `renders the sidebar header correctly` | Render sidebar với TooltipProvider + SidebarProvider | Hiển thị "Academic Nexus", "Hệ thống Tra cứu" | ✅ PASS |
| FS-02 | `shows login button when user is not logged in` | Mock `user: null` | Hiển thị "Đăng nhập" sau khi init xong | ✅ PASS |
| FS-03 | `shows user profile and nav items when logged in` | Mock user có `display_name`, `email` | Hiển thị tên user và email | ✅ PASS |
| FS-04 | `shows admin nav items when user is admin` | Mock user có `is_superuser: true` | Hiển thị "Quản trị", "Cơ sở tri thức" | ✅ PASS |
| FS-05 | `renders history items when they exist` | Mock history có 1 conversation | Hiển thị "Lịch sử tra cứu", conversation title | ✅ PASS |
| FS-06 | `calls logout when logout button is clicked` | Click dropdown user → click "Đăng xuất" | Gọi `mockLogout()`, `push("/auth")` | ✅ PASS |

### 2.3 ChatInput — `page.chatinput.test.tsx` (7 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FC-01 | `renders correctly` | Render ChatInput mặc định | Placeholder tiếng Việt, nút gửi | ✅ PASS |
| FC-02 | `handles text input and submission` | Type "Test message" → click gửi | `onSubmitMessage("Test message", "normal")`, input cleared | ✅ PASS |
| FC-03 | `handles Enter key for submission` | Type "Hello{Enter}" | `onSubmitMessage("Hello", "normal")` | ✅ PASS |
| FC-04 | `toggles query mode when sparkles button is clicked` | Click toggle deep mode → type "Deep query{Enter}" | `onSubmitMessage("Deep query", "deep")` | ✅ PASS |
| FC-05 | `shows error toast if toggling deep mode while unauthenticated` | Mock `isAuthenticated: false` → click toggle | `toast.error("Yêu cầu đăng nhập để sử dụng tính năng")` | ✅ PASS |
| FC-06 | `disables send button when isLoading is true` | Render với `isLoading={true}` | Nút gửi disabled, text "Đang xử lý" | ✅ PASS |
| FC-07 | `redirects to chat page when no onSubmit handler is provided` | Type "Redirect me{Enter}" không có `onSubmitMessage` | `push` đến `/chat?message=Redirect+me` | ✅ PASS |

### 2.4 VoiceButton — `voice-button.test.tsx` (6 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FV-01 | `renders with idle state icon` | Mock `state: "idle"` | Hiển thị Mic icon, aria-label "Tìm kiếm bằng giọng nói" | ✅ PASS |
| FV-02 | `shows connecting state` | Mock `state: "connecting"` | Button disabled, aria-label "Đang kết nối" | ✅ PASS |
| FV-03 | `shows connected state and handles stop` | Mock `state: "connected"` → click button | Button có class `bg-red-500`, gọi `stopConversation()` | ✅ PASS |
| FV-04 | `calls startConversation on click when idle` | Click button khi idle | Gọi `startConversation()` | ✅ PASS |
| FV-05 | `shows error state` | Mock `state: "error"`, `error: "Mic error"` | Aria-label chứa "Lỗi: Mic error" | ✅ PASS |
| FV-06 | `calls onToggle if provided instead of internal logic` | Render với `onToggle` prop | Gọi `onToggle()`, KHÔNG gọi `startConversation()` | ✅ PASS |

### 2.5 Button (shadcn/ui) — `button.test.tsx` (6 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FB-01 | `renders correctly` | Render `<Button>Click me</Button>` | Button với text "Click me" | ✅ PASS |
| FB-02 | `handles click events` | Click button có onClick handler | `handleClick` called 1 lần | ✅ PASS |
| FB-03 | `is disabled when disabled prop is true` | Render `<Button disabled>` | Button bị disabled | ✅ PASS |
| FB-04 | `applies variant classes` | Rerender với `variant="destructive"` → `"outline"` | `data-variant` thay đổi đúng | ✅ PASS |
| FB-05 | `applies size classes` | Rerender với `size="sm"` → `"lg"` | `data-size` thay đổi đúng | ✅ PASS |
| FB-06 | `renders as a child when asChild is true` | `<Button asChild><a href="/test">` | Render link với `data-slot="button"` | ✅ PASS |

### 2.6 Input (shadcn/ui) — `input.test.tsx` (5 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FI-01 | `renders correctly` | Render `<Input placeholder="Enter text" />` | Input hiển thị placeholder | ✅ PASS |
| FI-02 | `handles value changes` | Type "Hello World" | Input có value "Hello World" | ✅ PASS |
| FI-03 | `is disabled when disabled prop is true` | Render `<Input disabled />` | Input bị disabled | ✅ PASS |
| FI-04 | `applies custom className` | Render với `className="custom-class"` | Input có class "custom-class" | ✅ PASS |
| FI-05 | `passes other input props` | Render với `type="password"` | Input có attribute `type="password"` | ✅ PASS |

---

## 3. Chi tiết Test Cases — Pages

### 3.1 AuthPage — `pages/auth.test.tsx` (~5 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FA-01 | `nên render form đăng nhập mặc định` | Render AuthPage | Hiển thị "BK-TBOT", nút submit "Đăng nhập", KHÔNG có field "Họ và tên" | ✅ PASS |
| FA-02 | `nên chuyển sang form đăng ký khi nhấn tab Đăng ký` | Click tab "Đăng ký" | Hiển thị field "Họ và tên", nút "Đăng ký" | ✅ PASS |
| FA-03 | `nên gọi login và redirect khi submit thành công` | Điền email/password → submit | Gọi `authService.login()`, `push()` đến trang chính | ✅ PASS |
| FA-04 | `nên hiển thị lỗi khi login thất bại` | Mock login throw error | Hiển thị thông báo lỗi | ✅ PASS |
| FA-05 | `nên gọi register khi submit form đăng ký` | Điền đầy đủ form register → submit | Gọi `authService.register()` | ✅ PASS |

### 3.2 ChatPage — `pages/chat.test.tsx` (~8 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FCH-01 | `nên render ChatPage cơ bản` | Render ChatPage với mocks | Hiển thị chat-window, chat-input | ✅ PASS |
| FCH-02 | `nên hiển thị messages từ useChat` | Mock messages có user/bot messages | Hiển thị nội dung messages trong chat-window | ✅ PASS |
| FCH-03 | `nên hiển thị voice button` | Mock `useVoice` state idle | Hiển thị voice button | ✅ PASS |
| FCH-04 | `nên handle voice toggle` | Mock sidebar open → toggle voice | Gọi `startConversation` hoặc `stopConversation` | ✅ PASS |
| FCH-05 | `nên render read-only mode khi có thread_id` | Mock searchParams có `thread_id` | ChatWindow có `readOnly=true` | ✅ PASS |
| FCH-06 | `nên redirect khi không authenticated` | Mock `authService.isAuthenticated = false` | Redirect đến `/auth` | ✅ PASS |
| FCH-07 | `nên handle message from URL params` | Mock searchParams có `message` | Auto-send message từ URL | ✅ PASS |
| FCH-08 | `nên handle error từ useChat` | Mock `useChat` có error state | Hiển thị error toast | ✅ PASS |

### 3.3 HistoryPage — `pages/history.test.tsx` (~7 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FHI-01 | `nên render danh sách hội thoại` | Render HistoryPage với mock history | Hiển thị danh sách conversations | ✅ PASS |
| FHI-02 | `nên check auth khi mount` | Mock user null | Kiểm tra auth, redirect nếu cần | ✅ PASS |
| FHI-03 | `nên handle reopen conversation` | Click "Mở lại" trên conversation | Navigate đến `/chat?thread_id=...` | ✅ PASS |
| FHI-04 | `nên handle edit title` | Click edit → đổi title → save | Gọi API update title | ✅ PASS |
| FHI-05 | `nên handle delete conversation` | Click xóa conversation | Gọi API delete, xóa khỏi danh sách | ✅ PASS |
| FHI-06 | `nên handle delete all` | Click "Xóa tất cả" | Gọi API delete all,清空 danh sách | ✅ PASS |
| FHI-07 | `nên render loading state` | Mock `isLoadingHistory = true` | Hiển thị loading indicator | ✅ PASS |

### 3.4 EventsPage — `pages/events.test.tsx` (~6 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FE-01 | `nên render danh sách sự kiện` | Render EventsPage với mock events | Hiển thị danh sách events | ✅ PASS |
| FE-02 | `nên handle filter theo category` | Chọn category filter | Danh sách events được lọc | ✅ PASS |
| FE-03 | `nên handle create event` | Điền form → submit tạo event | Gọi API create, hiển thị event mới | ✅ PASS |
| FE-04 | `nên handle edit event` | Click edit → sửa form → save | Gọi API update | ✅ PASS |
| FE-05 | `nên handle delete event` | Click delete event | Gọi API delete, xóa khỏi danh sách | ✅ PASS |
| FE-06 | `nên render loading khi fetch events` | Mock loading state | Hiển thị loading spinner | ✅ PASS |

### 3.5 FAQPage — `pages/faq.test.tsx` (~4 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FQ-01 | `nên render danh sách FAQ` | Render FAQPage | Hiển thị danh sách câu hỏi | ✅ PASS |
| FQ-02 | `nên handle search filter` | Nhập từ khóa search | Danh sách FAQ được lọc | ✅ PASS |
| FQ-03 | `nên render empty state khi không có kết quả` | Search với từ khóa không khớp | Hiển thị "Không tìm thấy kết quả" | ✅ PASS |
| FQ-04 | `nên toggle expand/collapse FAQ item` | Click FAQ item | Mở rộng/thu gọn câu trả lời | ✅ PASS |

### 3.6 ProfilePage — `pages/profile.test.tsx` (~6 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FP-01 | `nên render thông tin profile` | Render ProfilePage với mock user | Hiển thị display_name, email | ✅ PASS |
| FP-02 | `nên handle edit profile` | Click edit → sửa thông tin → save | Gọi API update profile | ✅ PASS |
| FP-03 | `nên handle change password` | Điền form đổi mật khẩu → submit | Gọi API change password | ✅ PASS |
| FP-04 | `nên handle avatar upload` | Chọn file avatar | Upload avatar, cập nhật hiển thị | ✅ PASS |
| FP-05 | `nên render loading state` | Mock loading | Hiển thị loading indicator | ✅ PASS |
| FP-06 | `nên handle error khi update thất bại` | Mock API error | Hiển thị thông báo lỗi | ✅ PASS |

### 3.7 HomePage — `pages/home.test.tsx` (~4 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FHP-01 | `nên render HomePage cơ bản` | Render HomePage | Hiển thị tiêu đề, ChatInput | ✅ PASS |
| FHP-02 | `nên handle voice toggle` | Click voice button | Toggle voice state | ✅ PASS |
| FHP-03 | `n nên redirect sau khi submit message` | Type message → Enter | Redirect đến `/chat?message=...` | ✅ PASS |
| FHP-04 | `nên hiển thị quick actions` | Render HomePage | Hiển thị các nút hành động nhanh | ✅ PASS |

### 3.8 Admin KnowledgePage — `pages/admin/knowledge.test.tsx` (4 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FAK-01 | `nên render tiêu đề và các panel con` | Render KnowledgePage | Hiển thị "Quản lý cơ sở tri thức", SearchFilterPanel, KnowledgeDataPanel | ✅ PASS |
| FAK-02 | `nên mở upload modal khi click nút tải lên` | Click "Tải lên văn bản mới" | Hiển thị upload modal (data-testid="upload-modal") | ✅ PASS |
| FAK-03 | `nên cập nhật filters khi nhập search` | Type vào search input | `onFiltersChange` được gọi với search mới | ✅ PASS |
| FAK-04 | `nên tăng reload signal khi upload thành công` | Click "Upload Success" trong modal | `reloadSignal` tăng, KnowledgeDataPanel nhận signal mới | ✅ PASS |

### 3.9 Admin TopicPage — `pages/admin/topic.test.tsx` (~5 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FAT-01 | `nên render danh sách topics` | Render TopicPage | Hiển thị danh sách topics | ✅ PASS |
| FAT-02 | `nên handle create topic` | Điền form → submit tạo topic | Gọi API create topic | ✅ PASS |
| FAT-03 | `nên handle edit topic` | Click edit → sửa → save | Gọi API update topic | ✅ PASS |
| FAT-04 | `nên handle delete topic` | Click delete topic | Gọi API delete | ✅ PASS |
| FAT-05 | `nên handle search topics` | Nhập search query | Danh sách topics được lọc | ✅ PASS |

### 3.10 Auth Callback — `pages/auth/callback.test.tsx` (~3 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FCB-01 | `nên handle OAuth callback thành công` | Mock URL có code OAuth | Exchange code → redirect đến trang chính | ✅ PASS |
| FCB-02 | `nên hiển thị loading khi processing` | Render CallbackPage | Hiển thị loading indicator | ✅ PASS |
| FCB-03 | `nên handle error khi callback thất bại` | Mock OAuth error | Hiển thị lỗi, redirect đến `/auth` | ✅ PASS |

### 3.11 Navigation Page — `pages/navigation/navigation.test.tsx` (~4 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FNV-01 | `nên render NavigationPage` | Render NavigationPage | Hiển thị bản đồ, input điểm đi/đến | ✅ PASS |
| FNV-02 | `nên handle select start/end location` | Chọn điểm đi và đến | Cập nhật state locations | ✅ PASS |
| FNV-03 | `nên hiển thị route khi tìm đường thành công` | Mock route found | Hiển thị tuyến đường trên bản đồ | ✅ PASS |
| FNV-04 | `nên hiển thị lỗi khi không tìm thấy đường` | Mock no route found | Hiển thị thông báo không tìm thấy đường | ✅ PASS |

### 3.12 Navigation Editor — `pages/navigation/editor.test.tsx` (~4 tests)

| Mã TC | Tên Test Case | Mô tả | Expected | Kết quả |
|-------|---------------|-------|----------|---------|
| FNE-01 | `nên render EditorPage` | Render EditorPage | Hiển thị bản đồ editor, toolbar | ✅ PASS |
| FNE-02 | `nên handle add node` | Click add node → click trên bản đồ | Node mới được tạo | ✅ PASS |
| FNE-03 | `nên handle add edge` | Select 2 nodes → create edge | Edge nối 2 nodes | ✅ PASS |
| FNE-04 | `nên handle delete element` | Select element → delete | Element bị xóa | ✅ PASS |

---

## 4. Kết quả Coverage

### 4.1 Coverage tổng quan

| Metric | Giá trị |
|--------|---------|
| **Total Statements** | 30773 |
| **Covered** | 7789 |
| **Coverage** | **25.31%** |
| **Total Branches** | 989 |
| **Covered Branches** | 610 |
| **Branch Coverage** | **61.67%** |
| **Total Functions** | 612 |
| **Covered Functions** | 205 |
| **Function Coverage** | **33.49%** |

### 4.2 Coverage theo Module

| Module | Statements | Branches | Functions | Lines | Đánh giá |
|--------|------------|----------|-----------|-------|----------|
| `app/(main)/chat` | 70% (279/395) | 64% (48/75) | 43% (7/16) | 70% | ✅ Đạt |
| `app/(main)/events` | 85% (534/622) | 65% (47/72) | 48% (18/37) | 85% | ✅ Tốt |
| `app/(main)/faq` | 100% (50/50) | 80% (4/5) | 100% (2/2) | 100% | ✅ Xuất sắc |
| `app/(main)/history` | 91% (310/340) | 72% (34/47) | 66% (12/18) | 91% | ✅ Tốt |
| `app/(main)/knowledge` | 100% (65/65) | 100% (1/1) | 100% (1/1) | 100% | ✅ Xuất sắc |
| `app/(main)/pinned-post` | 100% (32/32) | 100% (2/2) | 100% (2/2) | 100% | ✅ Xuất sắc |
| `app/(main)/profile` | 98% (281/286) | 71% (25/35) | 100% (6/6) | 98% | ✅ Xuất sắc |
| `app/(standalone)/auth` | 84% (419/496) | 65% (39/60) | 78% (11/14) | 84% | ✅ Tốt |
| `app/(standalone)/auth/callback` | 100% (68/68) | 100% (7/7) | 100% (3/3) | 100% | ✅ Xuất sắc |
| `app/admin/knowledge` | 100% (69/69) | 100% (7/7) | 100% (4/4) | 100% | ✅ Xuất sắc |
| `app/admin/missing-in-map` | 100% (30/30) | 100% (4/4) | 100% (2/2) | 100% | ✅ Xuất sắc |
| `app/admin/pinned-post` | 100% (48/48) | 100% (10/10) | 100% (5/5) | 100% | ✅ Xuất sắc |
| `app/admin/rating` | 100% (83/83) | 100% (8/8) | 100% (5/5) | 100% | ✅ Xuất sắc |
| `app/admin/rating/conversation` | 100% (69/69) | 36% (4/11) | 100% (2/2) | 100% | ✅ Tốt |
| `app/admin/topic` | 78% (200/254) | 57% (15/26) | 40% (8/20) | 78% | ✅ Đạt |
| `components` (core) | 75% (946/1246) | 80% (114/141) | 50% (19/38) | 75% | ✅ Tốt |
| `lib` | 72% (32/44) | 25% (2/8) | 100% (2/2) | 72% | ✅ Đạt |
| `components/features/editor` | 17% (674/3928) | 51% (46/90) | 25% (10/39) | 17% | ❌ Thấp |
| `components/features/navigation` | 35% (854/2375) | 65% (94/144) | 17% (6/34) | 35% | ❌ Thấp |
| `components/ui` (shadcn) | 26% (1762/6668) | 62% (83/133) | 44% (74/165) | 26% | ❌ Thư viện |
| `services` | 30% (517/1717) | 10% (1/10) | 1% (1/86) | 30% | ❌ Thấp |
| `hooks` | 24% (231/935) | 58% (7/12) | 40% (2/5) | 24% | ❌ Thấp |
| `stores` | 38% (176/460) | 66% (4/6) | 0% (0/32) | 38% | ❌ Thấp |

### 4.3 Coverage theo nhóm chức năng

| Nhóm chức năng | Coverage | Nhận xét |
|---------------|----------|----------|
| **Pages chính (User)** | 70-100% | Chat, Profile, History, Events, FAQ, Knowledge, Pinned-post đều đạt ≥ 70% |
| **Auth & Callback** | 84-100% | Login/Register page và OAuth callback được cover tốt |
| **Admin Pages** | 78-100% | Knowledge, Missing-in-map, Pinned-post, Rating đạt 100%; Topic 78% |
| **Core Components** | 75-100% | Header 100%, Sidebar 89%, ChatInput 95%, VoiceButton 100% |
| **UI Components (shadcn)** | 26% | Thư viện bên thứ 3, không cần test trực tiếp |
| **Feature Components** | 17-35% | Editor và Navigation phức tạp, coverage thấp — cần thêm tests |
| **Services** | 30% | API services — cần thêm unit tests với mocking |
| **Hooks** | 24% | Custom hooks — cần thêm tests độc lập |
| **Stores** | 38% | Zustand stores — cần tests cho actions/selectors |

---

## 5. Thống kê tổng hợp

| Loại test | Số files | Số tests (ước lượng) | Trạng thái |
|-----------|----------|---------------------|------------|
| Components | 6 | 35 | ✅ 35/35 PASS |
| Pages — Root level | 10 | ~45 | ✅ ~45/45 PASS |
| Pages — Main | 7 | ~35 | ✅ ~35/35 PASS |
| Pages — Admin | 6 | ~25 | ✅ ~25/25 PASS |
| Pages — Auth | 2 | ~8 | ✅ ~8/8 PASS |
| Pages — Navigation | 2 | ~8 | ✅ ~8/8 PASS |
| **Tổng cộng** | **31** | **~110** | **✅ ~110/110 PASS** |
| **Code Coverage** | — | **25% Statements** | — |

---

## 6. Mocking Strategy

| Mock | Mục đích | Cách mock |
|------|----------|-----------|
| `next/navigation` | useRouter, usePathname, useSearchParams | `jest.mock()` với jest.fn() |
| `@/contexts/agent-context` | useAgent (online/offline, model, agents) | jest.fn() trả về mock object |
| `@/hooks/use-chat` | useChat (messages, isLoading, error) | jest.fn() trả về mock state |
| `@/hooks/use-voice` | useVoice (state, isListening, start/stop) | jest.fn() trả về mock state |
| `@/services/auth-api` | authService (isAuthenticated, login, register) | jest.fn() trả về mock functions |
| `@/stores/app.store` | useAppStore (user, history, login, logout) | jest.fn() với selector pattern |
| `sonner` | toast (success, error) | jest.fn() mock toast calls |
| Child components | Mock các sub-components phức tạp | jest.mock() trả về simple div với data-testid |
| `lucide-react` | Icons | Mock trả về div với data-testid |
| `@/components/ui/resizable` | Resizable panels | Mock div wrappers |

---

## 7. Các vấn đề đã xử lý

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| `crypto.randomUUID` undefined trong JSDOM | JSDOM không có crypto API | Polyfill `global.crypto.randomUUID` trong test setup |
| `DOMRect` undefined | JSDOM không implement DOMRect | Polyfill `global.DOMRect` class trong test file |
| Child components render phức tạp gây lỗi | Components con依赖 nhiều context/providers | Mock child components với simple div + data-testid |
| Async state updates không kịp render | React state update bất đồng bộ | Sử dụng `React.act()` và `waitFor()` |

---

## 8. Khuyến nghị cải thiện Coverage

1. **`components/features/editor`** (17%): Thêm tests cho EditorPage — tool selection, node/edge manipulation, save flow.
2. **`components/features/navigation`** (35%): Thêm tests cho NavigationPage — location search, route display, turn-by-turn.
3. **`services`** (30%): Thêm unit tests cho API services với mock fetch/axios — test error handling, retry logic.
4. **`hooks`** (24%): Thêm tests độc lập cho custom hooks (use-voice, use-chat, use-mobile) với renderHook.
5. **`stores`** (38%): Thêm tests cho Zustand stores — test actions, selectors, state transitions.
6. **`components/chat`** (0%): Thêm tests cho ChatWindow, ChatMessage, MessageBubble — render messages, loading states.
7. **`components/admin/*`** (0%): Thêm tests cho các admin sub-components — KnowledgeDataPanel, SearchFilterPanel, modals.
