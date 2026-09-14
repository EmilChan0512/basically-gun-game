import { expect, type Page } from '@playwright/test';

export async function exerciseOfflineGrowth(page: Page, screenshot = 'growth-v3-offline.png') {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.WebSocket = class { constructor() { throw Error('Offline must not create WebSocket'); } static OPEN = 1; } as unknown as typeof WebSocket;
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.goto('/?offline'); await page.locator('#offline-growth-nav').click();
  await page.locator('[data-growth-class=sniper]').click(); await page.locator('#growth-tab-skills').click();
  await page.locator('[data-growth-ability=sn_relocate]').click(); await page.locator('[data-growth-gadget=sn_emp]').click();
  await page.locator('#growth-career-save').click();
  await expect(page.locator('[data-growth-save-status]')).toHaveText('离线配装已保存在本机。');
  const saved = await page.evaluate(() => localStorage.getItem('strike.offline.growth.loadout.v3'));
  await page.reload(); await page.locator('#growth-tab-skills').click();
  await expect(page.locator('[data-growth-gadget=sn_emp]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#offline-growth-map').selectOption('hijack');
  await page.locator('#offline-growth-preset').selectOption('short');
  await page.locator('#offline-growth-start').click();
  await expect(page.locator('[data-hud=mode]')).toContainText('10分钟实验');
  await expect(page.locator('[data-hud=health]')).toContainText('90 / 90 HP');
  await page.locator('#online-game canvas').click();
  await expect(page.locator('[data-hud=clock]')).not.toHaveText('10:00');
  await page.keyboard.press('g'); await expect(page.locator('[data-hud=ability]')).toContainText('EMP弹 ×1');
  await page.keyboard.press('e'); await expect(page.locator('[data-hud=cooldown]')).toContainText('冷却');
  await page.locator('#offline-growth-pause').click();
  await expect(page.locator('#offline-growth-status')).toContainText('训练已暂停');
  const clock = await page.locator('[data-hud=clock]').textContent();
  await page.waitForTimeout(1100); await expect(page.locator('[data-hud=clock]')).toHaveText(clock!);
  await page.screenshot({ path: 'artifacts/qa/' + screenshot });
  await page.locator('#offline-growth-pause').click(); await expect(page.locator('[data-hud=clock]')).not.toHaveText(clock!);
  await page.locator('#offline-growth-leave').click(); await expect(page.locator('#offline-setup')).toBeVisible();
  await expect(page.locator('#online-game canvas')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('strike.offline.growth.loadout.v3'))).toBe(saved);
  await page.locator('#offline-growth-start').click(); await expect(page.locator('[data-hud=ability]')).toContainText('EMP弹 ×2');
  await expect(page.locator('.tactical-hud')).toHaveCount(1);
  expect(external).toEqual([]); expect(errors).toEqual([]);
}
