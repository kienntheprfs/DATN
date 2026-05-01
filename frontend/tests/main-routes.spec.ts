import { test, expect } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Main Application Routes (Real Data & API)', () => {
	// Đăng nhập trước mỗi bài test để vào được các trang yêu cầu quyền (nếu có)
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
	});

	test('should display and interact with Chat page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra form nhập chat
		const chatTextarea = page.locator('#chat-textarea');
		await expect(chatTextarea).toBeVisible();

		// Thử gõ một dòng text vào textarea
		await chatTextarea.fill('Xin chào, bạn có thể giúp tôi không?');
		
		// Nút Voice
		const voiceButton = page.locator('button[title="Bật/Tắt Voice"]').first();
		if (await voiceButton.count() > 0) {
			await expect(voiceButton).toBeVisible();
		}

		// Nút Document Panel (trích xuất tài liệu)
		const docButton = page.locator('button[title="Tài liệu tham khảo"]').first();
		if (await docButton.count() > 0) {
			await expect(docButton).toBeVisible();
			await docButton.click();
			// Chờ xem có load lên Document Panel không (thường panel nằm ở bên phải/dưới)
			await expect(page.getByText(/Tài liệu/i).first()).toBeVisible();
		}
	});

	test('should display and interact with Events page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/events`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề chính
		await expect(page.getByRole('heading', { name: /Lịch sử tra cứu/i })).toBeVisible();

		// Kiểm tra ô tìm kiếm sự kiện
		const searchInput = page.getByPlaceholder(/Tìm kiếm sự kiện/i);
		await expect(searchInput).toBeVisible();
		await searchInput.fill('Hội thảo khoa học');

		// Kiểm tra Dropdown chọn thể loại
		const categorySelect = page.getByRole('combobox');
		if (await categorySelect.count() > 0) {
			await expect(categorySelect).toBeVisible();
		}

		// Nhấn nút Tạo sự kiện mới
		const createBtn = page.getByRole('button', { name: /Tạo sự kiện mới/i });
		await expect(createBtn).toBeVisible();
		await createBtn.click();

		// Xác nhận dialog (form) mở lên
		const dialogTitle = page.getByRole('heading', { name: /Tạo sự kiện mới/i });
		await expect(dialogTitle).toBeVisible();

		// Tắt dialog
		const cancelBtn = page.getByRole('button', { name: /Hủy/i });
		await cancelBtn.click();
	});

	test('should display FAQ page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/faq`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề FAQ
		await expect(page.getByRole('heading', { name: /Câu hỏi thường gặp|FAQ/i }).first()).toBeVisible();

		// Kiểm tra ô tìm kiếm FAQ
		const searchInput = page.getByPlaceholder(/Tìm kiếm/i).first();
		if (await searchInput.count() > 0) {
			await expect(searchInput).toBeVisible();
		}
	});

	test('should display Knowledge page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/knowledge`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề trang kiến thức
		await expect(page.getByRole('heading', { name: /Quản lý cơ sở tri thức|Knowledge/i }).first()).toBeVisible();

		// Kiểm tra xem có nút thêm tài liệu / Upload không
		const uploadBtn = page.getByRole('button', { name: /Tải lên|Thêm|Upload/i }).first();
		if (await uploadBtn.count() > 0) {
			await expect(uploadBtn).toBeVisible();
		}
	});

	test('should display Pinned Posts page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/pinned-post`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề
		await expect(page.getByRole('heading', { name: /Thông tin phổ biến được cập nhật thường xuyên/i })).toBeVisible();

		// Nút tạo bài viết ghim mới
		const createPostBtn = page.getByRole('button', { name: /Tạo mới|Thêm/i }).first();
		if (await createPostBtn.count() > 0) {
			await expect(createPostBtn).toBeVisible();
		}
	});

	test('should display History page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/history`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề lịch sử chat
		await expect(page.getByRole('heading', { name: /Lịch sử đoạn chat|History/i }).first()).toBeVisible();

		// Ô tìm kiếm lịch sử
		const searchInput = page.getByPlaceholder(/Tìm kiếm/i).first();
		if (await searchInput.count() > 0) {
			await expect(searchInput).toBeVisible();
		}
	});

	test('should display Profile page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/profile`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra tiêu đề trang cá nhân
		await expect(page.getByText(/Thông tin liên hệ/i)).toBeVisible();

		// Form cập nhật thông tin cá nhân
		const nameInput = page.locator('input[name="name"], input[name="fullName"], #name').first();
		if (await nameInput.count() > 0) {
			await expect(nameInput).toBeVisible();
		}
	});
});
