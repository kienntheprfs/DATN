# Test Strategy - Frontend (Next.js)

## 1. Overview

| Item | Description |
|------|------------|
| Project | Frontend - Next.js Web Application |
| Test Framework | Playwright |
| Test Type | E2E (End-to-End), Integration, Accessibility |
| Base URL | http://localhost:3000 |

## 2. Test Scope

### 2.1 Authentication (AU)
- Login form validation
- Register form validation  
- OAuth Google integration
- Guest access
- Protected routes
- Password visibility toggle

### 2.2 Chat Integration (CI)
- Chat flow from main page
- Chat input and send
- Deep query mode
- Message display behavior

### 2.3 Voice Chat (VC)
- Voice button functionality
- Voice page loading
- Audio streaming

### 2.4 Navigation (NV)
- Main page routes
- Page redirections
- URL parameters

### 2.5 Components (CP)
- UI component rendering
- Component interactions
- Chat message bubbles

### 2.6 Accessibility (AX)
- Keyboard navigation
- Screen reader compatibility
- ARIA labels

## 3. Test Environment Setup

```bash
# Install dependencies
npm install

# Run tests
npx playwright test

# Run with UI
npx playwright test --ui

# Generate report
npx playwright show-report
```

## 4. Test Configuration

- **Browser**: Chromium (default), Firefox, WebKit
- **Viewport**: 1920x1080 (desktop), 375x667 (mobile)
- **Timeouts**: 30s max wait, 10s navigation timeout
- **Retries**: 2 for CI failures

---

## Test Cases

### AU - Authentication

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| AU-001 | Hiển thị trang login | Truy cập /auth | Hiển thị heading "BK-TBOT" | Passed |
| AU-002 | Hiển thị 3 nút hành động | Form login | 3 nút: Đăng nhập, Google, Khách | Passed |
| AU-003 | Hiển thị input email/password | Form login | 2 trường INPUT hiển thị | Passed |
| AU-004 | Toggle hiện/ẩn mật khẩu | Nhập password + click toggle | Input type = text | Passed |
| AU-005 | Link "Quên mật khẩu?" | Form login | Link visible | Passed |
| AU-006 | Validate email rỗng | Bỏ trống email + submit | Báo lỗi validation | Passed |
| AU-007 | Validate password rỗng | Email có, password trống + submit | Báo lỗi validation | Passed |
| AU-008 | Chuyển sang tab Đăng ký | Click nút "Đăng ký" | Form đổi sang Đăng ký | Passed |
| AU-009 | Hiển thị field bổ sung | Tab Đăng ký | Hiển thị fullname, confirmPassword | Passed |
| AU-010 | Validate fullname rỗng | Tab Đăng ký, bỏ fullname + submit | Báo "Vui lòng nhập họ tên" | Passed |
| AU-011 | Validate password không khớp | Tab Đ�, password khác confirmPassword | Báo "Mật khẩu xác nhận không khớp" | Passed |
| AU-012 | Nút Google login có icon | Button "Đăng nhập bằng Google" | Có SVG icon | Passed |
| AU-013 | Nút Google register | Tab Đăng ký | Hiển thị nút Google | Passed |
| AU-014 | Truy cập Khách | Click "Truy cập với vai trò Khách" | Chuyển về trang chủ | Passed |
| AU-015 | Chuyển hướng khi chưa login | Truy cập /history | Redirect về /auth | Passed |
| AU-016 | Chuyển hướng profile | Truy cập /profile | Redirect về /auth | Passed |
| AU-017 | Hiển thị logo | Trang login | Icon GraduationCap hiển thị | Passed |
| AU-018 | Chuyển tab Đăng nhập/Đăng ký | Click tab | Tab active đổi | Passed |
| AU-019 | Footer copyright | Trang login | Text "© 2026 BK-TBOT" | Passed |

### CI - Chat Integration

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| CI-001 | Điều hướng từ main sang chat | Nhập message + Enter | URL /chat hoặc /auth | Passed |
| CI-002 | Hiển thị chat textarea | Sau khi redirect | Textarea visible | Passed |
| CI-003 | Clear input sau khi gửi | Gửi message | Input value = "" | Passed |
| CI-004 | Deep query mode button | Click Deep button | URL có query_mode=deep | Passed |
| CI-005 | Redirect khi gửi từ main | Gửi "Tìm thông tin quy chế" | URL có message param | Passed |

### VC - Voice Chat

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| VC-001 | Nút voice chuyển sang /chat | Click voice button | URL /chat?voice=true | Passed |
| VC-002 | Voice page hiển thị | Truy cập /chat?voice=true | Trang voice load | Passed |
| VC-003 | Voice state toggle | Click toggle | Voice state thay đổi | Passed |

### NV - Navigation

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| NV-001 | Main page load | Truy cập / | Trang chủ hiển thị | Passed |
| NV-002 | URL parameters preserve | /chat?voice=true | Params được giữ | Passed |
| NV-003 | Redirect về auth khi protected | Truy cập /admin | Redirect /auth | Passed |

### CP - Components

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| CP-001 | Chat message bubble | Gửi message | Bubble hiển thị | Passed |
| CP-002 | Component state update | Tương tác | State thay đổi | Passed |

### AX - Accessibility

| ID | Test Name | Test Data | Expected Result | Status |
|----|-----------|----------|----------------|--------|
| AX-001 | Keyboard navigation | Tab key | Focus di chuyển | Passed |
| AX-002 | ARIA labels present | Elements | Có aria-* attributes | Passed |
| AX-003 | Focus visible | Click interactive | Focus ring visible | Passed |

---

## 5. Test Fixtures

```typescript
// test-fixtures.ts
export const testFixtures = Page => ({ ... })
export const setupMockApi = async (page) => { ... }
export const setupMockVoice = async (page) => { ... }
export const generateTestData = () => { ... }
```

## 6. Running Tests

```bash
# All tests
npm run test:e2e

# Specific file
npx playwright test tests/auth.spec.ts

# Specific tag
npx playwright test --grep "@auth"

# CI mode
CI=true npx playwright test
```