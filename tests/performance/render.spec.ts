import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { startServer } from '../../server/server';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import { idleInput } from '../../src/game/campaign/Battle';

test('production browser frame cadence under 8 player plus 16 AI load', async ({ page, browser }) => {
  expect(JSON.parse(readFileSync('artifacts/project-strike-local/manifest.json', 'utf8')).contentVersion).toBe(CONTENT_VERSION);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const sockets: WebSocket[] = [], errors: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let visibleMin = Infinity, visibleMax = 0, stateCount = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => socket.on('framereceived', event => {
    const message = JSON.parse(event.payload.toString());
    if (message.type === 'state') {
      stateCount++; visibleMin = Math.min(visibleMin, message.state.actors.length);
      visibleMax = Math.max(visibleMax, message.state.actors.length);
    }
    if (message.type === 'error' || message.type === 'rejected') errors.push(JSON.stringify(message));
  }));
  const wait = async (predicate: () => boolean) => {
    const end = Date.now() + 5000;
    while (!predicate()) { if (Date.now() > end) throw Error('Fixture timeout'); await new Promise(r => setTimeout(r, 10)); }
  };
  try {
    await page.goto('/?online');
    await page.locator('#server').fill(`ws://127.0.0.1:${address.port}`);
    await page.locator('#create').click(); await expect(page.locator('#online-mode')).toBeVisible();
    await page.locator('#online-map').selectOption('hijack');
    await page.locator('#online-mode').selectOption('coop');
    const room = [...server.rooms.values()][0];
    const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
    for (let i = 0; i < 7; i++) {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}`); sockets.push(socket);
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'probe') send(socket, { type: 'probeReply', nonce: message.nonce });
        if (message.type === 'error' || message.type === 'rejected') errors.push(JSON.stringify(message));
      });
      await new Promise<void>(resolve => socket.once('open', resolve));
      send(socket, { type: 'join', code: room.id, name: `Render load ${i}` });
      await wait(() => room.players.size === i + 2);
      send(socket, { type: 'ready', ready: true });
    }
    await page.locator('#online-ready').click();
    await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('#lobby')).toBeHidden();
    await page.evaluate(() => scrollTo(0, 0));
    const bounds = await page.locator('canvas').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1080);
    const saved = room.session!.checkpoint();
    saved.battle.mission.seconds = saved.battle.mission.scenario!.seconds = 3600;
    const waves = saved.battle.waves!;
    waves.scenario.seconds = 3600; waves.phase = 'wave'; waves.wave = 1;
    waves.remaining = 0; waves.cooldown = 0; waves.activeCap = 16;
    saved.battle.actors = saved.battle.actors.filter(actor => actor.human);
    for (let i = 0; i < 16; i++) {
      const enemy = structuredClone(saved.battle.actors[i % 8]);
      const spawn = saved.battle.mission.spawns[1][i % saved.battle.mission.spawns[1].length];
      enemy.id = `render-enemy-${i}`; enemy.human = false; enemy.team = 2;
      enemy.movement.x = spawn.x; enemy.movement.y = spawn.y;
      saved.battle.actors.push(enemy);
    }
    for (const actor of saved.battle.actors) actor.life.health = actor.life.maxHealth = 100000;
    room.session = MatchSession.restore(saved);
    const session = room.session, battle = session.battle, tick = session.tick.bind(session);
    let fixtureFrames = 0, saturatedFrames = 0;
    session.tick = () => {
      for (const actor of battle.actors) {
        actor.life.health = actor.life.maxHealth;
        if (actor.movement.y > battle.mission.killY! - 50) {
          const spawn = battle.mission.spawns[actor.team - 1][0]; actor.movement.reset(spawn.x, spawn.y);
        }
        if (actor.arsenal.empty) actor.arsenal.resupply();
      }
      tick(); fixtureFrames++;
      if (battle.actors.filter(actor => actor.life.alive).length === 24) saturatedFrames++;
    };
    let sequence = 0;
    timer = setInterval(() => {
      for (const socket of sockets) send(socket, { type: 'input', roomId: room.id, round: room.round,
        command: { sequence, actions: [], input: { ...idleInput(), fire: sequence % 60 < 40, aim: { x: 1600, y: 700 } } } });
      sequence++;
    }, 1000 / 30);
    await page.locator('canvas').click(); await page.mouse.down();
    await page.waitForTimeout(3000);
    visibleMin = Infinity; visibleMax = 0; stateCount = 0;
    const frameStart = battle.frame;
    const cadence = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas')!;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
      const times: number[] = []; let hidden = 0;
      await new Promise<void>(resolve => {
        const start = performance.now(); let previous = start;
        function sample(now: number) {
          times.push(now - previous); previous = now;
          if (document.hidden) hidden++;
          if (now - start >= 30000) resolve(); else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      times.shift(); // first interval starts between animation frames
      const elapsed = times.reduce((a, b) => a + b, 0); times.sort((a, b) => a - b);
      return { samples: times.length, seconds: elapsed / 1000, fps: times.length / elapsed * 1000,
        p95: times[Math.floor(times.length * .95)], p99: times[Math.floor(times.length * .99)], max: times.at(-1),
        over33ms: times.filter(ms => ms > 33.4).length, hidden, renderer,
        canvas: { width: canvas.width, height: canvas.height }, viewport: { width: innerWidth, height: innerHeight },
        userAgent: navigator.userAgent, devicePixelRatio };
    });
    await page.mouse.up();
    const report = { date: new Date().toISOString(), content: CONTENT_VERSION, browser: browser.version(),
      cpu: cpus()[0].model, cadence, fixtureFrames, saturatedFrames, simulationFrames: battle.frame - frameStart,
      visibleActors: { min: visibleMin, max: visibleMax }, stateCount, errors,
      scope: 'Production client, 1920x1080 viewport, headless Chromium; one rendered client plus seven WebSocket clients, 16 AI with health/ammo/fall maintenance. Normal visibility filtering. RAF cadence is not GPU frame completion or physical display FPS; canvas dimensions reported separately. Server and clients share host.' };
    mkdirSync('artifacts/qa', { recursive: true });
    writeFileSync('artifacts/qa/browser-performance.json', JSON.stringify(report, null, 2));
    await page.screenshot({ path: 'artifacts/qa/browser-performance.png' });
    expect(errors).toEqual([]); expect(cadence.hidden).toBe(0);
    expect(saturatedFrames).toBe(fixtureFrames); expect(stateCount).toBeGreaterThan(300);
    expect(battle.frame - frameStart).toBeGreaterThan(850);
  } finally { if (timer) clearInterval(timer); for (const socket of sockets) socket.terminate(); await server.close(); }
});
