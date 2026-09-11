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
    await expect(page.locator('#online-loadout')).toBeVisible();
    await expect(page.locator('#online-ready')).toHaveCount(0);
    await page.locator('canvas').click(); await page.keyboard.press('q');
    await expect(page.locator('#online-hud')).toContainText('USP');
    await page.goto('about:blank');
    await expect.poll(() => server.rooms.get('debug')?.players.size).toBe(0);
    expect(server.rooms.has('debug')).toBe(true);
  } finally { await server.close(); }
});

test('debug loadout controls switch class, weapons, skill and item live and survive reconnect', async ({ page }) => {
  const server = startServer(0, '127.0.0.1', 30000, undefined, 60000, true);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await page.locator('#join-debug').click();
    await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#online-class')).toHaveValue('medic');
    await page.locator('#online-class').selectOption('tank');
    await expect(page.locator('#online-secondary option[value="knife"]')).toHaveCount(0);
    await page.locator('#online-primary').selectOption('saw');
    await page.locator('#online-secondary').selectOption('blast-shield');
    await page.locator('#online-skill').selectOption('iron');
    await page.locator('#online-item').selectOption('frag');
    const room = server.rooms.get('debug')!, actor = room.session!.battle.player, actorId = actor.id;
    await expect.poll(() => actor.kit).toMatchObject({ classId: 'tank', primary: 'saw', secondary: 'blast-shield', skill: 'iron', item: 'frag' });
    await expect(page.locator('#online-hud')).toContainText('钢铁意志');
    await expect(page.locator('#online-hud')).toContainText('破片手雷');
    // Do not click the canvas to avoid turning a menu interaction into firing.
    await page.locator('h1').click(); await page.keyboard.press('e');
    await expect.poll(() => actor.skillFrames).toBeGreaterThan(0);
    await page.keyboard.press('g'); await expect.poll(() => actor.itemCharges).toBe(1);
    await page.keyboard.press('q'); await expect(page.locator('#online-hud')).toContainText('防爆盾');
    expect(actor.arsenal.shots).toBe(0);
    await page.screenshot({ path: 'artifacts/qa/debug-loadout.png' });
    [...server.wss.clients][0].terminate(); await expect(page.locator('#status')).toContainText('连接已断开');
    await page.locator('#reconnect').click(); await expect(page.locator('#status')).toContainText('公共调试房间');
    await expect(page.locator('#online-skill')).toHaveValue('iron');
    await expect(page.locator('#online-secondary')).toHaveValue('blast-shield');
    expect(room.session!.battle.player.id).toBe(actorId);
    await page.locator('#online-class').selectOption('assassin');
    await expect(page.locator('#online-skill')).toHaveValue('focus');
    await expect(page.locator('#online-secondary')).toHaveValue('usp');
    await expect(page.locator('#online-secondary option[value="shield"]')).toHaveCount(0);
    await page.locator('#online-secondary').selectOption('katana');
    await page.locator('#online-skill').selectOption('cloak');
    await expect.poll(() => actor.offhand?.id).toBe('katana');
    await expect.poll(() => actor.skillCooldown).toBe(0);
    expect(actor.skillFrames).toBe(0); expect(actor.life.health).toBe(70);
    expect(room.session!.battle.result).toBeNull(); expect(errors).toEqual([]);
  } finally { await server.close(); }
});
