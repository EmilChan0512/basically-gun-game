import { expect, type Page } from '@playwright/test';
export async function enterOffline(page: Page, _legacyLabel?: string) {
  await expect(page.locator('#account-submit')).toHaveCount(0);
  await page.locator('#continue-campaign').waitFor({ state: 'visible' });
}
