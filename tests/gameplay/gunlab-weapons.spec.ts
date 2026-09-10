import { test, expect } from '@playwright/test';

test('Gun Lab keyboard reload keeps magazine rounds and consumes reserve ammo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await expect(page.locator('#telemetry')).toContainText('WEAPON');
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({ weapon: 'carbine', ammo: 30, reserveAmmo: 90 });
  await page.keyboard.down('f');
  await expect.poll(() => page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBeLessThan(29);
  await page.keyboard.up('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.cooldownMs < 1e-7);
  const spent = await page.evaluate(() => window.__strike!.gunLab.gun.ammo);
  await page.keyboard.press('l');
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({ ammo: spent, reserveAmmo: 90 });
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.reloadMs)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(30);
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.reserveAmmo)).toBe(90 - (30 - spent));
});

test('pause freezes combat, rejects actions and single-step advances reload by one physics step', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11 && window.__strike!.gunLab.gun.cooldownMs < 1e-7);
  await page.keyboard.press('l');
  await page.keyboard.press('p');
  const before = await page.evaluate(() => window.__strike!.gunLab.snapshot());
  await page.keyboard.press('f'); await page.keyboard.press('q'); await page.keyboard.press('l');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toEqual(before);
  await page.keyboard.press('.');
  await expect.poll(() => page.evaluate(() => window.__strike!.gunLab.gun.reloadMs)).toBeLessThan(before.reloadMs);
  const after = await page.evaluate(() => window.__strike!.gunLab.gun.reloadMs);
  expect(before.reloadMs - after).toBeCloseTo(1000 / 120, 6);
  await page.keyboard.press('p');
  await expect.poll(() => page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(12);
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.reserveAmmo)).toBe(59);
});

test('switching while trigger held waits for release and retains weapon ammo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11);
  await page.keyboard.press('q');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(30);
  await page.keyboard.up('f');
  await page.keyboard.down('f');
  await expect.poll(() => page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBeLessThan(30);
  await page.keyboard.up('f');
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(11);
});
