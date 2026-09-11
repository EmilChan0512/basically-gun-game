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

test('default sandbox keeps combat HUD with debug off and mouse fire produces a persistent kill', async ({ page }) => {
  await page.keyboard.press('h');
  const canvas = await page.locator('canvas').boundingBox();
  const camera = await page.evaluate(() => {
    const c = window.__originalStrike!.cameras.main;
    return { x: c.scrollX, y: c.scrollY };
  });
  await page.mouse.move(canvas!.x + (700 - camera.x) * canvas!.width / 1120, canvas!.y + (558 - camera.y) * canvas!.height / 620);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForFunction(() => window.__originalStrike!.snapshot().kills === 1);
  await page.mouse.up();
  await page.keyboard.press('p');
  const result = await page.evaluate(() => {
    const scene = window.__originalStrike!;
    return { state: scene.snapshot(), debug: scene.debugVisible, labels: scene.children.list
      .filter(child => child.type === 'Text')
      .map(child => { const label = child as unknown as { text: string; visible: boolean }; return { text: label.text, visible: label.visible }; }) };
  });
  expect(result.debug).toBe(false);
  expect(result.state.feedback).toMatchObject({ killed: true });
  expect(result.labels.some(label => label.visible && label.text.includes('KILLS 1'))).toBe(true);
  expect(result.labels.some(label => label.visible && label.text.includes('ELIMINATED'))).toBe(true);
  await page.screenshot({ path: 'test-results/phase3-combat.png', fullPage: true });
  await page.keyboard.press('r');
  expect(await page.evaluate(() => window.__originalStrike!.snapshot().kills)).toBe(0);
});
