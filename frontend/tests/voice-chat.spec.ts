import { test, expect } from './test-fixtures';
import { helpers, TEST_CONSTANTS } from './test-utils';

test.describe('Voice Chat Feature', () => {
	// Tăng timeout của toàn bộ spec file lên 90s do quá trình tạo WebRTC backend có thể chậm
	test.setTimeout(90000);

	// Yêu cầu quyền microphone cho browser
	// (Nếu máy không có mic thực, hãy chạy lệnh phụ với cờ mock device hoặc config global)
	test.use({ 
		permissions: ['microphone']
	});

	test.beforeEach(async ({ page }) => {
		// Dùng dữ liệu thật, đăng nhập vào hệ thống
		await helpers.loginWithCredentials(page);
	});

	test('should start and stop voice conversation properly', async ({ page }) => {
		await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
		await helpers.waitForPageLoad(page);

		// Nút Voice ban đầu có biểu tượng Micro (lucide-mic)
		const voiceButton = page.locator('button').filter({ has: page.locator('.lucide-mic') }).first();
		await expect(voiceButton).toBeVisible();
		
		// Đặt Promise chờ request POST lên /api/voice/offer (tạo WebRTC)
		const offerPromise = page.waitForRequest(req => req.url().includes('/api/voice/offer') && req.method() === 'POST');

		// Bấm nút Voice để bắt đầu
		await voiceButton.click();

		// Kiểm tra URL thay đổi, có thêm voice=true
		await expect(page).toHaveURL(/voice=true/);

		// Kiểm tra request WebRTC Offer thực sự được gửi đi tới Real API
		const offerReq = await offerPromise;
		expect(offerReq).toBeTruthy();
		const body = JSON.parse(offerReq.postData() || "{}");
		expect(body.sdp).toBeDefined(); // Đảm bảo offer có chứa dữ liệu SDP

		// Đợi khoảng 30s cho backend khởi tạo Pipecat / WebRTC
		await page.waitForTimeout(30000);

		// Khi kết nối thành công, nút Voice biến thành Kết thúc cuộc gọi (lucide-phone-off)
		const phoneOffButton = page.locator('button').filter({ has: page.locator('.lucide-phone-off') }).first();
		await expect(phoneOffButton).toBeVisible({ timeout: 10000 });
		
		// Đồng thời nút Mute (lucide-mic-off) cũng sẽ xuất hiện (theo logic UI của ChatInput)
		const muteButton = page.locator('button').filter({ has: page.locator('.lucide-mic-off') }).first();
		await expect(muteButton).toBeVisible();
		
		// Bấm Mute thử
		await muteButton.click();
		
		// Bấm Kết thúc cuộc gọi
		await phoneOffButton.click();
		
		// Sau khi ngắt kết nối, nút Voice trở lại trạng thái ban đầu (lucide-mic)
		await expect(voiceButton).toBeVisible({ timeout: 10000 });
	});
});
