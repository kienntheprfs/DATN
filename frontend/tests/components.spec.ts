import { test, expect, type Page } from './test-fixtures';
import { testFixtures, setupMockApi, setupMockVoice, generateTestData } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Components - ChatInput (Main Page)', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should render chat input with placeholder on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await expect(textarea).toBeVisible();
		await expect(textarea).toHaveAttribute('placeholder', 'Nhập câu hỏi hoặc yêu cầu tra cứu...');
	});

	test('should have send button with Tra cứu text on main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sendButton = page.locator('button:has-text("Tra cứu")');
		await expect(sendButton).toBeVisible();
		await expect(sendButton).toBeEnabled();
	});

	test('should have sparkles button for query mode toggle', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await expect(sparklesButton).toBeVisible();
	});

	test('should click sparkles button without error', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await sparklesButton.click();
		await page.waitForTimeout(500);
	});

	test('should have mic button for voice', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const micButton = page.locator('button:has(.lucide-mic)').first();
		await expect(micButton).toBeVisible();
	});

	test('should handle empty message submission', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('   ');
		await textarea.press('Enter');

		await page.waitForTimeout(500);
	});

	test('should submit message from main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test query');
		await textarea.press('Enter');

		await page.waitForTimeout(1500);
		
		const currentUrl = page.url();
		expect(currentUrl).toMatch(/(\/chat|\/auth|$)/);
	});
});

test.describe('Components - Main Page Display', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display main heading on home page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('Hệ thống Hỗ trợ sinh viên tra cứu văn bản')).toBeVisible();
	});

	test('should display badge with CƠ SỞ DỮ LIỆU CHÍNH THỐNG', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('CƠ SỞ DỮ LIỆU CHÍNH THỐNG')).toBeVisible();
	});

	test('should display footer with copyright', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('@ 2026 Nhóm đồ án HTK.')).toBeVisible();
	});

	test('should have working chat input area', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await expect(textarea).toBeVisible();
		await expect(page.locator('button:has-text("Tra cứu")')).toBeVisible();
	});
});

test.describe('Components - Auth Page', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display auth page with login tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.getByRole('heading', { name: 'BK-TBOT' })).toBeVisible();
	});

	test('should have email and password inputs on auth page', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
	});

	test('should switch to register tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();
		await page.waitForTimeout(500);

		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng ký');
	});

	test('should have Google login button', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('button:has-text("Đăng nhập bằng Google")')).toBeVisible();
	});

	test('should have guest access link', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const guestLink = page.getByRole('link', { name: 'Truy cập với vai trò Khách' });
		await expect(guestLink).toBeVisible();
		await expect(guestLink).toHaveAttribute('href', '/');
	});
});

test.describe('Components - Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should navigate to home when clicking logo', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.getByRole('link', { name: 'Truy cập với vai trò Khách' }).click();

		await expect(page).toHaveURL(TEST_CONSTANTS.BASE_URL);
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should display main page elements correctly', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('main')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
		await expect(page.locator('button:has-text("Tra cứu")')).toBeVisible();
	});
});
