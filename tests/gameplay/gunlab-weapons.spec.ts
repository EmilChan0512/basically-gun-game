import { test, expect } from '@playwright/test';

test('Gun Lab keyboard reload keeps magazine rounds and consumes reserve ammo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await expect(page.locator('#telemetry')).toContainText('WEAPON');
  await page.keyboard.press('q');
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({ weapon: 'm4', ammo: 30, reserveAmmo: 90 });
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

test('pause freezes combat, rejects actions and the next combat frame advances reload once', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11);
  await page.keyboard.up('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11 && window.__strike!.gunLab.gun.cooldownMs < 1e-7);
  await page.keyboard.press('l');
  await page.keyboard.press('p');
  const before = await page.evaluate(() => window.__strike!.gunLab.snapshot());
  await page.keyboard.press('f'); await page.keyboard.press('q'); await page.keyboard.press('l');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toEqual(before);
  for (let i = 0; i < 4; i++) {
    const timeBeforeStep = await page.evaluate(() => window.__strike!.simTime);
    await page.keyboard.press('.');
    // Keydown queues the step; wait for Phaser's next render to consume it before inspecting combat.
    await page.waitForFunction(time => window.__strike!.simTime > time, timeBeforeStep);
    const current = await page.evaluate(() => window.__strike!.gunLab.snapshot());
    if (current.combatFrame === before.combatFrame) expect(current.reloadFrames).toBe(before.reloadFrames);
    else {
      expect(current.combatFrame).toBe(before.combatFrame + 1);
      expect(current.reloadFrames).toBe(before.reloadFrames - 1);
      break;
    }
  }
  expect(await page.evaluate(() => window.__strike!.gunLab.combatFrame)).toBe(before.combatFrame + 1);
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

test('a USP press during cooldown retries while held and latches after the next shot', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 11);
  await page.keyboard.up('f');
  await page.keyboard.down('f');
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo === 10);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(10);
  await page.keyboard.up('f');
});

test('four paused physics steps advance exactly one original combat frame', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.press('p');
  const before = await page.evaluate(() => window.__strike!.snapshot());
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press('.');
    await page.waitForFunction(time => window.__strike!.simTime >= time - 1e-9, before.time + i / 120);
  }
  const after = await page.evaluate(() => window.__strike!.snapshot());
  expect(after.combat.combatFrame - before.combat.combatFrame).toBe(1);
  expect(after.time - before.time).toBeCloseTo(1 / 30, 6);
  expect(after.combat.ammo).toBe(before.combat.ammo);
});

test('mouse trigger uses the same M4 automatic loop and stops on release', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.keyboard.press('q');
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => window.__strike!.gunLab.gun.ammo < 29);
  await page.mouse.up();
  const ammo = await page.evaluate(() => window.__strike!.gunLab.gun.ammo);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__strike!.gunLab.gun.ammo)).toBe(ammo);
});
