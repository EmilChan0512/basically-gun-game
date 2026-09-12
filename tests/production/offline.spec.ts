import { test, expect } from '@playwright/test';
import { enterOffline } from '../helpers/offline-ui';

test('packaged production game loads and plays without Internet or development helpers', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?offline');
  await enterOffline(page);
  await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#player-ammo')).toHaveText('M4  30 / 78');
  expect(await page.evaluate(() => window.__strikeCampaign)).toBeUndefined();
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width * 0.7, canvas!.y + canvas!.height * 0.7);
  await page.mouse.down();
  await expect(page.locator('#player-ammo')).not.toHaveText('M4  30 / 78');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.locator('#resume')).toBeVisible();
  await page.locator('#resume').click();
  await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/campaign-offline-production.png', fullPage: true });
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('local server only serves packaged files and rejects write requests', async ({ request }) => {
  const response = await request.get('/'); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('text/html');
  expect((await request.get('/missing.js')).status()).toBe(404);
  for (const path of ['/%2e%2e%5cpackage.json', '/%2e%2e%2fpackage.json', '/assets/%2e%2e%5c%2e%2e%5cpackage.json']) {
    expect((await request.get(path)).status()).toBe(403);
  }
  expect((await request.post('/')).status()).toBe(405);
});

test('offline class, purchased item and saved loadout work without an account', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/?offline'); await enterOffline(page, 'Offline Tank');
  await page.locator('#armory-nav').click(); await page.locator('[data-class="tank"]').click(); await page.locator('[data-item="ammo"]').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 230');
  await page.reload(); await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#player-health')).toHaveText('生命 130 / 130');
  await expect(page.locator('#player-ammo')).toHaveText('SHOTGUN  4 / 12');
  await page.keyboard.press('e'); await expect(page.locator('#abilities')).toContainText('装甲屏障 · 生效中');
  expect(external).toEqual([]);
});
