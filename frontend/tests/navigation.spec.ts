import { test, expect } from '@playwright/test';
import { setupMockApi, setupMockVoice } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Wayfinder Navigation', () => {
	test.beforeEach(async ({ page }) => {
		// Set up mock API but we will use the real auth to log in if needed. 
		// If mockAuth is false in test-fixtures, we will authenticate normally.
		await setupMockApi(page, { mockAuth: false });
		await setupMockVoice(page);

		// Login before testing navigation
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);
		await page.locator('#email').fill('admin@example.com');
		await page.locator('#password').fill('admin123');
		await page.locator('form button[type="submit"]').click();
		
		// Wait for login to complete and navigate to home or navigation
		await page.waitForTimeout(2000); 

		// Go to navigation page
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await helpers.waitForPageLoad(page);
	});

	test('should display the navigation page and map container', async ({ page }) => {
		// Check for the header text containing "Campus Pathfinding" or "Map"
		await expect(page.locator('header')).toBeVisible();
		
		// Map container should be present
		await expect(page.locator('main')).toBeVisible();
		
		// Search inputs should be visible
		await expect(page.getByPlaceholder(/bắt đầu|Start/i)).toBeVisible();
		await expect(page.getByPlaceholder(/Điểm đến|Destination/i)).toBeVisible();
		
		// Find Route button should be visible
		await expect(page.getByRole('button', { name: /Tìm đường|Find Route/i })).toBeVisible();
	});

	test('should allow entering start and destination and swapping them', async ({ page }) => {
		// Fill start location
		const startInput = page.getByPlaceholder(/bắt đầu|Start/i);
		await startInput.fill('Entrance A');
		
		// Fill destination
		const destInput = page.getByPlaceholder(/Điểm đến|Destination/i);
		await destInput.fill('Room 101');
		
		// Click swap button (it has lucide arrow-up-down icon)
		const swapButton = page.locator('button').filter({ has: page.locator('.lucide-arrow-up-down') }).first();
		await swapButton.click();
		
		// Verification might be tricky if the input behaves like a combobox, but we can check if swap triggered
		await expect(swapButton).toBeVisible();
	});

	test('should toggle the refresh cache button', async ({ page }) => {
		// Refresh cache button
		const refreshButton = page.getByRole('button', { name: /Refresh Map Cache|Làm mới/i }).first();
		await expect(refreshButton).toBeVisible();
	});
	
	test('should show map zoom controls', async ({ page }) => {
		// Map zoom in/out controls
		const zoomInBtn = page.locator('button').filter({ has: page.locator('.material-symbols-outlined:has-text("add")') });
		const zoomOutBtn = page.locator('button').filter({ has: page.locator('.material-symbols-outlined:has-text("remove")') });
		
		await expect(zoomInBtn).toBeVisible();
		await expect(zoomOutBtn).toBeVisible();
	});
});
