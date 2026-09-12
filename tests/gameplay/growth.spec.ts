import { expect, test } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { awardGrowth } from '../../src/shared/simulation/Growth';
import { seededRandom } from '../../src/game/campaign/Battle';

test('growth room: private cards, refresh, dead selection, reconnect and new round', async ({ browser }) => {
  test.setTimeout(90000);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [];
  try {
    for (const [i, page] of pages.entries()) {
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
      await registerOnline(page, `Growth ${i}`);
    }
    await pages[0].locator('#create-growth').click();
    await expect(pages[0].locator('#status')).toContainText('房间码');
    const room = [...server.rooms.values()][0];
    await pages[1].locator('#code').fill(room.id); await pages[1].locator('#join').click();
    for (const page of pages) {
      await expect(page.locator('#lobby')).toContainText('Assault');
      await page.locator('#online-ready').click();
    }
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    const battle = room.session!.battle, actor = battle.player;
    // Authority fixture advances XP, not a client cheat endpoint; natural kills are unit-tested.
    awardGrowth(actor.growth!, 1200, seededRandom(1), battle.frame);
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    await expect(pages[1].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(0);
    await pages[0].locator('[data-growth-toggle]').click();
    const firstBatch = actor.growth!.offer!.batch;
    await pages[0].locator('[data-growth-reroll]').click();
    await expect(pages[0].locator('[data-growth-reroll]')).toBeDisabled();
    expect(actor.growth!.offer!.batch).not.toBe(firstBatch);
    battle.damage(actor, 10000);
    await pages[0].locator('[data-upgrade]').first().click();
    await expect.poll(() => actor.growth!.selected.length).toBe(1);
    await pages[0].screenshot({ path: 'artifacts/qa/growth-dead-choice.png', fullPage: true });
    const selected = [...actor.growth!.selected], pending = structuredClone(actor.growth!.offer);
    for (const socket of server.wss.clients) socket.terminate();
    for (const page of pages) await expect(page.locator('#status')).toContainText('连接已断开');
    for (const page of pages) await page.locator('#growth-reconnect').click();
    for (const page of pages) await expect(page.locator('#status')).toContainText('房间码');
    await expect(pages[0].locator('[data-upgrade]')).toHaveCount(3);
    expect(actor.growth!.selected).toEqual(selected); expect(actor.growth!.offer).toEqual(pending);
    while (actor.growth!.offer) {
      const before = actor.growth!.selected.length;
      await pages[0].locator('[data-upgrade]').first().click();
      await expect.poll(() => actor.growth!.selected.length).toBe(before + 1);
    }
    battle.endMatch(1, 'growth lifecycle fixture');
    await expect(pages[0].locator('#growth-panel')).toContainText('暂不发放账号成长');
    await pages[0].locator('#online-return').click();
    for (const page of pages) await page.locator('#online-ready').click();
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) await expect(page.locator('#growth-panel')).toContainText('Lv.1');
    expect(room.session!.battle.player.growth!.selected).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await Promise.allSettled(contexts.map(c => c.close())); await server.close(); }
});
