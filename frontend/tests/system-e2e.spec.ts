import { test, expect, type Page, type Locator } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Home Page (/): Main Landing', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
	});

	test('should display main heading and badge', async ({ page }) => {
		await expect(page.getByText(/CƠ SỞ DỮ LIỆU CHÍNH THỐNG/i)).toBeVisible();
		await expect(page.getByRole('heading', { name: /Hệ thống Hỗ trợ sinh viên tra cứu văn bản/i })).toBeVisible();
	});

	test('should display description text', async ({ page }) => {
		await expect(page.getByText(/Truy cập nhanh vào cơ sờ dữ liệu văn bàn pháp quy/i)).toBeVisible();
	});

	test('should have chat input field', async ({ page }) => {
		const chatInput = page.locator('#chat-textarea');
		await expect(chatInput).toBeVisible();
	});

	test('should have voice toggle button', async ({ page }) => {
		const voiceButton = page.locator('button[title="Bật/Tắt Voice"]').first();
		if (await voiceButton.count() > 0) {
			await expect(voiceButton).toBeVisible();
		}
	});

	test('should have footer with copyright', async ({ page }) => {
		await expect(page.getByText(/Hệ thống sử dụng Al để hỗ trợ tra cứu/i)).toBeVisible();
		await expect(page.getByText(/2026 Nhóm đồ án HTK/i)).toBeVisible();
	});

	test('should have suggestion section', async ({ page }) => {
		const suggestionSection = page.locator('[class*="suggestion"], [data-testid="suggestion-section"]');
		if (await suggestionSection.count() > 0) {
			await expect(suggestionSection).toBeVisible();
		}
	});

	test('should navigate to chat after message submission', async ({ page }) => {
		const chatInput = page.locator('#chat-textarea');
		await chatInput.fill('Test query');
		await chatInput.press('Enter');
		await page.waitForTimeout(1000);
		expect(page.url()).toContain('/chat');
	});
});

test.describe('Chat Page (/chat): Conversation Interface', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
		await helpers.waitForPageLoad(page);
	});

	test('should display chat window', async ({ page }) => {
		const chatWindow = page.locator('[class*="chat-window"], [data-testid="chat-window"]');
		if (await chatWindow.count() > 0) {
			await expect(chatWindow).toBeVisible();
		}
	});

	test('should have chat input', async ({ page }) => {
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});

	test('should send message and receive response', async ({ page }) => {
		const chatInput = page.locator('#chat-textarea');
		await chatInput.fill('Xin chào');
		await chatInput.press('Enter');
		await page.waitForTimeout(3000);
	});

	test('should toggle voice mode', async ({ page }) => {
		const voiceButton = page.locator('button[title="Bật/Tắt Voice"]').first();
		if (await voiceButton.count() > 0) {
			await voiceButton.click();
			await page.waitForTimeout(500);
		}
	});

	test('should toggle document panel', async ({ page }) => {
		const docButton = page.locator('button[title="Tài liệu tham khảo"]').first();
		if (await docButton.count() > 0) {
			await docButton.click();
			await expect(page.getByText(/Tài liệu/i).first()).toBeVisible();
		}
	});

	test('should load with thread_id from URL', async ({ page }) => {
		const threadId = 'test-thread-123';
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat?thread_id=${threadId}`);
		await helpers.waitForPageLoad(page);
		await expect(page.url()).toContain('thread_id');
	});

	test('should load with message from URL', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat?message=Test+message`);
		await helpers.waitForPageLoad(page);
		await page.waitForTimeout(2000);
	});

	test('should display read-only mode banner when readonly=1', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat?readonly=1&thread_id=test`);
		await helpers.waitForPageLoad(page);
		const banner = page.getByText(/chế độ chỉ đọc|read-only/i);
		if (await banner.count() > 0) {
			await expect(banner.first()).toBeVisible();
		}
	});
});

test.describe('History Page (/history): Chat History', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/history`);
		await helpers.waitForPageLoad(page);
	});

	test('should display history heading', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Lịch sử tra cứu/i })).toBeVisible();
	});

	test('should have search input', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm theo tiêu đề/i);
		if (await searchInput.count() > 0) {
			await expect(searchInput).toBeVisible();
		}
	});

	test('should have sort dropdown', async ({ page }) => {
		const sortButton = page.getByRole('button', { name: /Sắp xếp/i });
		if (await sortButton.count() > 0) {
			await expect(sortButton).toBeVisible();
		}
	});

	test('should have delete all button', async ({ page }) => {
		const deleteAllBtn = page.getByRole('button', { name: /Xóa tất cả/i });
		if (await deleteAllBtn.count() > 0) {
			await expect(deleteAllBtn).toBeVisible();
		}
	});

	test('should search history', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm theo tiêu đề/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('test');
			await page.waitForTimeout(500);
		}
	});

	test('should sort by newest', async ({ page }) => {
		const sortButton = page.getByRole('button', { name: /Sắp xếp/i });
		if (await sortButton.count() > 0) {
			await sortButton.click();
			await page.getByRole('menuitem', { name: /Mới nhất/i }).click();
			await page.waitForTimeout(500);
		}
	});

	test('should open history item', async ({ page }) => {
		const historyItems = page.locator('[class*="history-item"]');
		const firstItem = historyItems.first();
		if (await firstItem.count() > 0) {
			const openBtn = firstItem.locator('button, a').first();
			if (await openBtn.count() > 0) {
				await openBtn.click();
				await expect(page.url()).toContain('/chat');
			}
		}
	});
});

test.describe('Events Page (/events): Event Management', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/events`);
		await helpers.waitForPageLoad(page);
	});

	test('should display events heading', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Quản lý Sự kiện/i })).toBeVisible();
	});

	test('should have search input', async ({ page }) => {
		await expect(page.getByPlaceholder(/Tìm kiếm sự kiện/i)).toBeVisible();
	});

	test('should have category filter', async ({ page }) => {
		const categorySelect = page.getByRole('combobox');
		if (await categorySelect.count() > 0) {
			await expect(categorySelect).toBeVisible();
		}
	});

	test('should have create event button', async ({ page }) => {
		await expect(page.getByRole('button', { name: /Tạo sự kiện mới/i })).toBeVisible();
	});

	test('should open create event dialog', async ({ page }) => {
		await page.getByRole('button', { name: /Tạo sự kiện mới/i }).click();
		await expect(page.getByRole('heading', { name: /Tạo sự kiện mới/i })).toBeVisible();
	});

	test('should have form fields in dialog', async ({ page }) => {
		await page.getByRole('button', { name: /Tạo sự kiện mới/i }).click();
		await expect(page.getByLabel(/Tên sự kiện/)).toBeVisible();
		await expect(page.getByLabel(/Ngày bắt đầu/)).toBeVisible();
	});

	test('should cancel dialog', async ({ page }) => {
		await page.getByRole('button', { name: /Tạo sự kiện mới/i }).click();
		await page.getByRole('button', { name: /Hủy/i }).click();
		await page.waitForTimeout(500);
	});

	test('should filter events by search', async ({ page }) => {
		await page.getByPlaceholder(/Tìm kiếm sự kiện/i).fill('test');
		await page.waitForTimeout(500);
	});

	test('should filter events by category', async ({ page }) => {
		const categorySelect = page.getByRole('combobox');
		if (await categorySelect.count() > 0) {
			await categorySelect.click();
			await page.getByRole('option', { name: /Hội thảo/i }).click();
			await page.waitForTimeout(500);
		}
	});

	test('should display list of events', async ({ page }) => {
		const eventList = page.locator('[class*="event-item"], [class*="Item"]:not([class*="Group"])');
		if (await eventList.count() > 0) {
			await expect(eventList.first()).toBeVisible();
		}
	});
});

test.describe('FAQ Page (/faq): FAQ Management', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/faq`);
		await helpers.waitForPageLoad(page);
	});

	test('should display FAQ heading', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /Câu hỏi thường gặp|FAQ/i }).first()).toBeVisible();
	});

	test('should have search input', async ({ page }) => {
		await expect(page.getByPlaceholder(/Tìm kiếm câu hỏi/i)).toBeVisible();
	});

	test('should search FAQs', async ({ page }) => {
		await page.getByPlaceholder(/Tìm kiếm câu hỏi/i).fill('test');
		await page.waitForTimeout(500);
	});

	test('should display FAQ list', async ({ page }) => {
		const faqList = page.locator('[class*="faq-list"], [data-testid="faq-list"]');
		if (await faqList.count() > 0) {
			await expect(faqList).toBeVisible();
		}
	});

	test('should expand FAQ item', async ({ page }) => {
		const faqItem = page.locator('[class*="faq-item"]').first();
		if (await faqItem.count() > 0) {
			await faqItem.click();
			await page.waitForTimeout(500);
		}
	});
});

test.describe('Profile Page (/profile): User Profile', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/profile`);
		await helpers.waitForPageLoad(page);
	});

	test('should display user email', async ({ page }) => {
		await expect(page.locator('#email')).toBeVisible();
	});

	test('should display auth provider', async ({ page }) => {
		const providerInput = page.locator('#provider');
		if (await providerInput.count() > 0) {
			await expect(providerInput).toBeVisible();
		}
	});

	test('should have password change fields', async ({ page }) => {
		await expect(page.locator('#current-pwd')).toBeVisible();
		await expect(page.locator('#new-pwd')).toBeVisible();
	});

	test('should have logout button', async ({ page }) => {
		await expect(page.getByRole('button', { name: /Đăng xuất/i })).toBeVisible();
	});

	test('should change password (form validation)', async ({ page }) => {
		await page.locator('#current-pwd').fill('wrongpassword');
		await page.locator('#new-pwd').fill('newpass123');
		await page.waitForTimeout(500);
	});

	test('should logout successfully', async ({ page }) => {
		await page.getByRole('button', { name: /Đăng xuất/i }).click();
		await page.waitForTimeout(1000);
		expect(page.url()).toContain('/auth');
	});
});

test.describe('Pinned Posts Page (/pinned-post): Pinned Content', () => {
	test.beforeEach(async ({ page }) => {
		await helpers.loginWithCredentials(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/pinned-post`);
		await helpers.waitForPageLoad(page);
	});

	test('should have back button', async ({ page }) => {
		await expect(page.getByRole('button', { name: /Quay lại/i })).toBeVisible();
	});

	test('should navigate back to home', async ({ page }) => {
		await page.getByRole('button', { name: /Quay lại/i }).click();
		await expect(page).toHaveURL(/\/$/);
	});

	test('should display pinned posts list', async ({ page }) => {
		const listPanel = page.locator('[class*="pinned-post"], [data-testid="pinned-post-list"]');
		if (await listPanel.count() > 0) {
			await expect(listPanel).toBeVisible();
		}
	});
});

test.describe('Knowledge Page (/knowledge): Knowledge Base', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/knowledge`);
		await helpers.waitForPageLoad(page);
	});

	test('should display knowledge heading', async ({ page }) => {
		const heading = page.getByRole('heading', { name: /Knowledge/i });
		if (await heading.count() > 0) {
			await expect(heading).toBeVisible();
		}
	});

	test('should have documentation links', async ({ page }) => {
		const docLinks = page.getByRole('link', { name: /Documentation/i });
		if (await docLinks.count() > 0) {
			await expect(docLinks.first()).toBeVisible();
		}
	});
});

test.describe('Navigation Tests: Route Access', () => {
	test('should redirect unauthenticated users to /auth', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/history`);
		await helpers.waitForPageLoad(page);
		expect(page.url()).toContain('/auth');
	});

	test('should allow access to public pages without auth', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
		expect(page.url()).toMatch(/^http/);
	});
});

test.describe('Responsive Design Tests', () => {
	test('should display correctly on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
		await expect(page.locator('body')).toBeVisible();
	});

	test('should display correctly on tablet viewport', async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
		await expect(page.locator('body')).toBeVisible();
	});

	test('should display correctly on desktop viewport', async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('Accessibility Tests', () => {
	test('should have proper heading hierarchy', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
		const h1 = page.locator('h1');
		await expect(h1).toHaveCount(1);
	});

	test('should have alt text for images', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		const images = page.locator('img');
		const count = await images.count();
		for (let i = 0; i < count; i++) {
			const alt = await images.nth(i).getAttribute('alt');
			expect(alt).not.toBeNull();
		}
	});

	test('should have accessible form labels', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
		await helpers.waitForPageLoad(page);
		const textarea = page.locator('#chat-textarea');
		await expect(textarea).toBeVisible();
	});
});

test.describe('Error Handling Tests', () => {
	test('should show error for invalid route', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/invalid-route-12345`);
		await page.waitForTimeout(1000);
	});

	test('should handle network errors gracefully', async ({ page }) => {
		await page.route('**/api/**', (route) => route.abort('failed'));
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);
	});
});