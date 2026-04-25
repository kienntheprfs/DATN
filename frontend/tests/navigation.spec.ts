import { test, expect } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Wayfinder Navigation (Real Data & API)', () => {
	// Dùng beforeEach để đăng nhập thực tế vào hệ thống
	test.beforeEach(async ({ page }) => {
		// Bỏ qua setupMockApi và setupMockVoice để dùng dữ liệu hoàn toàn thật
		await helpers.loginWithCredentials(page);
	});

	test('should display the navigation page and interact with real map data', async ({ page }) => {
		// Vào trang Navigation
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra có header hiển thị Map
		await expect(page.locator('header')).toBeVisible();
		
		// Kiểm tra phần chính của map container
		await expect(page.locator('main')).toBeVisible();
		
		// Giao diện tìm kiếm điểm đi và điểm đến
		const startInput = page.getByPlaceholder(/bắt đầu|Start/i);
		const destInput = page.getByPlaceholder(/Điểm đến|Destination/i);
		await expect(startInput).toBeVisible();
		await expect(destInput).toBeVisible();
		
		// Nút Tìm đường
		await expect(page.getByRole('button', { name: /Tìm đường|Find Route/i })).toBeVisible();
		
		// Nhập thử điểm đi, điểm đến và bấm nút Hoán đổi (Swap)
		await startInput.fill('Test Start');
		await destInput.fill('Test Destination');
		
		const swapButton = page.locator('button').filter({ has: page.locator('.lucide-arrow-up-down') }).first();
		await expect(swapButton).toBeVisible();
		await swapButton.click();

		// Nút Refresh Cache bản đồ
		const refreshButton = page.getByRole('button', { name: /Refresh Map Cache|Làm mới/i }).first();
		await expect(refreshButton).toBeVisible();
		
		// Nút zoom bản đồ
		const zoomInBtn = page.locator('button').filter({ has: page.locator('.material-symbols-outlined:has-text("add")') }).first();
		const zoomOutBtn = page.locator('button').filter({ has: page.locator('.material-symbols-outlined:has-text("remove")') }).first();
		await expect(zoomInBtn).toBeVisible();
		await expect(zoomOutBtn).toBeVisible();
	});

	test('should display map editor and its tools', async ({ page }) => {
		// Vào trang Map Editor
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/navigation/editor`);
		await helpers.waitForPageLoad(page);

		// Kiểm tra header có tiêu đề chọn bản đồ
		await expect(page.getByText(/Select Map|Chọn bản đồ/i).first()).toBeVisible();

		// Kiểm tra Sidebar Editor Tools
		const sidebar = page.locator('aside');
		await expect(sidebar).toBeVisible();
		await expect(sidebar.getByText('Editor Tools')).toBeVisible();

		// Kiểm tra 3 công cụ chính của Editor
		await expect(page.locator('button', { hasText: 'Select Tool' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'Add Node' })).toBeVisible();
		await expect(page.locator('button', { hasText: 'Add Edge' })).toBeVisible();

		// Bấm thử vào Add Node để đổi Tool active
		const addNodeBtn = page.locator('button', { hasText: 'Add Node' });
		await addNodeBtn.click();
		
		// Kiểm tra có trạng thái báo tool đang được kích hoạt (cột tọa độ)
		await expect(sidebar.getByText('ADD NODE')).toBeVisible();

		// Kiểm tra tọa độ X, Y hiển thị
		await expect(sidebar.getByText('X:')).toBeVisible();
		await expect(sidebar.getByText('Y:')).toBeVisible();
		
		// Kiểm tra map SVG render ra
		await expect(page.locator('svg')).toBeVisible();

		// Kiểm tra nút Quản lý tòa nhà và nút xóa bản đồ (nếu có bản đồ)
		const manageBuildingBtn = page.locator('button[title="Quản lý tòa nhà"]');
		if (await manageBuildingBtn.count() > 0) {
			await expect(manageBuildingBtn).toBeVisible();
		}
	});
});
