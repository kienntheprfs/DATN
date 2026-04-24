import { test, expect, type Page } from './test-fixtures';
import { testFixtures, setupMockApi, setupMockVoice, generateTestData } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('E2E - Main Page', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display main page with correct content', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('Hệ thống Hỗ trợ sinh viên tra cứu văn bản')).toBeVisible();
		await expect(page.getByText('CƠ SỞ DỮ LIỆU CHÍNH THỐNG')).toBeVisible();
		await expect(page.getByText(/Truy cập nhanh/)).toBeVisible();
	});

	test('should display footer with copyright', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('@ 2026 Nhóm đồ án HTK.')).toBeVisible();
		await expect(page.getByText('Hệ thống sử dụng Al để hỗ trợ tra cứu')).toBeVisible();
	});

	test('should have working chat input', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await expect(textarea).toBeVisible();
		await textarea.fill('Test query');
		await textarea.press('Enter');

		await expect(page).toHaveURL(/.*\/chat/);
	});

	test('should navigate to chat page with thread id', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill(generateTestData.randomQuery());
		await textarea.press('Enter');

		await expect(page).toHaveURL(/thread_id=/);
	});

	test('should display sparkles button for query mode', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await expect(sparklesButton).toBeVisible();
	});

	test('should have voice button visible on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const voiceButton = page.locator('button:has(.lucide-mic)').first();
		await expect(voiceButton).toBeVisible();
	});
});

test.describe('E2E - Responsive Design', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display correctly on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});

	test('should display correctly on tablet viewport', async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});

	test('should display correctly on desktop viewport', async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});
});

test.describe('E2E - Error Handling', () => {
	test('should handle API errors gracefully', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('access_token', 'mock-token');
		});
		
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('body')).toBeVisible();
	});
});
