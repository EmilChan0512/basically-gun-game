import { registerOnline } from '../helpers/online-account';
import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
test('online knife and shield selection, authority actions and reconnect', async ({ browser }) => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('Missing port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage())); const errors: string[] = [];
  try {
    for (const page of pages) { page.on('pageerror', e => errors.push(e.message)); await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`); }
    for (const [i, page] of pages.entries()) await registerOnline(page, `Pilot ${i}`);
    await pages[0].locator('#create').click(); await expect(pages[0].locator('#online-secondary')).toBeVisible();
    const room = [...server.rooms.values()][0];
    await pages[1].locator('#code').fill(room.id); await pages[1].locator('#join').click();
    await pages[0].locator('#online-class').selectOption('assassin');
    await pages[1].locator('#online-class').selectOption('tank');
    await pages[0].locator('#online-secondary').selectOption('knife');
    await pages[1].locator('#online-secondary').selectOption('shield');
    for (const page of pages) await page.locator('#online-ready').click();
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) { await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('#online-hud')).toContainText('M4'); await page.keyboard.press('q'); }
    await expect(pages[0].locator('#online-hud')).toContainText('战术刀');
    await expect(pages[1].locator('#online-hud')).toContainText('防弹盾');
    await pages[1].mouse.move(900, 400); await pages[1].mouse.down();
    await expect(pages[1].locator('#online-hud')).toContainText('防御中');
    await pages[0].mouse.move(900, 400); await pages[0].mouse.down();
    await expect.poll(() => room.session!.battle.player.offhand!.attackSerial).toBe(1);
    await pages[0].mouse.up();
    expect(room.session!.battle.actors.map(a => a.arsenal.shots)).toEqual([0, 0]);
    await pages[1].screenshot({ path: 'artifacts/qa/offhand-online-shield.png' });
    await pages[1].mouse.up();
    [...server.wss.clients][1].terminate();
    await expect(pages[1].locator('#status')).toContainText('连接已断开');
    await pages[1].locator('#reconnect').click();
    await expect(pages[1].locator('#status')).toContainText('房间码');
    await expect(pages[1].locator('#online-hud')).toContainText('防弹盾');
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); await server.close(); }
});
