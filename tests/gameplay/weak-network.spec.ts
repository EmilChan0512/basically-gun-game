import { registerOnline } from '../helpers/online-account';
import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';

test('short clicks fire and tracers disappear during a stopped snapshot stream', async ({ page }) => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(page, 'Online Pilot');
    await page.locator('#create').click(); await expect(page.locator('#online-mode')).toBeVisible();
    await page.locator('#online-mode').selectOption('coop');
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(async () => {
      const path = '/src/client/session/ShotPresentation.ts';
      const { ShotPresentation } = await import(path), original = ShotPresentation.prototype.visible;
      ShotPresentation.prototype.visible = function (now: number) {
        const result = original.call(this, now); (window as any).__liveTracers = result.length; return result;
      };
    });
    const battle = [...server.rooms.values()][0].session!.battle;
    const before = battle.player.arsenal.shots;
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const bounds = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6);
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(() => battle.player.arsenal.shots, { intervals: [10] }).toBe(before + 1);
    await expect.poll(() => page.evaluate(() => (window as any).__liveTracers), { intervals: [10] }).toBeGreaterThan(0);
    const socket = [...server.wss.clients][0], send = socket.send.bind(socket);
    let paused = true;
    socket.send = ((data: string, ...args: any[]) => {
      if (!paused || JSON.parse(data).type !== 'state') (send as any)(data, ...args);
    }) as typeof socket.send;
    await page.waitForTimeout(750);
    expect(await page.evaluate(() => (window as any).__liveTracers)).toBe(0);
    await expect(page.locator('canvas')).toBeVisible();
    expect(battle.player.arsenal.shots).toBe(before + 1);
    paused = false;
    await page.waitForTimeout(150);
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(() => battle.player.arsenal.shots).toBe(before + 2);
    expect(errors).toEqual([]);
  } finally { await server.close(); }
});
