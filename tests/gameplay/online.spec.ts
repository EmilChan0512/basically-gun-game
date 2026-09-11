import { registerOnline } from '../helpers/online-account';
import { test, expect } from '@playwright/test';
import { startServer } from '../../server/server';

test('two isolated browsers create, join, ready, start and independently switch weapons', async ({ browser }) => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [];
  try {
    for (const [i, page] of pages.entries()) {
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
      await page.locator('#name').fill(`Pilot ${i}`); await registerOnline(page, `Pilot ${i}`);
    }
    await pages[0].locator('#create').click();
    await expect(pages[0].locator('#status')).toContainText('房间码');
    const code = (await pages[0].locator('#status').innerText()).split(' ')[1];
    await pages[1].locator('#code').fill(code); await pages[1].locator('#join').click();
    for (const page of pages) { await expect(page.locator('#status')).toContainText('2/8'); await page.locator('#online-ready').click(); }
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) { await expect(page.locator('canvas')).toBeVisible(); await expect(page.locator('#online-hud')).toContainText('M4'); }
    for (const page of pages) await expect(page.locator('#lobby')).toBeHidden();
    const spectatorContext = await browser.newContext(); contexts.push(spectatorContext);
    const spectator = await spectatorContext.newPage(); pages.push(spectator);
    spectator.on('pageerror', e => errors.push(e.message));
    await spectator.goto('/?online'); await spectator.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await registerOnline(spectator, 'Spectator'); await spectator.locator('#name').fill('Spectator'); await spectator.locator('#code').fill(code); await spectator.locator('#join').click();
    await expect(spectator.locator('#online-hud')).toContainText('观战中');
    await expect(spectator.locator('canvas')).toBeVisible();
    await spectator.locator('canvas').click(); await spectator.keyboard.press('q'); await spectator.keyboard.press('Tab');
    expect([...server.rooms.values()][0].session!.battle.actors).toHaveLength(2);
    await pages[1].locator('canvas').click(); await pages[1].keyboard.press('q');
    await expect(pages[1].locator('#online-hud')).toContainText('USP');
    await expect(pages[0].locator('#online-hud')).toContainText('M4');
    await contexts[1].setOffline(true);
    // Terminate the matching transport as an interrupted network connection, without touching match state.
    const pilot = [...server.rooms.values()][0].players;
    const id = [...pilot.values()].find(p => p.name === 'Pilot 1')!.id;
    // Both connections were created in order; server WebSocket clients preserve insertion order.
    [...server.wss.clients][1].terminate();
    await contexts[1].setOffline(false);
    await expect(pages[1].locator('#status')).toContainText('连接已断开');
    await pages[1].locator('#reconnect').click();
    await expect(pages[1].locator('#status')).toContainText('房间码');
    await expect(pages[1].locator('#lobby')).toBeHidden();
    await expect.poll(() => [...server.rooms.values()][0].players.get(id)?.connected).toBe(true);
    await pages[1].locator('canvas').click(); await pages[1].keyboard.press('q');
    await expect(pages[1].locator('#online-hud')).toContainText('M4');
    // Deterministic terminal fixture isolates the room lifecycle from combat duration.
    [...server.rooms.values()][0].session!.battle.endMatch(1, 'lifecycle fixture');
    await expect(pages[0].locator('#lobby')).toBeVisible();
    await pages[0].locator('#online-return').click();
    for (const page of pages) await expect(page.locator('#online-ready')).toBeVisible();
    for (const page of pages) await expect(page.locator('#lobby')).toBeVisible();
    await pages[0].locator('#online-map').selectOption('signal');
    await pages[0].locator('#online-mode').selectOption('dom');
    for (const page of pages) await page.locator('#online-ready').click();
    await expect(pages[0].locator('#lobby')).not.toContainText('未准备');
    await pages[0].locator('#online-start').click();
    for (const page of pages) { await expect(page.locator('canvas')).toBeVisible(); await expect(page.locator('#online-hud')).toContainText('M4'); }
    expect([...server.rooms.values()][0].round).toBe(2);
    expect([...server.rooms.values()][0].mapId).toBe('signal');
    expect([...server.rooms.values()][0].session!.battle.actors).toHaveLength(3);
    expect([...server.wss.clients].every(socket => socket.extensions.includes('permessage-deflate'))).toBe(true);
    await pages[1].screenshot({ path: 'artifacts/qa/online-two-clients.png' });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); await server.close(); }
});
