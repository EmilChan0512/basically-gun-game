import type { Page } from '@playwright/test';
export async function registerTestAccount(page: Page, name = 'Test Pilot') {
  await page.locator('#account-name').fill(name);
  await page.locator('#account-password').fill('test-password-123');
  await page.locator('#account-submit').click();
  await page.locator('#continue-campaign').waitFor({ state: 'visible' });
}
