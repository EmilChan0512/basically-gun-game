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
  await expect(page.locator('#mission-label')).toHaveText('太空站 · 轨道狙击');
  expect(await page.evaluate(() => window.__strikeCampaign!.battle.actors.length)).toBe(8);
  await page.screenshot({ path: 'artifacts/qa/longshot-battle.png' });
  // Freeze only for an art/layout QA overview after the playable match checks above.
  await page.evaluate(() => {
    const scene = window.__strikeCampaign!;
    scene.scene.pause(); scene.cameras.main.removeBounds().setZoom(1120 / 4800).centerOn(2400, 540);
  });
  await page.locator('.campaign-stage canvas').screenshot({ path: 'artifacts/qa/space-station-overview.png' });
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
