import { test as base } from '@playwright/test';

base.describe('V8 Coverage Collection', () => {
  base('collect coverage from main pages with interactions', async ({ page }) => {
    await page.coverage.startJSCoverage();
    
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const input = page.locator('textarea').first();
    if (await input.isVisible()) {
      await input.fill('test query');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }
    
    await page.goto('http://localhost:3000/auth');
    await page.waitForLoadState('networkidle');
    
    const loginTab = page.locator('button:has-text("Đăng nhập")').first();
    if (await loginTab.isVisible()) {
      await loginTab.click();
    }
    
    const registerTab = page.locator('button:has-text("Đăng ký")').first();
    if (await registerTab.isVisible()) {
      await registerTab.click();
      await page.waitForTimeout(500);
    }
    
    await page.goto('http://localhost:3000/chat');
    await page.waitForLoadState('networkidle');
    
    await page.goto('http://localhost:3000/chat?thread_id=test123');
    await page.waitForLoadState('networkidle');
    
    const coverage = await page.coverage.stopJSCoverage();
    
    console.log(`\n📊 Coverage collected: ${coverage.length} scripts`);
  });
});
