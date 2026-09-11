import { test, expect } from '@playwright/test';
import { registerTestAccount } from '../helpers/account-ui';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__strikeCampaign);
  await registerTestAccount(page);
});

test('menu, briefing, real keyboard/mouse combat, pause, reload and retry are playable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('heading', { name: '追回失联的信号。' })).toBeVisible();
  await expect(page.locator('[data-mission="1"]')).toBeDisabled();
  await page.screenshot({ path: 'test-results/campaign-menu.png', fullPage: true });
  await page.getByRole('button', { name: '开始行动', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入战斗' })).toBeVisible();
  await page.locator('#difficulty').selectOption('easy');
  await page.getByRole('button', { name: '进入战斗' }).click();
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.movement.x > 350);
  await page.keyboard.up('d');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.movement.jumping);
  await page.waitForFunction(() => !window.__strikeCampaign!.battle.player.movement.jumping);
  const rect = await page.locator('canvas').boundingBox();
  await page.mouse.move(rect!.x + rect!.width * 0.75, rect!.y + rect!.height * 0.7);
  await page.mouse.down();
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.arsenal.shots >= 3);
  await page.mouse.up();
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.arsenal.gun.cooldownFrames === 0);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.arsenal.gun.reloadFrames > 0);
  await page.keyboard.press('Escape');
  const state = await page.evaluate(() => window.__strikeCampaign!.battle.snapshot());
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.snapshot())).toEqual(state);
  await page.getByRole('button', { name: '继续战斗' }).click();
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.arsenal.gun.reloadFrames === 0);
  await page.keyboard.press('q');
  await expect(page.locator('#player-ammo')).toContainText('USP');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: '继续战斗' })).toBeVisible();
  await page.getByRole('button', { name: '重试本关', exact: true }).click();
  await expect(page.locator('#blue-score')).toHaveText('0');
  await expect(page.locator('#player-ammo')).toContainText('M4');
  await page.keyboard.press('Escape');
  await page.locator('#pause-home').click();
  await expect(page.locator('[data-mission="1"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('four missions reach results, unlock, persist across reload, and show the ending using legal simulated input', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#continue-campaign').click();
  for (let index = 0; index < 4; index++) {
    await page.locator('#deploy').click();
    // Advance ordinary player input through the real battle, with no HP/score/AI overrides.
    const outcome = await page.evaluate(async () => {
      const modulePath = '/tests/helpers/campaign-pilot.ts';
      const { pilot } = await import(modulePath);
      const b = window.__strikeCampaign!.battle;
      while (b.phase === 'running') b.tick(pilot(b));
      return b.snapshot();
    });
    expect(outcome.phase, JSON.stringify(outcome)).toBe('won');
    await expect(page.getByRole('heading', { name: '行动成功', exact: true })).toBeVisible();
    if (index === 1) {
      await page.reload();
      await page.waitForFunction(() => !!window.__strikeCampaign);
      await expect(page.locator('[data-mission="2"]')).toBeEnabled();
      await expect(page.locator('[data-mission="3"]')).toBeDisabled();
      await expect(page.locator('#save-status')).toHaveText('本地进度 2 / 4');
      await page.locator('#continue-campaign').click();
    } else await page.locator('#next-mission').click();
  }
  await expect(page.getByRole('heading', { name: '信号再次响起。' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('本地进度 4 / 4');
  await page.screenshot({ path: 'test-results/campaign-ending.png', fullPage: true });
  await page.locator('#ending-home').click();
  await expect(page.locator('[data-mission="3"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('inaction produces failure and retry resets the battle without unlocking progress', async ({ page }) => {
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await page.evaluate(async () => {
    const path = '/src/game/campaign/Battle.ts'; const { idleInput } = await import(path);
    const b = window.__strikeCampaign!.battle;
    while (b.phase === 'running') b.tick(idleInput());
  });
  await expect(page.getByRole('heading', { name: '行动未完成' })).toBeVisible();
  await expect(page.locator('#next-mission')).toHaveCount(0);
  await expect(page.locator('#save-status')).toHaveText('本地进度 0 / 4');
  await page.locator('#result-retry').click();
  await expect(page.locator('#red-score')).toHaveText('0');
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.player.life.deaths)).toBe(0);
  await page.screenshot({ path: 'test-results/campaign-battle.png', fullPage: true });
});
