import { test, expect, type Page } from '@playwright/test';

async function aimAtWorld(page: Page, point: { x: number; y: number }) {
  const screen = await page.evaluate(point => {
    const scene = window.__strike!;
    const rect = scene.game.canvas.getBoundingClientRect();
    const camera = scene.cameras.main;
    return {
      x: rect.left + (point.x - camera.scrollX) * rect.width / scene.scale.gameSize.width,
      y: rect.top + (point.y - camera.scrollY) * rect.height / scene.scale.gameSize.height,
    };
  }, point);
  await page.mouse.move(screen.x, screen.y);
}
async function fireOne(page: Page) {
  const before = await page.evaluate(() => window.__strike!.gunLab.shotsFired);
  await page.keyboard.down('f');
  await page.waitForFunction(before => window.__strike!.gunLab.shotsFired === before + 1, before);
  await page.keyboard.up('f');
}

test('pointer and keyboard hit the displayed body/head rectangles with fractional head damage', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await aimAtWorld(page, { x: 700, y: 560 });
  await fireOne(page);
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({
    ammo: 11, health: 85, lastEvent: { hitRegion: 'body', amount: 15 },
    lastShot: { hit: { type: 'unit', region: 'body' } },
    targetBounds: { full: { x: 687, y: 507, width: 26, height: 66 } },
  });
  await aimAtWorld(page, { x: 700, y: 515 });
  await fireOne(page);
  expect(await page.evaluate(() => window.__strike!.gunLab.snapshot())).toMatchObject({
    ammo: 10, health: 63.25, lastEvent: { hitRegion: 'head', amount: 21.75 },
    lastShot: { hit: { type: 'unit', region: 'head' } },
  });
  await expect(page.locator('#telemetry')).toContainText('63.25 hp');
  await page.keyboard.press('p');
  const shot = await page.evaluate(() => window.__strike!.gunLab.lastShot);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__strike!.gunLab.lastShot)).toEqual(shot);
});

test('a shot towards a target beyond the extracted maximum range spends ammo and reports a sampled miss', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
  await page.evaluate(() => { window.__strike!.gunLab.targetPoint.x = 1100; });
  await aimAtWorld(page, { x: 1000, y: 540 });
  await fireOne(page);
  const state = await page.evaluate(() => window.__strike!.gunLab.snapshot());
  expect(state).toMatchObject({ ammo: 11, health: 100, lastEvent: null, lastShot: { hit: null } });
  expect(state.lastShot!.maxDistance).toBeGreaterThanOrEqual(630);
  expect(state.lastShot!.maxDistance).toBeLessThanOrEqual(690);
  expect(state.lastShot!.steps * 10).toBe(state.lastShot!.maxDistance);
});
