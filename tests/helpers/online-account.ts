import { expect, type Page } from '@playwright/test';

export async function registerOnline(page: Page, name: string) {
  await page.locator('#account-name').fill(name);
  await page.locator('#account-password').fill('test-password-123');
  await page.locator('#account-register').click();
  await expect(page.locator('#account-status')).toContainText(`${name} · 金币`);
}

export async function openOnlineArmory(page: Page) {
  await page.locator('#online-armory-nav').click();
  await expect(page.locator('#online-preflight')).toBeVisible();
}

export async function selectOnlineClass(page: Page, id: string) {
  await openOnlineArmory(page);
  await page.locator(`#class-${id}`).click();
  await expect(page.locator(`#class-${id}`)).toHaveAttribute('aria-pressed', 'true');
}

export async function equipOnline(page: Page, slot: string, id: string) {
  await openOnlineArmory(page);
  await page.locator(`#tab-${slot}`).click();
  await page.locator(`#equip-${id}`).click();
  await expect(page.locator(`[data-gear="${id}"]`)).toHaveClass(/is-equipped/);
}

export async function onlineLobby(page: Page) {
  await page.locator('#online-lobby-nav').click();
  await expect(page.locator('#online-lobby-page')).toBeVisible();
}
