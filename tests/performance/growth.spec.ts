import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { awardGrowth } from '../../src/shared/simulation/Growth';

test('production growth: eight clients, private offers and simulation budget', async ({ page }) => {
  test.setTimeout(90000);
  expect(JSON.parse(readFileSync('artifacts/project-strike-local/manifest.json', 'utf8')).contentVersion).toBe(CONTENT_VERSION);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const url = `ws://127.0.0.1:${address.port}`, sockets: WebSocket[] = [], errors: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined, snapshots = 0, maxBytes = 0, leakage = false;
  const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(url); await registerOnline(page, 'Growth render');
    await page.locator('#create-growth').click(); await expect(page.locator('#online-ready')).toBeVisible();
    const room = [...server.rooms.values()][0];
    for (let i = 0; i < 7; i++) {
      const socket = new WebSocket(url); sockets.push(socket);
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'probe') send(socket, { type: 'probeReply', nonce: message.nonce });
        if (message.type === 'error' || message.type === 'rejected') errors.push(JSON.stringify(message));
        if (message.type === 'state') {
          snapshots++; maxBytes = Math.max(maxBytes, raw.toString().length);
          leakage ||= message.state.actors.some((a: Record<string, unknown>) => a.growth && ('offer' in (a.growth as object) || 'selected' in (a.growth as object)));
        }
      });
      await new Promise<void>(resolve => socket.once('open', resolve)); await authorizeSocket(server, socket, `Growth load ${i}`);
      send(socket, { type: 'join', code: room.id, name: `Load ${i}` });
      await expect.poll(() => room.players.size).toBe(i + 2); send(socket, { type: 'ready', ready: true });
    }
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('canvas')).toBeVisible();
    const battle = room.session!.battle;
    for (const actor of battle.actors) awardGrowth(actor.growth!, 1200, seededRandom(2), battle.frame);
    await expect(page.locator('[data-upgrade]')).toHaveCount(3);
    let sequence = 0;
    timer = setInterval(() => {
      for (const socket of sockets) send(socket, { type: 'input', roomId: room.id, round: room.round,
        command: { sequence, input: idleInput(), actions: [] } });
      sequence++;
    }, 1000 / 30);
    const frame = battle.frame;
    const cadence = await page.evaluate(async () => {
      const times: number[] = [];
      await new Promise<void>(resolve => {
        const start = performance.now(); let previous = start;
        const sample = (now: number) => { times.push(now - previous); previous = now;
          if (now - start >= 15000) resolve(); else requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      });
      times.shift(); times.sort((a, b) => a - b);
      return { samples: times.length, p95Ms: times[Math.floor(times.length * .95)], p99Ms: times[Math.floor(times.length * .99)] };
    });
    const report = { content: CONTENT_VERSION, date: new Date().toISOString(), cadence, server: server.metrics(),
      simulationFrames: battle.frame - frame, snapshots, maxMessageCharacters: maxBytes, leakage, errors,
      scope: 'Windows production Chromium: one rendered client and seven authenticated WebSocket clients, eight pending level-5 choices; idle movement. Does not establish combat saturation, cross-device FPS or human playtest acceptance.' };
    mkdirSync('artifacts/qa', { recursive: true }); writeFileSync('artifacts/qa/growth-performance.json', JSON.stringify(report, null, 2));
    await page.screenshot({ path: 'artifacts/qa/growth-performance.png', fullPage: true });
    expect(errors).toEqual([]); expect(leakage).toBe(false); expect(snapshots).toBeGreaterThan(1000);
    expect(battle.frame - frame).toBeGreaterThan(400); expect(server.metrics().p95).toBeLessThan(33.34);
  } finally { if (timer) clearInterval(timer); for (const socket of sockets) socket.terminate(); await server.close(); }
});
