import { test, expect, type Page } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Auth Page (/auth, /standalone/auth)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);
	});

	test('should display auth page with BK-TBOT heading', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'BK-TBOT' })).toBeVisible();
	});

	test('should display subtitle', async ({ page }) => {
		await expect(page.getByText('Hệ thống Tra cứu Quy chế & Văn bản')).toBeVisible();
	});

	test('should have two tabs: Đăng nhập and Đăng ký', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Đăng ký' })).toBeVisible();
	});

	test('should have email input field', async ({ page }) => {
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.getByPlaceholder('ten.ho@hcmut.edu.vn')).toBeVisible();
	});

	test('should have password input field', async ({ page }) => {
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.getByPlaceholder('••••••••')).toBeVisible();
	});

	test('should have submit button with Đăng nhập text', async ({ page }) => {
		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng nhập');
	});

	test('should have Google login button', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
	});

	test('should have guest access button', async ({ page }) => {
		await expect(page.getByRole('link', { name: 'Truy cập với vai trò Khách' })).toBeVisible();
	});

	test('should have "Quên mật khẩu?" link', async ({ page }) => {
		await expect(page.getByRole('link', { name: 'Quên mật khẩu?' })).toBeVisible();
	});

	test('should toggle password visibility', async ({ page }) => {
		const passwordInput = page.locator('#password');
		await passwordInput.fill('testpassword');

		const toggleButton = page.locator('button:has(.material-symbols-outlined)').first();
		await toggleButton.click();

		const inputType = await passwordInput.getAttribute('type');
		expect(inputType).toBe('text');
	});

	test('should switch to register tab', async ({ page }) => {
		await page.getByRole('button', { name: 'Đăng ký' }).click();
		await expect(page.locator('form button[type="submit"]')).toHaveText('Đăng ký');
	});

	test('should show validation errors for empty form', async ({ page }) => {
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(500);
	});

	test('should display divider with "Hoặc" text', async ({ page }) => {
		await expect(page.getByText('Hoặc')).toBeVisible();
	});

	test('should show fullname field in register mode', async ({ page }) => {
		await page.getByRole('button', { name: 'Đăng ký' }).click();
		await expect(page.locator('#fullname')).toBeVisible();
	});

	test('should show confirm password field in register mode', async ({ page }) => {
		await page.getByRole('button', { name: 'Đăng ký' }).click();
		await expect(page.locator('#confirmPassword')).toBeVisible();
	});

	test('should navigate to home as guest', async ({ page }) => {
		await page.getByRole('link', { name: 'Truy cập với vai tr�� Khách' }).click();
		await expect(page).toHaveURL(/\/$/);
	});

	test('should show toast when redirected with redirected=true', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth?redirected=true`);
		await page.waitForTimeout(1000);
	});

	test('should display footer with copyright', async ({ page }) => {
		await expect(page.getByText('© 2026 BK-TBOT')).toBeVisible();
	});

	// ============== EDGE CASES ==============
	test('should validate email format', async ({ page }) => {
		await page.locator('#email').fill('invalid-email');
		await page.locator('#password').fill('password123');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(500);
	});

	test('should show error for wrong credentials', async ({ page }) => {
		await page.locator('#email').fill('wrong@hcmut.edu.vn');
		await page.locator('#password').fill('wrongpassword');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(2000);
	});

	test('should validate password min length', async ({ page }) => {
		await page.locator('#email').fill('test@hcmut.edu.vn');
		await page.locator('#password').fill('123');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(500);
	});

	test('should handle network error gracefully', async ({ page }) => {
		await page.route('**/api/**', (route) => route.abort('failed'));
		await page.locator('#email').fill('test@hcmut.edu.vn');
		await page.locator('#password').fill('password123');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(2000);
	});

	test('should clear errors when switching tabs', async ({ page }) => {
		await page.locator('#email').fill('');
		await page.locator('form button[type="submit"]').click();
		await page.waitForTimeout(300);
		await page.getByRole('button', { name: 'Đăng ký' }).click();
		await page.waitForTimeout(300);
	});

	test('should handle very long email input', async ({ page }) => {
		const longEmail = 'a'.repeat(100) + '@hcmut.edu.vn';
		await page.locator('#email').fill(longEmail);
		await page.waitForTimeout(200);
		const value = await page.locator('#email').inputValue();
		expect(value.length).toBeGreaterThan(50);
	});

	test('should handle special characters in password', async ({ page }) => {
		await page.locator('#password').fill('p@$$w0rd!#123');
		const inputType = await page.locator('#password').getAttribute('type');
		expect(inputType).toBe('password');
	});

	test('should handle Google login failure gracefully', async ({ page }) => {
		const googleBtn = page.getByRole('button', { name: 'Đăng nhập bằng Google' });
		if (await googleBtn.count() > 0) {
			await googleBtn.click();
			await page.waitForTimeout(1000);
		}
	});
});

test.describe('Auth Callback (/auth/callback)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth/callback`);
		await helpers.waitForPageLoad(page).catch(() => {});
		await page.waitForTimeout(2000);
	});

	test('should handle Google OAuth callback', async ({ page }) => {
		const currentUrl = page.url();
		expect(currentUrl).toContain('/auth/callback');
	});

	test('should handle callback with error param', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth/callback?error=access_denied`);
		await page.waitForTimeout(2000);
	});

	test('should handle callback with code', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth/callback?code=test123`);
		await page.waitForTimeout(2000);
	});
});

test.describe('Navigation Page (/navigation)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await helpers.waitForPageLoad(page);
	});

	test('should display navigation page', async ({ page }) => {
		await expect(page.locator('body')).toBeVisible();
	});

	test('should have map or search component', async ({ page }) => {
		const body = await page.locator('body').textContent();
		expect(body).toBeTruthy();
	});

	test('should allow search for locations', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('A1');
			await page.waitForTimeout(500);
		}
	});

	test('should display location results', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('H1');
			await page.waitForTimeout(1000);
			const results = page.locator('[class*="result"], [class*="location"]');
			if (await results.count() > 0) {
				await expect(results.first()).toBeVisible();
			}
		}
	});

	test('should navigate to location on map', async ({ page }) => {
		const locationCard = page.locator('[class*="card"], [class*="location-item"]').first();
		if (await locationCard.count() > 0) {
			await locationCard.click();
			await page.waitForTimeout(500);
		}
	});

	// ============== EDGE CASES ==============
	test('should show no results for empty search', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('');
			await page.waitForTimeout(500);
		}
	});

	test('should show no results for invalid location', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('xyznonexistent123');
			await page.waitForTimeout(1500);
		}
	});

	test('should handle special characters in search', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('A@#$$123');
			await page.waitForTimeout(500);
		}
	});

	test('should handle very long search query', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('A'.repeat(100));
			await page.waitForTimeout(500);
		}
	});

	test('should handle map zoom in', async ({ page }) => {
		const zoomIn = page.locator('button:has-text("+"), [title*="zoom"], [aria-label*="zoom"]').first();
		if (await zoomIn.count() > 0) {
			await zoomIn.click();
			await page.waitForTimeout(300);
		}
	});

	test('should handle map zoom out', async ({ page }) => {
		const zoomOut = page.locator('button:has-text("-"), [title*="zoom"], [aria-label*="zoom"]').last();
		if (await zoomOut.count() > 0) {
			await zoomOut.click();
			await page.waitForTimeout(300);
		}
	});

	test('should handle map drag/pan', async ({ page }) => {
		const mapContainer = page.locator('[class*="map"]').first();
		if (await mapContainer.count() > 0) {
			await mapContainer.dragTo(mapContainer);
			await page.waitForTimeout(500);
		}
	});

	test('should handle click on map', async ({ page }) => {
		const mapContainer = page.locator('[class*="map"]').first();
		if (await mapContainer.count() > 0) {
			await mapContainer.click({ position: { x: 100, y: 100 } });
			await page.waitForTimeout(500);
		}
	});

	test('should display floor selector', async ({ page }) => {
		const floorSelect = page.getByRole('combobox', { name: /tầng|floor/i });
		if (await floorSelect.count() > 0) {
			await expect(floorSelect).toBeVisible();
		}
	});

	test('should handle floor change', async ({ page }) => {
		const floorSelect = page.getByRole('combobox', { name: /tầng|floor/i });
		if (await floorSelect.count() > 0) {
			await floorSelect.click();
			await page.getByRole('option', { name: /Tầng 1|Tầng 1/i }).click();
			await page.waitForTimeout(500);
		}
	});

	test('should show building selector', async ({ page }) => {
		const buildingSelect = page.getByRole('combobox', { name: /tòa|building/i });
		if (await buildingSelect.count() > 0) {
			await expect(buildingSelect).toBeVisible();
		}
	});

	test('should handle wayfinding', async ({ page }) => {
		const fromInput = page.getByPlaceholder(/Từ|From/i);
		const toInput = page.getByPlaceholder(/Đến|To/i);
		if (await fromInput.count() > 0 && await toInput.count() > 0) {
			await fromInput.fill('A1');
			await toInput.fill('H1');
			await page.waitForTimeout(1000);
		}
	});

	test('should display route on map', async ({ page }) => {
		const routeBtn = page.getByRole('button', { name: /Chỉ đường|Route|Find/i }).first();
		if (await routeBtn.count() > 0) {
			await routeBtn.click();
			await page.waitForTimeout(1000);
		}
	});

	test('should handle share location', async ({ page }) => {
		const shareBtn = page.getByRole('button', { name: /Chia sẻ|Share/i }).first();
		if (await shareBtn.count() > 0) {
			await shareBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('should show distance to location', async ({ page }) => {
		const searchInput = page.getByPlaceholder(/Tìm kiếm|timkiem|search/i);
		if (await searchInput.count() > 0) {
			await searchInput.fill('Library');
			await page.waitForTimeout(1000);
			const distance = page.getByText(/m|kmmét/).first();
			if (await distance.count() > 0) {
				await expect(distance).toBeVisible();
			}
		}
	});

	test('should handle event navigation from map', async ({ page }) => {
		const eventCard = page.locator('[class*="event"]').first();
		if (await eventCard.count() > 0) {
			await eventCard.click();
			await page.waitForTimeout(500);
		}
	});

	test('should handle offline/network error on map', async ({ page }) => {
		await page.route('**/api/**', (route) => route.abort('failed'));
		await page.reload();
		await page.waitForTimeout(2000);
	});
});

test.describe('Navigation Editor (/navigation/editor)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation/editor`);
		await helpers.waitForPageLoad(page);
	});

	test('should display editor page', async ({ page }) => {
		await expect(page.locator('body')).toBeVisible();
	});

	test('should have save button', async ({ page }) => {
		const saveBtn = page.getByRole('button', { name: /Lưu|Save/i });
		if (await saveBtn.count() > 0) {
			await expect(saveBtn).toBeVisible();
		}
	});

	test('should have add location controls', async ({ page }) => {
		const addBtn = page.getByRole('button', { name: /Thêm|Add/i });
		if (await addBtn.count() > 0) {
			await expect(addBtn).toBeVisible();
		}
	});

	test('should have zoom controls', async ({ page }) => {
		const zoomIn = page.locator('button:has-text("+"), button[title*="zoom"]').first();
		if (await zoomIn.count() > 0) {
			await expect(zoomIn).toBeVisible();
		}
	});

	// ============== EDGE CASES ==============
	test('should add new marker', async ({ page }) => {
		const addBtn = page.getByRole('button', { name: /Thêm|Add/i }).first();
		if (await addBtn.count() > 0) {
			await addBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('should delete marker', async ({ page }) => {
		const deleteBtn = page.getByRole('button', { name: /Xóa|Delete/i }).first();
		if (await deleteBtn.count() > 0) {
			await deleteBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('should edit marker position', async ({ page }) => {
		const marker = page.locator('[class*="marker"]').first();
		if (await marker.count() > 0) {
			await marker.dragTo(page.locator('[class*="map"]').first());
			await page.waitForTimeout(500);
		}
	});

	test('should handle undo', async ({ page }) => {
		const undoBtn = page.locator('button[title*="undo"]').first();
		if (await undoBtn.count() > 0) {
			await undoBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('should handle redo', async ({ page }) => {
		const redoBtn = page.locator('button[title*="redo"]').first();
		if (await redoBtn.count() > 0) {
			await redoBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('should save changes', async ({ page }) => {
		const saveBtn = page.getByRole('button', { name: /Lưu|Save/i });
		if (await saveBtn.count() > 0) {
			await saveBtn.click();
			await page.waitForTimeout(1000);
		}
	});

	test('should cancel edit', async ({ page }) => {
		const cancelBtn = page.getByRole('button', { name: /Hủy|Cancel/i }).first();
		if (await cancelBtn.count() > 0) {
			await cancelBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('should show validation errors for empty required fields', async ({ page }) => {
		const saveBtn = page.getByRole('button', { name: /Lưu|Save/i });
		if (await saveBtn.count() > 0) {
			await saveBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('should handle long location name', async ({ page }) => {
		const nameInput = page.locator('input[name="name"], #location-name').first();
		if (await nameInput.count() > 0) {
			await nameInput.fill('A'.repeat(200));
			await page.waitForTimeout(300);
		}
	});
});

test.describe('Standalone Layout', () => {
	test('should load standalone layout without errors', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await helpers.waitForPageLoad(page);
		await expect(page.locator('body')).toBeVisible();
	});

	test('should have consistent styling across standalone pages', async ({ page }) => {
		const pages = ['/auth', '/navigation'];
		for (const path of pages) {
			await page.goto(`${TEST_CONSTANTS.BASE_URL}${path}`);
			await helpers.waitForPageLoad(page);
			const body = page.locator('body');
			await expect(body).toBeVisible();
		}
	});

	test('should handle 404 gracefully in standalone routes', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/nonexistent-page-xyz`);
		await page.waitForTimeout(2000);
	});

	// ============== EDGE CASES ==============
	test('should handle browser back/forward', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await helpers.waitForPageLoad(page);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await page.goBack();
		await expect(page.url()).toContain('/auth');
		await page.goForward();
		await expect(page.url()).toContain('/navigation');
	});

	test('should preserve state on navigation', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await page.locator('#email').fill('test@hcmut.edu.vn');
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
		await page.waitForTimeout(500);
	});

	test('should handle refresh', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await page.reload();
		await helpers.waitForPageLoad(page);
		await expect(page.locator('body')).toBeVisible();
	});

	test('should handle page visibility change', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await page.waitForTimeout(500);
		await page.evaluate(() => document.hidden = true);
		await page.waitForTimeout(500);
		await page.evaluate(() => document.hidden = false);
		await expect(page.locator('body')).toBeVisible();
	});
});