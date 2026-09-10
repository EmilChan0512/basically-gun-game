import { test, expect } from '@playwright/test';
test('Gun Lab actual input consumes ammo once while a semiautomatic trigger is held', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({ ammo: 11, health: 100 });
  await page.keyboard.up('f');
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 10);
  await page.keyboard.up('f');
});
