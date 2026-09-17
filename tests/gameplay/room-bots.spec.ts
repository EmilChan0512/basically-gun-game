import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';

for (const rules of ['classic', 'growth']) test(`${rules}: host fills bots and friend sees revised team counts`, async ({ page, browser }) => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const context = await browser.newContext(), friend = await context.newPage();
  try {
    for (const [client, name] of [[page, 'Bot host'], [friend, 'Bot friend']] as const) {
      await client.goto('/?online');
      await client.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
      await registerOnline(client, name);
    }
    await page.locator(rules === 'growth' ? '#create-growth' : '#create').click();
    await page.getByLabel(/添加机器人，补齐/).check();
    await expect(page.locator('#online-bot-roster')).toContainText('红队：0 名真人 + 4 名机器人');
    const room = [...server.rooms.values()][0];
    await friend.locator('#code').fill(room.id); await friend.locator('#join').click();
    for (const client of [page, friend]) await expect(client.locator('#online-bot-roster')).toContainText('红队：1 名真人 + 3 名机器人');
    await expect(friend.locator('#online-fill-bots')).toHaveCount(0);
    await page.locator('#online-fill-bots').uncheck();
    await expect(friend.locator('#online-bot-roster')).toHaveCount(0);
    await page.locator('#online-fill-bots').check();
    await page.screenshot({ path: `artifacts/qa/${rules}-room-bots.png` });
    await page.locator('#online-ready').click(); await friend.locator('#online-ready').click();
    await expect.poll(() => [...room.players.values()].every(p => p.ready)).toBe(true);
    await page.locator('#online-start').click();
    await expect(page.locator('canvas')).toBeVisible(); await expect(friend.locator('canvas')).toBeVisible();
    expect(room.session!.battle.actors).toHaveLength(8);
    expect(room.session!.battle.actors.filter(a => !a.human)).toHaveLength(6);
    await page.goto('about:blank'); await friend.goto('about:blank');
  } finally { await context.close(); await server.close(); }
});
