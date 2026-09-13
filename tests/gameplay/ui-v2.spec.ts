import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';

test('unified armory preserves drafts across rule tabs, exposes skills and stays usable on narrow screens', async ({ page }) => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/') && !response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'UI v2');
    await page.screenshot({ path: 'artifacts/qa/ui-v2-lobby.png', fullPage: true });
    await page.locator('#online-armory-nav').click();
    await page.locator('[data-growth-class="sniper"]').click();
    await page.locator('[data-growth-weapon="scout"]').click();
    await page.locator('#armory-rule-classic').click();
    await page.locator('#tab-skill').click();
    await expect(page.locator('#online-gear-grid')).toBeVisible();
    await page.screenshot({ path: 'artifacts/qa/ui-v2-classic-skills.png', fullPage: true });
    await page.locator('#armory-rule-growth').click();
    await expect(page.locator('#career-growth-class')).toHaveValue('sniper');
    await expect(page.locator('#career-growth-weapon')).toHaveValue('scout');
    for (const tab of ['weapons', 'skills', 'perks', 'pool', 'records']) {
      await page.locator(`#growth-tab-${tab}`).click();
      const images = page.locator('#growth-career-content img');
      await expect.poll(() => images.evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.screenshot({ path: `artifacts/qa/ui-v2-growth-${tab}.png`, fullPage: true });
    }
    await page.locator('#growth-tab-pool').click();
    await page.locator('[data-growth-option="steadyAim"]').uncheck();
    await expect(page.locator('#growth-career-save')).toBeDisabled();
    await page.locator('[data-growth-option="steadyAim"]').check();
    await page.locator('#growth-career-save').click();
    await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `artifacts/qa/ui-v2-growth-${width}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('#growth-career-save')).toBeEnabled();
    }
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
