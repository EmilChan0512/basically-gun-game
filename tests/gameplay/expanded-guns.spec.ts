import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
test('selects expanded guns online and preserves automatic versus semi-auto input behavior', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('Missing port');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await page.locator('#create').click(); await expect(page.locator('#online-mode')).toBeVisible();
    await page.locator('#online-mode').selectOption('coop');
    await page.locator('#online-primary').selectOption('ak47');
    await page.locator('#online-secondary').selectOption('deagle');
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#online-hud')).toContainText('AK47');
    const battle = [...server.rooms.values()][0].session!.battle;
    await page.mouse.move(900, 450); await page.mouse.down();
    await expect.poll(() => battle.player.arsenal.shots).toBeGreaterThanOrEqual(3);
    await page.mouse.up(); await page.keyboard.press('q');
    await expect(page.locator('#online-hud')).toContainText('DEAGLE');
    const before = battle.player.arsenal.shots;
    await page.mouse.down(); await expect.poll(() => battle.player.arsenal.shots).toBe(before + 1);
    const frame = battle.frame;
    await expect.poll(() => battle.frame).toBeGreaterThan(frame + 20);
    expect(battle.player.arsenal.shots).toBe(before + 1);
    expect(battle.player.arsenal.gun.ammo).toBe(6);
    await page.screenshot({ path: 'artifacts/qa/expanded-guns-deagle.png' });
    await page.mouse.up(); await page.mouse.down();
    await expect.poll(() => battle.player.arsenal.shots).toBe(before + 2);
    await page.mouse.up(); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
