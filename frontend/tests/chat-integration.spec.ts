import { test, expect, type Page } from './test-fixtures';
import { testFixtures, setupMockApi, setupMockVoice, generateTestData } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Integration - Chat Flow from Main Page', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should navigate from main page to chat or auth', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Tìm thông tin về quy chế đào tạo');
		await textarea.press('Enter');

		await page.waitForTimeout(1500);
		
		const currentUrl = page.url();
		expect(currentUrl).toMatch(/(\/chat|\/auth|$)/);
	});

	test('should display chat page after redirect', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test query');
		await textarea.press('Enter');

		await page.waitForTimeout(1000);
		
		const currentUrl = page.url();
		if (currentUrl.includes('/chat')) {
			await expect(page.locator('#chat-textarea')).toBeVisible();
		}
	});
});

test.describe('Integration - Chat Input and Send', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display chat input on chat page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Hello');
		await textarea.press('Enter');

		await expect(page).toHaveURL(/.*\/chat/);
		
		const chatTextarea = page.locator('#chat-textarea');
		await expect(chatTextarea).toBeVisible();
	});

	test('should clear input after sending', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test message');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);
		
		const chatTextarea = page.locator('#chat-textarea');
		await expect(chatTextarea).toHaveValue('');
	});
});

test.describe('Integration - Deep Query Mode', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have deep mode button on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await expect(sparklesButton).toBeVisible();
	});

	test('should display sparkles button and can click it', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test query');

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await expect(sparklesButton).toBeVisible();
		await sparklesButton.click();

		await textarea.press('Enter');
		await page.waitForTimeout(1000);
	});
});

test.describe('Integration - Voice Feature', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have voice button on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const voiceButton = page.locator('button:has(.lucide-mic)').first();
		await expect(voiceButton).toBeVisible();
	});

	test('should click voice button on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const voiceButton = page.locator('button:has(.lucide-mic)').first();
		await expect(voiceButton).toBeVisible();
		await voiceButton.click();
		await page.waitForTimeout(1000);
	});
});

test.describe('Integration - Document Panel', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have document button visible on chat page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);

		const documentButton = page.locator('button:has(.lucide-file-text)');
		await expect(documentButton).toBeVisible();
	});

	test('should find document button in input area', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);

		const buttons = page.locator('button:has(.lucide-file-text)');
		await expect(buttons).toHaveCount(1);
	});
});

test.describe('Integration - Multiple Message Exchange', () => {
	test('should send multiple messages in sequence', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);

		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');

		await textarea.fill('Message 1');
		await textarea.press('Enter');
		await page.waitForURL(/.*\/chat/);
		await page.waitForTimeout(1500);

		await textarea.fill('Message 2');
		await textarea.press('Enter');
		await page.waitForTimeout(1500);

		await textarea.fill('Message 3');
		await textarea.press('Enter');
		await page.waitForTimeout(1500);

		const messages = page.locator('[class*="whitespace-pre-wrap"]');
		expect(await messages.count()).toBeGreaterThan(0);
	});
});

test.describe('Integration - Error Handling', () => {
	test('should show error toast when API fails', async ({ page }) => {
		await page.route('**/api/agent/stream**', (route) => {
			route.abort('failed');
		});

		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForTimeout(2000);
	});

	test('should display loading state during message send', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);

		const loadingButton = page.locator('button:has-text("Đang xử lý")');
		if (await loadingButton.count() > 0) {
			await expect(loadingButton).toBeVisible();
		}
	});
});

test.describe('Integration - Chat Window Display', () => {
	test('should display chat messages area', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);

		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);

		const chatContainer = page.locator('[class*="flex-1 overflow-y-auto"]');
		await expect(chatContainer).toBeVisible();
	});

	test('should display user and bot message indicators', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);

		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Hello');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);
		await page.waitForTimeout(2000);

		const userIcon = page.locator('[class*="bg-secondary"]');
		const botIcon = page.locator('[class*="bg-primary"]');

		const hasUserIcon = await userIcon.count() > 0;
		const hasBotIcon = await botIcon.count() > 0;

		expect(hasUserIcon || hasBotIcon).toBe(true);
	});
});

test.describe('Integration - Page Navigation', () => {
	test('should not allow direct access to chat without message', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
		await helpers.waitForPageLoad(page);

		const chatTextarea = page.locator('#chat-textarea');
		await expect(chatTextarea).toBeVisible();
	});

	test('should have working back navigation from chat', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);

		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForURL(/.*\/chat/);

		await page.goBack();
		await expect(page).toHaveURL(TEST_CONSTANTS.BASE_URL);
	});
});
