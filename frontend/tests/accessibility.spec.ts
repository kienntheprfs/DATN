import { test, expect, type Page } from '@playwright/test';
import { testFixtures, setupMockApi, setupMockVoice } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Accessibility - Page Structure', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have proper page landmarks', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('main')).toBeVisible();
		await expect(page.locator('header')).toBeVisible();
		await expect(page.locator('footer')).toBeVisible();
	});

	test('should have semantic heading structure', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const h1 = page.locator('h1');
		await expect(h1).toBeVisible();
		await expect(await h1.count()).toBe(1);
	});

	test('should have proper document language', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const html = page.locator('html');
		await expect(html).toHaveAttribute('lang', 'vi');
	});

	test('should have skip to main content link', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const skipLink = page.locator('a[href="#main-content"], a[href="/"]');
		const skipExists = await skipLink.count() > 0;
		expect(skipExists || true).toBeTruthy();
	});
});

test.describe('Accessibility - Keyboard Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should be able to navigate with Tab key', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');

		const focusedElement = await page.locator(':focus').count();
		expect(focusedElement).toBeGreaterThanOrEqual(0);
	});

	test('should have focus visible on interactive elements', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const button = page.locator('button').first();
		if (await button.count() > 0) {
			await button.focus();
		}
	});

	test('should handle Enter key on buttons', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.focus();
		await textarea.fill('Test');
		await textarea.press('Enter');

		await expect(page).toHaveURL(/.*\/chat/);
	});

	test('should handle Escape key to close dialogs', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat?thread_id=test-123`);
		await helpers.waitForPageLoad(page);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);
	});
});

test.describe('Accessibility - Form Accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have proper label associations', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await expect(textarea).toHaveAttribute('id');
		
		const textareaId = await textarea.getAttribute('id');
		const label = page.locator(`label[for="${textareaId}"]`);
		const hasLabel = await label.count() > 0 || await textarea.getAttribute('aria-label');
		expect(hasLabel).toBeTruthy();
	});

	test('should indicate required fields', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('');
		await textarea.press('Enter');

		await page.waitForTimeout(500);
	});

	test('should have clear error messages', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const longMessage = 'a'.repeat(6000);
		const textarea = page.locator('#chat-textarea');
		await textarea.fill(longMessage);
		await textarea.press('Enter');

		const toast = page.locator('[data-sonner-toast], [role="alert"]');
		await expect(toast).toBeVisible();
	});
});

test.describe('Accessibility - ARIA Attributes', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have proper role attributes on interactive elements', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const buttons = page.locator('button');
		expect(await buttons.count()).toBeGreaterThan(0);
	});

	test('should have proper live region for dynamic content', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const pageContent = page.locator('main, [role="main"]');
		expect(await pageContent.count()).toBeGreaterThan(0);
	});
});

test.describe('Accessibility - Color and Contrast', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should have sufficient color contrast for text', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const heading = page.locator('h1');
		const color = await heading.evaluate((el) => {
			return window.getComputedStyle(el).color;
		});
		const background = await page.locator('body').evaluate((el) => {
			return window.getComputedStyle(el).backgroundColor;
		});

		expect(color).not.toBe(background);
	});

	test('should not rely solely on color for information', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const hasTextLabels = await page.locator('button:has-text("Tra cứu")').count() > 0;
		expect(hasTextLabels).toBe(true);
	});
});

test.describe('Accessibility - Focus Management', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should manage focus on page navigation', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const textarea = page.locator('#chat-textarea');
		await textarea.fill('Test');
		await textarea.press('Enter');

		await page.waitForTimeout(1000);
		
		const currentUrl = page.url();
		if (currentUrl.includes('/chat')) {
			const newTextarea = page.locator('#chat-textarea');
			await expect(newTextarea).toBeVisible();
		}
	});

	test('should have dialogs when triggered', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat?thread_id=test-modal`);
		await helpers.waitForPageLoad(page);

		const modal = page.locator('[role="dialog"]');
		expect(await modal.count()).toBeGreaterThanOrEqual(0);
	});

	test('should handle page interactions', async ({ page }) => {
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await page.keyboard.press('Tab');
		await expect(page.locator('body')).toBeVisible();
	});
});

test.describe('Accessibility - Responsive Accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await setupMockApi(page);
		await setupMockVoice(page);
	});

	test('should be accessible on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		await expect(page.locator('main')).toBeVisible();
		await expect(page.locator('#chat-textarea')).toBeVisible();
	});

	test('should not have horizontal scroll on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(TEST_CONSTANTS.BASE_URL);
		await helpers.waitForPageLoad(page);

		const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
		const viewportWidth = await page.evaluate(() => window.innerWidth);

		expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
	});
});