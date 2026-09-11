import { registerOnline } from '../helpers/online-account';
import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';

test('delivery lobby, original art, pickup restriction and reconnect use authority state', async ({ browser }) => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [];
  try {
    for (const page of pages) {
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    }
    for (const [i, page] of pages.entries()) await registerOnline(page, `Courier ${i}`);
    await pages[0].locator('#create').click();
    await expect(pages[0].locator('#online-mode')).toBeVisible();
    const room = [...server.rooms.values()][0];
    await pages[1].locator('#code').fill(room.id); await pages[1].locator('#join').click();
    await pages[0].locator('#online-mode').selectOption('ctf');
    for (const page of pages) { await expect(page.locator('#status')).toContainText('2/8'); await page.locator('#online-ready').click(); }
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#online-hud')).toContainText('公文包争夺');
    const battle = room.session!.battle, bases = battle.mission.deliveryBases!;
    await expect(pages[0].locator('#online-radar')).toBeVisible();
    await expect(pages[0].locator('#online-radar [data-objective]')).toHaveCount(2);
    await expect(pages[0].locator(`#online-radar [data-actor="${battle.actors[1].id}"]`)).toHaveCount(0);
    // Controlled pickup positions verify the integration, not natural traversal.
    battle.player.movement.reset(bases[1].x, bases[1].y);
    await expect(pages[0].locator('#online-hud')).toContainText('橙包携带中');
    await expect(pages[0].locator('#online-hud')).toContainText('USP');
    await pages[0].keyboard.press('q');
    await expect(pages[0].locator('#online-hud')).toContainText('USP');
    await pages[0].screenshot({ path: 'artifacts/qa/delivery-carrier.png' });
    [...server.wss.clients][0].terminate();
    await expect(pages[0].locator('#status')).toContainText('连接已断开');
    await pages[0].locator('#reconnect').click();
    await expect(pages[0].locator('#status')).toContainText('房间码');
    await expect(pages[0].locator('#online-hud')).toContainText('橙包携带中');
    expect(battle.snapshot().deliveryTargets!.filter(t => t.carrierId)).toHaveLength(1);
    battle.player.movement.reset(bases[0].x, bases[0].y);
    await expect(pages[0].locator('#online-hud')).toContainText('1 : 0');
    await expect(pages[1].locator('#online-hud')).toContainText('1 : 0');
    await expect(pages[0].locator('#online-hud')).toContainText('M4');
    await expect(pages[0].locator(`#online-radar [data-actor="${battle.actors[1].id}"]`)).toHaveCount(0);
    expect(battle.journal.since(0).filter(e => e.kind === 'objective-delivery')).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); await server.close(); }
});
