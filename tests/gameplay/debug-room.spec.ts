import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
test('public room exists at startup and one browser joins without a code or ready step', async ({ page }) => {
  const server = startServer(0, '127.0.0.1', 20, undefined, 60000, true);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  try {
    expect(server.rooms.has('debug')).toBe(true);
    await page.goto('/?online');
    await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await page.locator('#join-debug').click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#status')).toContainText('公共调试房间 · 无时限');
    await expect(page.locator('#lobby')).toBeHidden();
    await page.locator('canvas').click(); await page.keyboard.press('q');
    await expect(page.locator('#online-hud')).toContainText('USP');
    await page.goto('about:blank');
    await expect.poll(() => server.rooms.get('debug')?.players.size).toBe(0);
    expect(server.rooms.has('debug')).toBe(true);
  } finally { await server.close(); }
});
