import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';

test('gunsmith previews locked parts without changing draft, returns and saves, and fits narrow screens', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); await registerOnline(page, 'Gunsmith pilot');
    await page.locator('#online-armory-nav').click(); await page.locator('#growth-open-gunsmith').click();
    await expect(page.locator('.gunsmith')).toBeVisible(); await expect(page.locator('.smith-parts svg')).toHaveCount(4);
    await page.locator('[data-smith-part="heavy"]').click(); await expect(page.locator('[data-smith-apply]')).toBeDisabled();
    await expect(page.locator('.smith-inspector')).toContainText('还需 200 XP');
    await expect(page.locator('.smith-stat').filter({ hasText: '移动倍率' })).toContainText('95%');
    await page.screenshot({ path: 'artifacts/qa/gunsmith-desktop.png', fullPage: true });
    await page.locator('[data-smith-back]').click(); await expect(page.locator('#growth-open-gunsmith')).toContainText('标准配置');
    await page.locator('#growth-open-gunsmith').click(); await page.locator('[data-smith-category="magazine"]').first().click();
    await expect(page.locator('[data-smith-part]')).toHaveCount(2); await page.locator('[data-smith-part="quickmag"]').click();
    await expect(page.locator('.smith-stat').filter({ hasText: '弹匣容量' })).toContainText('24');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.smith-inspector')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'artifacts/qa/gunsmith-mobile.png', fullPage: true });
    await page.locator('[data-smith-reset]').click(); await page.locator('[data-smith-apply]').click();
    await page.locator('#growth-career-save').click(); await expect(page.locator('[data-growth-save-status]')).toHaveText('配装已由服务器保存。');
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});

test('unlocked gunsmith confirms only the chosen modification and supports cancel', async ({ page }) => {
  await page.goto('/?online');
  await page.evaluate(async () => {
    const path = '/src/client/presentation/Gunsmith.ts', catalog = '/src/shared/content/GrowthCatalog.ts';
    const { gunsmith } = await import(path), { defaultGrowthLoadout } = await import(catalog);
    const host = document.createElement('main'); document.body.replaceChildren(host);
    host.append(gunsmith(defaultGrowthLoadout(), 1000, (id: string) => { host.dataset.confirmed = id; }, () => { host.dataset.cancelled = 'true'; }));
  });
  await page.locator('[data-smith-part="quickmag"]').click();
  await expect(page.locator('[data-smith-apply]')).toBeEnabled();
  await expect(page.locator('main')).not.toHaveAttribute('data-confirmed');
  await page.locator('[data-smith-apply]').click(); await expect(page.locator('main')).toHaveAttribute('data-confirmed', 'quickmag');
  await page.locator('[data-smith-part="heavy"]').click(); await page.locator('[data-smith-back]').click();
  await expect(page.locator('main')).toHaveAttribute('data-cancelled', 'true');
  await expect(page.locator('main')).toHaveAttribute('data-confirmed', 'quickmag');
});
