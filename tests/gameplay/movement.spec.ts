import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__strike?.soldier.grounded);
});
test('loads a playable course, keyboard motion, pause, single step and reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const start = await page.evaluate(() => window.__strike!.snapshot());
  await page.keyboard.down('d');
  await expect.poll(() => page.evaluate(() => window.__strike!.snapshot().x)).toBeGreaterThan(start.x + 60);
  await page.keyboard.up('d');
  await page.getByRole('button', { name: '暂停' }).click();
  const paused = await page.evaluate(() => window.__strike!.snapshot());
  await page.waitForTimeout(120);
  expect((await page.evaluate(() => window.__strike!.snapshot())).time).toBe(paused.time);
  await page.getByRole('button', { name: '单步' }).click();
  await expect.poll(() => page.evaluate(() => window.__strike!.snapshot().time)).toBeGreaterThan(paused.time);
  const stepped = await page.evaluate(() => window.__strike!.snapshot());
  expect(stepped.time - paused.time).toBeCloseTo(1 / 120, 5);
  await page.getByRole('button', { name: '重置士兵' }).click();
  const reset = await page.evaluate(() => window.__strike!.snapshot());
  expect(reset.vx).toBe(0); expect(reset.vy).toBe(0); expect(reset.x).toBe(180);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: '暂停' }).click();
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width * .38, canvas!.y + canvas!.height * .72);
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'test-results/movement-lab.png', fullPage: true });
});
test('standing jump records expected apex and airtime through actual Arcade physics', async ({ page }) => {
  const sample = await page.evaluate(() => {
    const s = window.__strike!; s.paused = true; s.reset(0);
    for (let i = 0; i < 5; i++) s.simulate({ axis: 0, jumpPressed: false, drop: false });
    s.simulate({ axis: 0, jumpPressed: true, drop: false });
    for (let i = 0; i < 100; i++) s.simulate({ axis: 0, jumpPressed: false, drop: false });
    return s.snapshot();
  });
  expect(sample.measurement!.heightPx).toBeGreaterThan(85);
  expect(sample.measurement!.heightPx).toBeLessThan(92);
  expect(sample.measurement!.apexMs).toBeGreaterThan(330);
  expect(sample.measurement!.airtimeMs).toBeGreaterThan(670);
  expect(sample.measurement!.airtimeMs).toBeLessThan(710);
  expect(sample.grounded).toBe(true);
});
test('traverses 8/16 px ledges, rejects 28 px, supports jumping over it', async ({ page }) => {
  const result = await page.evaluate(() => {
    const s = window.__strike!; s.paused = true; s.reset(1);
    for (let i = 0; i < 220; i++) s.simulate({ axis: 1, jumpPressed: false, drop: false });
    const blocked = s.snapshot();
    s.simulate({ axis: 1, jumpPressed: true, drop: false });
    for (let i = 0; i < 80; i++) s.simulate({ axis: 1, jumpPressed: false, drop: false });
    return { blocked, after: s.snapshot() };
  });
  expect(result.blocked.x).toBeGreaterThan(790);
  expect(result.blocked.x).toBeLessThan(840);
  expect(result.after.x).toBeGreaterThan(950);
});
test('drops through a one-way platform and lands on ground; gap fall resets', async ({ page }) => {
  const result = await page.evaluate(() => {
    const s = window.__strike!; s.paused = true; s.reset(3);
    for (let i = 0; i < 10; i++) s.simulate({ axis: 0, jumpPressed: false, drop: false });
    const onPlatform = s.snapshot();
    for (let i = 0; i < 80; i++) s.simulate({ axis: 0, jumpPressed: false, drop: i < 20 });
    const onGround = s.snapshot();
    s.reset(2); s.soldier.reset(1370, 620);
    for (let i = 0; i < 90; i++) s.simulate({ axis: 0, jumpPressed: false, drop: false });
    return { onPlatform, onGround, reset: s.snapshot() };
  });
  expect(result.onPlatform.y).toBeCloseTo(496, 0);
  expect(result.onGround.y).toBeCloseTo(581, 0);
  expect(result.onGround.grounded).toBe(true);
  expect(result.reset.x).toBe(1130);
  expect(result.reset.vx).toBe(0);
});
test('same scripted input has identical outcome at 30, 60 and 144 display Hz', async ({ page }) => {
  const results = await page.evaluate(() => {
    const s = window.__strike!;
    return [30, 60, 144].map(hz => {
      s.reset(0); s.paused = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      for (let frame = 0; frame < hz; frame++) {
        s.update(0, 1000 / hz);
      }
      s.paused = true;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      return s.snapshot();
    });
  });
  expect(results[0].x).toBeCloseTo(results[1].x, 8);
  expect(results[1].x).toBeCloseTo(results[2].x, 8);
});
test('running jump crosses the gap and air input reverses horizontal velocity', async ({ page }) => {
  const result = await page.evaluate(() => {
    const s = window.__strike!; s.paused = true; s.reset(2);
    for (let i = 0; i < 60; i++) s.simulate({ axis: 1, jumpPressed: false, drop: false });
    const takeoff = s.snapshot();
    s.simulate({ axis: 1, jumpPressed: true, drop: false });
    for (let i = 0; i < 86; i++) s.simulate({ axis: 1, jumpPressed: false, drop: false });
    const landing = s.snapshot();
    s.reset(0);
    for (let i = 0; i < 20; i++) s.simulate({ axis: 1, jumpPressed: false, drop: false });
    s.simulate({ axis: 1, jumpPressed: true, drop: false });
    for (let i = 0; i < 45; i++) s.simulate({ axis: -1, jumpPressed: false, drop: false });
    return { takeoff, landing, steering: s.snapshot() };
  });
  expect(result.takeoff.x).toBeLessThan(1280);
  expect(result.landing.x).toBeGreaterThan(1460);
  expect(result.landing.grounded).toBe(true);
  expect(result.landing.measurement!.distancePx).toBeGreaterThan(190);
  expect(result.steering.vx).toBeLessThan(0);
  expect(result.steering.grounded).toBe(false);
});
test('tuning, defaults, aim, slow motion and JSON export work through UI', async ({ page }) => {
  const speed = page.getByRole('slider', { name: '最大速度' });
  await speed.fill('400');
  expect(await page.evaluate(() => window.__strike!.config.maxRunSpeed)).toBe(400);
  await page.getByRole('button', { name: '恢复默认参数' }).click();
  expect(await page.evaluate(() => window.__strike!.config.maxRunSpeed)).toBe(290);
  await page.getByRole('button', { name: '慢速' }).click();
  expect(await page.evaluate(() => window.__strike!.slow)).toBe(true);
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + 20, canvas!.y + canvas!.height * .65);
  await expect.poll(() => page.evaluate(() => Math.cos(window.__strike!.soldier.aimAngle))).toBeLessThan(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出实验 JSON' }).click();
  expect((await download).suggestedFilename()).toBe('strike-movement-measurement.json');
});
