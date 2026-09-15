import { expect, test } from '@playwright/test';
import { exerciseOfflineGrowth } from '../helpers/offline-growth';
import { defaultGrowthLoadoutV3 } from '../helpers/legacyGrowthLoadout';
import { changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';

test('offline entry saves an exclusive build and plays, pauses and restarts without a WebSocket', async ({ page }) => {
  test.setTimeout(60000);
  await exerciseOfflineGrowth(page);
});

test('old offline equipment migrates and each skill offers only its matching class specialization', async ({ page }) => {
  const old = changeGrowthAbility(defaultGrowthLoadoutV3('tank'), 'tk_shield'); old.primary = 'shotgun';
  await page.goto('/?offline');
  await page.evaluate(value => localStorage.setItem('strike.offline.growth.loadout.v3', JSON.stringify(value)), old);
  await page.goto('/?offline&growth');
  await expect(page.locator('#offline-growth-notice')).toContainText('武器与改装已保留');
  await expect(page.locator('[data-growth-weapon="shotgun"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#growth-tab-perks').click();
  await expect(page.locator('[data-growth-option]')).toHaveCount(5);
  await expect(page.locator('[data-growth-option="tk_siege"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-option="as_ambush"]')).toHaveCount(0);
  await page.locator('#growth-tab-skills').click();
  await page.locator('[data-growth-ability="tk_barrier"]').click();
  await page.locator('#growth-tab-perks').click();
  await expect(page.locator('[data-growth-option="tk_fortress"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-option="tk_siege"]')).toHaveCount(0);
  await page.locator('[data-growth-option="tk_steel"]').click();
  await page.locator('[data-growth-option="tk_revenge"]').click();
  await page.locator('#growth-career-save').click();
  await page.screenshot({ path: 'artifacts/qa/class-perks-offline.png', fullPage: true });
  const backup = await page.evaluate(() => localStorage.getItem('strike.offline.growth.loadout.v3.perk-archive'));
  expect(JSON.parse(backup!)).toEqual(old);
  await page.reload(); await page.locator('#growth-tab-perks').click();
  await expect(page.locator('[data-growth-option="tk_steel"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-growth-option="tk_revenge"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#growth-tab-pool').click();
  await expect(page.locator('[data-growth-option="tk_A1"]')).toContainText('移动速度提高15%');
  await expect(page.locator('[data-growth-option="tk_G2"]')).toContainText('掩体300耐久');
  await page.screenshot({ path: 'artifacts/qa/empowered-growth-pool.png', fullPage: true });
});
