import { expect, type Page, type Locator } from '@playwright/test';

// Helper functions for common test patterns
export const helpers = {
  // Safe element interaction with re-location
  async safeClick(page: Page, selector: string, timeout: number = 5000): Promise<void> {
    const element = page.locator(selector);
    await element.click();

    // Wait for potential re-render
    await page.waitForTimeout(timeout);

    // Re-locate element if needed
    const relocated = page.locator(selector);
    await relocated.isVisible(); // Just verify it's still there
  },

  // Safe attribute get with re-location
  async safeGetAttribute(page: Page, selector: string, attribute: string): Promise<string | null> {
    try {
      const element = page.locator(selector);
      return await element.getAttribute(attribute);
    } catch (error) {
      // Element might be detached, try re-locating
      await page.waitForTimeout(500);
      const relocated = page.locator(selector);
      return await relocated.getAttribute(attribute);
    }
  },

  // Use real credentials to log into the application
  async loginWithCredentials(
    page: Page, 
    email = process.env.TEST_USER_EMAIL || 'admin@example.com', 
    password = process.env.TEST_USER_PASSWORD || 'admin123'
  ): Promise<void> {
    await page.goto(`${TEST_CONSTANTS.BASE_URL}/auth`);
    await this.waitForPageLoad(page);
    
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('form button[type="submit"]').click();
    
    // Wait for redirect to happen after successful login
    await page.waitForTimeout(2000); 
  },

  // Mock voice support
  async mockVoiceSupport(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Mock Speech Recognition API
      (window as any).SpeechRecognition = class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = 'vi-VN';
        onresult: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;

        start() {
          setTimeout(() => {
            if (this.onresult) {
              this.onresult({
                results: [[{
                  transcript: 'test voice input',
                  confidence: 0.9
                }]]
              });
            }
          }, 1000);
        }

        stop() {
          if (this.onend) this.onend();
        }
      };

      // Mock Speech Synthesis API
      (window as any).speechSynthesis = {
        speak: (utterance: any) => {
          setTimeout(() => {
            if (utterance.onend) utterance.onend();
          }, 1000);
        }
      };
    });
  },

  // Wait for page load with fallback
  async waitForPageLoad(page: Page, timeout: number = 10000): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout });
    } catch (error) {
      // Fallback to just wait for body
      await page.waitForSelector('body', { timeout: 5000 });
    }
    await expect(page.locator('body')).toBeVisible();
  },

  // Check if element exists and is visible
  async elementExists(page: Page, selector: string): Promise<boolean> {
    try {
      const element = page.locator(selector);
      return await element.isVisible({ timeout: 2000 });
    } catch {
      return false;
    }
  },

  // Flexible button state checking
  async checkButtonState(page: Page, selector: string, initialClasses?: string): Promise<{
    changed: boolean;
    visible: boolean;
    classes?: string;
    hasState?: boolean;
  }> {
    try {
      const element = page.locator(selector);
      const visible = await element.isVisible();

      if (!visible) {
        return { changed: false, visible: false };
      }

      const currentClasses = await element.getAttribute('class');
      const changed = initialClasses ? currentClasses !== initialClasses : false;

      return {
        changed,
        visible: true,
        classes: currentClasses || undefined,
        hasState: changed || (currentClasses?.includes('active') || false)
      };
    } catch (error) {
      return { changed: false, visible: false };
    }
  },

  // Fill chat input and send
  async sendChatMessage(page: Page, message: string): Promise<void> {
    const textarea = page.locator('#chat-textarea');
    await textarea.fill(message);
    await textarea.press('Enter');
  },

  // Wait for bot response
  async waitForBotResponse(page: Page, timeout = 10000): Promise<void> {
    await page.waitForSelector('[data-testid="bot-message"]', { timeout });
  },

  // Navigate to chat page with real authentication
  async navigateToChat(page: Page): Promise<void> {
    await page.goto(`${TEST_CONSTANTS.BASE_URL}/chat`);
    await helpers.waitForPageLoad(page);

    // If redirected to auth, let user handle login manually
    if (page.url().includes('/auth')) {
      console.log('Redirected to auth page - manual login required');
    }
  }
};

// Common test data
export const testData = {
  user: {
    id: 'test-user-123',
    name: 'Test User',
    email: 'test@example.com',
  },
  chatMessages: [
    { role: 'user', content: 'Hello, how are you?' },
    { role: 'assistant', content: 'I am doing well, thank you!' },
  ],
  sampleQueries: [
    'Tìm thông tin về quy chế đào tạo',
    'Quy định về xét học bổng',
    'Hướng dẫn đăng ký môn học',
  ],
};

// Test constants
export const TEST_CONSTANTS = {
  BASE_URL: 'http://localhost:3000',
  TIMEOUT: {
    SHORT: 2000,
    MEDIUM: 5000,
    LONG: 10000,
  },
};
