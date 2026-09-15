import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';

test('longshot is selectable and starts an eight-player control match', async ({ page }) => {
  await page.goto('/?offline'); await enterOffline(page);
  await page.locator('#custom-map').selectOption('longshot');
  await expect(page.locator('#custom-map-preview svg')).toHaveAttribute('viewBox', '0 0 4800 1080');
  await page.locator('#custom-map-preview').screenshot({ path: 'artifacts/qa/longshot-preview.png' });
  await page.locator('#custom-mode').selectOption('dom');
  await page.locator('#custom-start').click();
  await page.waitForFunction(() => window.__strikeCampaign!.battle.frame > 10);
  await expect(page.locator('#mission-label')).toHaveText('荒原 · 长线狙击');
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.actors.length)).toBe(8);
  await page.screenshot({ path: 'artifacts/qa/longshot-battle.png' });
});

test('longshot runs in the growth laboratory with the shared online renderer', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?rules=lab');
  await page.locator('#offline-growth-map').selectOption('longshot');
  await page.locator('#offline-growth-start').click();
  await expect(page.locator('#online-game canvas')).toBeVisible();
  await expect(page.locator('[data-hud=clock]')).not.toHaveText('15:00');
  await page.screenshot({ path: 'artifacts/qa/longshot-lab.png' });
  await page.locator('#offline-growth-leave').click();
  await expect(page.locator('#offline-setup')).toBeVisible();
  expect(errors).toEqual([]);
});
