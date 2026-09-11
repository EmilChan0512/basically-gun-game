import { test, expect } from '@playwright/test';
import { registerTestAccount } from '../helpers/account-ui';

test('packaged production game loads and plays without Internet or development helpers', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await registerTestAccount(page);
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
  expect((await request.get('/%2e%2e%5cpackage.json')).status()).toBe(403);
  expect((await request.post('/')).status()).toBe(405);
});

test('production account, purchased gear, class skill and stored loadout work offline', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/'); await registerTestAccount(page, 'Offline Tank');
  await page.locator('#armory-nav').click(); await page.locator('[data-class="tank"]').click(); await page.locator('[data-weapon="vector"]').click();
  await expect(page.locator('#career-wallet')).toContainText('军资 150');
  await page.reload(); await page.locator('#continue-campaign').click(); await page.locator('#deploy').click();
  await expect(page.locator('#player-health')).toHaveText('生命 130 / 130');
  await expect(page.locator('#player-ammo')).toHaveText('VECTOR  32 / 96');
  await page.keyboard.press('e'); await expect(page.locator('#abilities')).toContainText('装甲屏障：生效中');
  expect(external).toEqual([]);
});
