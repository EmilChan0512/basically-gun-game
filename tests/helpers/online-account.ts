import { expect, type Page } from '@playwright/test';

export async function registerOnline(page: Page, name: string) {
  await page.locator('#account-name').fill(name);
  await page.locator('#account-password').fill('test-password-123');
  await page.locator('#account-register').click();
  await expect(page.locator('#account-status')).toContainText(`${name} · 金币`);
}
