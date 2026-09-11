import { test, expect } from '@playwright/test';
import { registerTestAccount } from '../helpers/account-ui';

test('account → purchase → mission rewards → skill and training → equipped combat → logout/login', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await registerTestAccount(page, 'Alpha');
  await page.locator('#armory-nav').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 350');
  await expect(page.locator('[data-weapon="shotgun"]')).toBeDisabled();
  await page.locator('[data-weapon="vector"]').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 150');
  await expect(page.locator('[data-weapon="vector"]')).toHaveText('已装备');
  // Use the familiar M4 for the campaign entry; purchased Vector remains in the arsenal.
  await page.locator('[data-weapon="m4"]').click();
  await page.locator('#armory-back').click();
  await page.locator('#difficulty').selectOption('easy');
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  const outcome = await page.evaluate(async () => {
    const path = '/tests/helpers/campaign-pilot.ts'; const { pilot } = await import(path);
    const b = window.__strikeCampaign!.battle;
    while (b.phase === 'running') { if (b.player.life.health < 50) b.useSkill(); b.tick(pilot(b)); }
    return b.snapshot();
  });
  expect(outcome.phase).toBe('won');
  await expect(page.locator('#reward-summary')).toContainText('职业升至Lv.2');
  await page.locator('#result-armory').click();
  await page.locator('[data-train="vitality"]').click();
  await page.locator('[data-skill="regenerate"]').click();
  await page.locator('[data-weapon="shotgun"]').click();
  await page.locator('[data-item="frag"]').click();
  await expect(page.locator('[data-item="frag"]')).toHaveText('已装备');
  await page.screenshot({ path: 'artifacts/qa/career-armory.png', fullPage: true });
  await page.locator('#armory-back').click(); await page.locator('#next-mission').click(); await page.locator('#deploy').click();
  const equipped = await page.evaluate(() => window.__strikeCampaign!.battle.snapshot().actors[0]);
  expect(equipped).toMatchObject({ classId: 'medic', weapon: 'shotgun', maxHealth: 93, skill: 'regenerate', item: 'frag', itemCharges: 2 });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.skillCooldown > 0);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6);
  await page.keyboard.press('g');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.itemCharges === 1);
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.grenades.length)).toBe(1);
  await page.keyboard.press('Escape');
  const frozen = await page.evaluate(() => window.__strikeCampaign!.battle.snapshot());
  await page.keyboard.press('e'); await page.keyboard.press('g'); await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.snapshot())).toEqual(frozen);
  await page.screenshot({ path: 'artifacts/qa/career-battle.png', fullPage: true });
  await page.locator('#pause-home').click(); await page.locator('#account-nav').click(); await page.locator('#logout').click();
  await page.locator('#account-name').fill('Alpha'); await page.locator('#account-password').fill('wrong-password'); await page.locator('#account-submit').click();
  await expect(page.locator('#account-error')).toContainText('不正确');
  await page.locator('#account-password').fill('test-password-123'); await page.locator('#account-submit').click();
  await expect(page.locator('#continue-campaign')).toBeVisible();
  await page.reload(); await page.locator('#armory-nav').click();
  await expect(page.locator('[data-weapon="shotgun"]')).toHaveText('已装备');
  await expect(page.locator('[data-skill="regenerate"]')).toHaveText('已装备');
  await expect(page.locator('[data-train="vitality"]')).toContainText('1/3');
  expect(errors).toEqual([]);
});

test('second account has separate credits/classes and switching does not leak gear or mission progress', async ({ page }) => {
  await page.goto('/'); await registerTestAccount(page, 'Alpha');
  await page.locator('#armory-nav').click(); await page.locator('[data-class="tank"]').click(); await page.locator('[data-weapon="vector"]').click();
  await page.locator('#armory-back').click(); await page.locator('#account-nav').click(); await page.locator('#logout').click();
  await page.locator('#account-toggle').click(); await registerTestAccount(page, 'Beta');
  await page.locator('#armory-nav').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 350 · 医疗兵 Lv.1');
  await expect(page.locator('[data-weapon="vector"]')).toContainText('购买');
  await page.locator('#armory-back').click(); await page.locator('#account-nav').click(); await page.locator('#logout').click();
  await page.locator('#account-name').fill('Alpha'); await page.locator('#account-password').fill('test-password-123'); await page.locator('#account-submit').click();
  await page.locator('#armory-nav').click(); await expect(page.locator('#career-wallet')).toContainText('军资 150 · 重装兵 Lv.1');
  await expect(page.locator('[data-weapon="vector"]')).toHaveText('已装备');
  await page.locator('#armory-back').click(); await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await page.keyboard.press('e');
  await expect(page.locator('#abilities')).toContainText('装甲屏障：生效中');
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.player.life.maxHealth)).toBe(130);
});

test('guest can enter and play without creating an account', async ({ page }) => {
  await page.goto('/'); await page.locator('#guest-play').click();
  await expect(page.locator('#save-status')).toContainText('不保存');
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#abilities')).toContainText('医疗兵');
  await page.reload(); await expect(page.locator('#account-submit')).toBeVisible();
});
