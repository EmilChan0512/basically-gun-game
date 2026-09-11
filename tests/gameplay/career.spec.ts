import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';

test('offline purchase → mission rewards → skill and training → equipped combat → saved progress', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?offline');
  await enterOffline(page, 'Alpha');
  await page.locator('#armory-nav').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 350');
  await expect(page.locator('[data-weapon="shotgun"]')).toHaveCount(0);
  await expect(page.locator('[data-weapon="needler"]')).toBeDisabled();
  await page.locator('[data-item="ammo"]').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 230');
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
  await page.locator('[data-weapon="needler"]').click();
  await page.locator('[data-item="frag"]').click();
  await expect(page.locator('[data-item="frag"]')).toHaveText('已装备');
  await page.screenshot({ path: 'artifacts/qa/career-armory.png', fullPage: true });
  await page.locator('#armory-back').click(); await page.locator('#next-mission').click(); await page.locator('#deploy').click();
  const equipped = await page.evaluate(() => window.__strikeCampaign!.battle.snapshot().actors[0]);
  expect(equipped).toMatchObject({ classId: 'medic', weapon: 'needler', maxHealth: 93, skill: 'regenerate', item: 'frag', itemCharges: 2 });
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
  await page.locator('#pause-home').click();
  await page.reload(); await page.locator('#armory-nav').click();
  await expect(page.locator('[data-weapon="needler"]')).toHaveText('已装备');
  await expect(page.locator('[data-skill="regenerate"]')).toHaveText('已装备');
  await expect(page.locator('[data-train="vitality"]')).toContainText('1/3');
  expect(errors).toEqual([]);
});

test('main entrance uses online identity and single-player enters without login', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#account-register')).toBeVisible();
  await page.getByRole('link', { name: '单机免登录' }).click();
  await expect(page.locator('#continue-campaign')).toBeVisible();
  await expect(page.locator('#account-submit')).toHaveCount(0);
  await page.locator('#armory-nav').click(); await page.locator('[data-class="tank"]').click();
  await page.reload(); await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#player-health')).toContainText('130 / 130');
  await expect(page.locator('#player-ammo')).toContainText('SHOTGUN');
});
