import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?rules=original');
  await page.waitForFunction(() => window.__originalStrike && window.__originalStrike.core.frame > 0);
});
test('original rules entry uses actual movement, crouch, jump and shared solid-wall collision', async ({ page }) => {
  await expect(page.locator('#telemetry')).toContainText('M4 30 + 78');
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.x > 220);
  await page.keyboard.up('d');
  await page.keyboard.down('s');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.crouching);
  await page.keyboard.up('s');
  await page.waitForFunction(() => !window.__originalStrike!.core.movement.crouching);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.y < 550);
  await page.waitForFunction(() => !window.__originalStrike!.core.movement.jumping);
  await page.keyboard.press('2');
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__originalStrike!.core.movement.x > 885);
  await page.keyboard.up('d');
  // Start the wall check from the floor; the previous climb can carry the player above the wall probes.
  await page.evaluate(() => window.__originalStrike!.core.movement.reset(910, 599.5));
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  const state = await page.evaluate(() => window.__originalStrike!.snapshot());
  expect(state.x).toBeLessThan(934);
  await page.screenshot({ path: 'test-results/original-rules.png', fullPage: true });
});
test('player death freezes input and a 151st dead frame restores the original loadout', async ({ page }) => {
  await page.keyboard.press('q');
  await expect(page.locator('#telemetry')).toContainText('USP 12 + 53');
  await page.keyboard.press('k');
  await page.keyboard.press('p');
  const before = await page.evaluate(() => window.__originalStrike!.snapshot());
  expect(before.life.alive).toBe(false);
  await page.keyboard.press('q'); await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__originalStrike!.snapshot())).toEqual(before);
  await page.keyboard.press('.');
  expect(await page.evaluate(() => window.__originalStrike!.core.frame)).toBe(before.frame + 1);
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__originalStrike!.core.life.alive, undefined, { timeout: 8000 });
  expect(await page.evaluate(() => window.__originalStrike!.snapshot())).toMatchObject({ life: { health: 85 }, combat: { weapon: 'm4', ammo: 30, reserveAmmo: 78 } });
});
