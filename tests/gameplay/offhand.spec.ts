import { SAVE_KEY } from '../../src/game/campaign/Progress';
import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';

for (const id of ['knife', 'shield'] as const) test(`equips and uses ${id} from the real armory`, async ({ page }) => {
  await page.goto('/?offline'); await enterOffline(page);
  await page.locator('#edit-loadout').click();
  await page.locator(`[data-class="${id === 'knife' ? 'assassin' : 'tank'}"]`).click();
  // Test-only saved campaign fixture at the original first offhand unlock level.
  await page.evaluate(({ key, role }) => { const save = JSON.parse(localStorage.getItem(key)!); save.career.classes[role].xp = 160; localStorage.setItem(key, JSON.stringify(save)); }, { key: SAVE_KEY, role: id === 'knife' ? 'assassin' : 'tank' });
  await page.reload(); await page.locator('#edit-loadout').click();
  await page.locator(`[data-offhand="${id}"]`).click();
  await expect(page.locator(`[data-offhand="${id}"]`)).toBeDisabled();
  await page.locator('#armory-back').click();
  await page.locator('#custom-start').click();
  await page.waitForFunction(() => window.__strikeCampaign!.battle.frame > 3);
  await page.keyboard.press('q');
  await expect(page.locator('#player-ammo')).toContainText(id === 'knife' ? '战术刀' : '防弹盾');
  await page.mouse.move(900, 400);
  await page.keyboard.down('f');
  await page.waitForFunction(kind => {
    const view = window.__strikeCampaign!.battle.player.offhand!.view();
    return kind === 'shield' ? view.deployed : view.age >= 0;
  }, id);
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.player.arsenal.shots)).toBe(0);
  expect(await page.evaluate(id => window.__strikeCampaign!.children.list.some(child => {
    const image = child as unknown as { visible: boolean; texture?: { key: string } };
    return image.visible && image.texture?.key === `ref-${id}`;
  }), id)).toBe(true);
  await page.screenshot({ path: `artifacts/qa/offhand-${id}.png` });
  await page.keyboard.up('f');
  await page.waitForFunction(() => window.__strikeCampaign!.battle.player.offhand!.canSwitch);
  await page.keyboard.press('q');
  await expect(page.locator('#player-ammo')).toContainText(id === 'knife' ? 'SCOUT' : 'SHOTGUN');
  await page.keyboard.press('Escape'); await page.locator('#pause-home').click();
  await page.locator('#edit-loadout').click();
  await expect(page.locator(`[data-offhand="${id}"]`)).toBeDisabled();
});
