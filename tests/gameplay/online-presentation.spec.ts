import { registerOnline } from '../helpers/online-account';
import { test, expect } from '@playwright/test';
import { WebSocket, WebSocketServer } from 'ws';
import { startServer } from '../../server/server';
import { writeFileSync, mkdirSync } from 'node:fs';

test('moving client renders smoothly through latency and keeps camera aligned with the sprite', async ({ page }) => {
  const server = startServer(0);
  await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const proxy = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>(r => proxy.once('listening', r));
  const proxyAddress = proxy.address(); if (!proxyAddress || typeof proxyAddress === 'string') throw Error('No proxy port');
  const timers = new Set<ReturnType<typeof setTimeout>>(), upstreams: WebSocket[] = [];
  proxy.on('connection', downstream => {
    const upstream = new WebSocket(`ws://127.0.0.1:${address.port}`); upstreams.push(upstream);
    const pending: string[] = [];
    const delayed = (target: WebSocket) => {
      let last = 0, count = 0;
      return (data: WebSocket.RawData) => {
        // Ordered transport with 60–120ms one-way delay, in both directions.
        const due = Math.max(last + 1, Date.now() + [60, 100, 80, 120][count++ % 4]); last = due;
        const timer = setTimeout(() => { timers.delete(timer); if (target.readyState === WebSocket.OPEN) target.send(data.toString()); }, due - Date.now());
        timers.add(timer);
      };
    };
    const send = delayed(upstream);
    downstream.on('message', data => upstream.readyState === WebSocket.OPEN ? send(data) : pending.push(data.toString()));
    upstream.on('open', () => pending.forEach(data => send(Buffer.from(data))));
    upstream.on('message', delayed(downstream));
    downstream.on('close', () => upstream.terminate());
    upstream.on('error', () => downstream.terminate());
  });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(`ws://127.0.0.1:${proxyAddress.port}`);
    await registerOnline(page, 'Online Pilot');
    await page.locator('#create').click(); await expect(page.locator('#online-mode')).toBeVisible();
    await page.locator('#online-mode').selectOption('coop');
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('#online-game')).toHaveAttribute('aria-busy', 'false');
    // Observe the actual sprite/camera path without adding production test hooks.
    await page.evaluate(async () => {
      const modulePath = '/src/game/campaign/ReferenceArt.ts';
      const { ReferenceArt } = await import(modulePath);
      const original = ReferenceArt.prototype.soldier;
      (window as any).__presentationSamples = [];
      let moving=false;
      window.addEventListener('keydown',event=>{if(event.code==='KeyD')moving=true;});
      window.addEventListener('keyup',event=>{if(event.code==='KeyD')moving=false;});
      ReferenceArt.prototype.soldier = function (...args: any[]) {
        if (this.cursor === 0) {
          const camera = this.scene.cameras.main;
          (window as any).__presentationSamples.push({ time: performance.now(), moving, x: args[0], y: args[1], scrollX: camera.scrollX,
            cameraError: args[0] - camera.scrollX - camera.width / 2 });
        }
        return original.apply(this, args);
      };
    });
    const battle = [...server.rooms.values()][0].session!.battle;
    // Place a living observer in an open part of the map, away from camera bounds.
    battle.player.movement.reset(1300, 350); battle.player.life.health = 10000;
    await page.waitForTimeout(600);
    await page.locator('canvas').click(); await page.keyboard.down('d');
    await page.waitForTimeout(1000); await page.keyboard.up('d');
    // Include acknowledgement and visual convergence after releasing movement.
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'artifacts/qa/online-vision-latency.png' });
    const samples = await page.evaluate(() => (window as any).__presentationSamples as { time: number; moving:boolean; x: number; y: number; scrollX: number; cameraError: number }[]);
    // Exclude camera clamping, where the player correctly moves away from center.
    const tracking = samples.filter(s => s.x > 600 && s.x < 2200 && s.scrollX > 1);
    mkdirSync('artifacts/qa', { recursive: true });
    writeFileSync(`artifacts/qa/online-presentation-samples-${Date.now()}.json`, JSON.stringify({samples,tracking,
      backwards:tracking.slice(1).flatMap((s,i)=>s.x<tracking[i].x-.1?[{before:tracking[i],after:s}]:[])},null,2));
    expect(tracking.length).toBeGreaterThan(15);
    expect(Math.max(...tracking.map(s => Math.abs(s.cameraError)))).toBeLessThan(0.01);
    // Continuous forward input must remain monotonic. After keyup, prediction
    // can legitimately converge backwards to the stopped authoritative position.
    const moving=tracking.filter(s=>s.moving);
    expect(moving.length).toBeGreaterThan(15);
    expect(Math.max(...moving.map(s => s.x)) - Math.min(...moving.map(s => s.x))).toBeGreaterThan(50);
    expect(moving.slice(1).every((s, i) => s.x >= moving[i].x - 0.1)).toBe(true);
    expect(tracking.at(-1)!.moving).toBe(false);
    expect(Math.abs(tracking.at(-1)!.x-battle.player.movement.x)).toBeLessThan(0.1);
    expect(errors).toEqual([]);
    mkdirSync('artifacts/qa', { recursive: true });
    writeFileSync('artifacts/qa/online-presentation.json', JSON.stringify({ oneWayDelayMs: [60, 120], samples: tracking,
      maxCameraError: Math.max(...tracking.map(s => Math.abs(s.cameraError))) }, null, 2));
  } finally {
    for (const timer of timers) clearTimeout(timer);
    for (const socket of proxy.clients) socket.terminate();
    for (const socket of upstreams) socket.terminate();
    await new Promise<void>(r => proxy.close(() => r())); await server.close();
  }
});
