import { test, expect } from '@playwright/test';
import { registerTestAccount } from '../helpers/account-ui';

for (const id of ['knife', 'shield'] as const) test(`equips and uses ${id} from the real armory`, async ({ page }) => {
  await page.goto('/'); await registerTestAccount(page);
  await page.locator('#edit-loadout').click();
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
  await expect(page.locator('#player-ammo')).toContainText('M4');
  await page.keyboard.press('Escape'); await page.locator('#pause-home').click();
  await page.locator('#edit-loadout').click();
  await expect(page.locator(`[data-offhand="${id}"]`)).toBeDisabled();
});
