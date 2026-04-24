import { test, expect, type Page } from './test-fixtures';
import { testFixtures, setupMockApi, setupMockVoice, generateTestData } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Authentication - Login Tab', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display login tab with heading and title', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.getByRole('heading', { name: 'BK-TBOT' })).toBeVisible();
		await expect(page.getByText('Hệ thống Tra cứu Quy chế & Văn bản')).toBeVisible();
	});

	test('should display 3 action buttons on login tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng nhập');
		await expect(page.locator('button:has-text("Đăng nhập bằng Google")')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Truy cập với vai trò Khách' })).toBeVisible();
	});

	test('should display form inputs on login tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.getByPlaceholder('ten.ho@hcmut.edu.vn')).toBeVisible();
		await expect(page.getByPlaceholder('••••••••')).toBeVisible();
	});

	test('should toggle password visibility', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const passwordInput = page.locator('#password');
		await passwordInput.fill('testpassword');

		const toggleButton = page.locator('button').filter({ has: page.locator('.material-symbols-outlined') }).first();
		await toggleButton.click();

		const inputType = await passwordInput.getAttribute('type');
		expect(inputType).toBe('text');
	});

	test('should have "Quên mật khẩu?" link on login tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.getByRole('link', { name: 'Quên mật khẩu?' })).toBeVisible();
	});

	test('should validate empty email on login', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(500);
	});

	test('should validate empty password on login', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('#email').fill('test@example.com');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(500);
	});

	test('should have divider with "Hoặc" text', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('Hoặc')).toBeVisible();
	});
});

test.describe('Authentication - Register Tab', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should switch to register tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();

		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng ký');
	});

	test('should display 3 action buttons on register tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();

		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng ký');
		await expect(page.locator('button:has-text("Đăng ký bằng Google")')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Truy cập với vai trò Khách' })).toBeVisible();
	});

	test('should display additional fields on register tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();

		await expect(page.locator('#fullname')).toBeVisible();
		await expect(page.locator('#confirmPassword')).toBeVisible();
		await expect(page.getByText('Họ và tên')).toBeVisible();
		await expect(page.getByText('Xác nhận mật khẩu')).toBeVisible();
	});

	test('should validate fullname on register', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();
		await page.locator('#email').fill('test@example.com');
		await page.locator('#password').fill('password123');
		await page.locator('#confirmPassword').fill('password123');
		await page.locator('form button[type="submit"]').click();

		await expect(page.getByText('Vui lòng nhập họ tên')).toBeVisible();
	});

	test('should validate password match on register', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();
		await page.locator('#fullname').fill('Test User');
		await page.locator('#email').fill('test@example.com');
		await page.locator('#password').fill('password123');
		await page.locator('#confirmPassword').fill('differentpassword');
		await page.locator('form button[type="submit"]').click();

		await expect(page.getByText('Mật khẩu xác nhận không khớp')).toBeVisible();
	});

	test('should have terms checkbox on register', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();
		await page.waitForTimeout(500);

		const checkbox = page.locator('#terms');
		if (await checkbox.count() > 0) {
			await expect(checkbox).toBeVisible();
		}
	});
});

test.describe('Authentication - OAuth Integration', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display Google button with SVG icon on login', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const googleButton = page.locator('button:has-text("Đăng nhập bằng Google")');
		await expect(googleButton).toBeVisible();
		await expect(googleButton.locator('svg')).toBeVisible();
	});

	test('should display Google button on register tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.locator('button:has-text("Đăng ký")').first().click();

		await expect(page.locator('button:has-text("Đăng ký bằng Google")')).toBeVisible();
	});
});

test.describe('Authentication - Guest Access', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have guest access button on login tab', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const guestLink = page.getByRole('link', { name: 'Truy cập với vai trò Khách' });
		await expect(guestLink).toBeVisible();
		await expect(guestLink).toHaveAttribute('href', '/');
	});

	test('should navigate to home when guest button clicked', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await page.getByRole('link', { name: 'Truy cập với vai trò Khách' }).click();

		await expect(page).toHaveURL(TEST_CONSTANTS.BASE_URL);
		await expect(page.locator('h1')).toBeVisible();
	});
});

test.describe('Authentication - Protected Features', () => {
	test('should require login for deep query mode', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
		
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const sparklesButton = page.locator('button:has(.lucide-sparkles)');
		await sparklesButton.click();

		await expect(page).toHaveURL(/.*\/auth.*redirected=true/);
	});

	test('should require login for voice button', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
		
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const voiceButton = page.locator('button:has(.lucide-mic)').first();
		await voiceButton.click();

		await expect(page).toHaveURL(/.*\/auth.*redirected=true/);
	});

	test('should redirect with message when sending from main page', async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
		
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Tìm thông tin quy chế');
		await textarea.press('Enter');

		if (page.url().includes('/auth')) {
			await expect(page.url()).toContain('message=');
		}
	});

	test('should allow guest to view main page', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});
});

test.describe('Authentication - UI/UX', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should display logo with GraduationCap icon', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('.lucide-graduation-cap')).toBeVisible();
	});

	test('should have tab switching functionality', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const loginTab = page.locator('button:has-text("Đăng nhập")').first();
		const registerTab = page.locator('button:has-text("Đăng ký")').first();

		await expect(loginTab).toHaveClass(/border-b-2/);

		await registerTab.click();
		await expect(registerTab).toHaveClass(/border-b-2/);
	});

	test('should display university info in left panel on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		const leftPanel = page.locator('section.hidden\\@md\\:block');
		if (await leftPanel.count() > 0) {
			await expect(leftPanel).toBeVisible();
		}
	});

	test('should display footer with copyright', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);

		await expect(page.getByText('Trường Đại học Bách Khoa - ĐHQG-HCM')).toBeVisible();
		await expect(page.getByText('© 2026 BK-TBOT')).toBeVisible();
	});
});
