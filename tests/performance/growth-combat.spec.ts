import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { authorizeSocket } from '../helpers/network-account';
import { impairedWebSocket } from '../helpers/impaired-websocket';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { defaultGrowthLoadoutV3 as defaultGrowthLoadout } from '../../src/shared/content/growth-v3/Loadout';
import type { GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';
import { idleInput, seededRandom } from '../../src/game/campaign/Battle';
import type { PlayerAction } from '../../src/shared/protocol/Commands';

test('eight growth combatants keep private choices and progress through delayed TCP stalls', async ({ page }) => {
  test.setTimeout(120000);
  expect(JSON.parse(readFileSync('artifacts/project-strike-local/manifest.json', 'utf8')).contentVersion).toBe(CONTENT_VERSION);
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No server port');
  const proxy = await impairedWebSocket(`ws://127.0.0.1:${address.port}`);
  const sockets: WebSocket[] = [], owners: string[] = [], errors: string[] = [];
  let timer: ReturnType<typeof setInterval> | undefined, snapshots = 0, maxBytes = 0, staleRejected = 0, leakage = false;
  const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  page.on('pageerror', error => errors.push(error.message));
  const contrast=process.env.GROWTH_CONTRAST==='1';
  let measuring=false,contrastSnapshots=0,visibleEnemySamples=0;
  page.on('websocket',ws=>ws.on('framereceived',frame=>{
    const message=JSON.parse(frame.payload.toString());if(!measuring||message.type!=='state')return;
    const self=message.state.actors.find((a:any)=>a.id===message.actorId);
    if(self?.life.alive&&self.growthV3?.contrast){contrastSnapshots++;visibleEnemySamples+=message.state.actors.filter((a:any)=>a.team!==self.team&&a.life.alive).length;}
  }));
  try {
    await page.goto('/?online'); await page.locator('#server').fill(proxy.url); await registerOnline(page, 'Combat host');
    await page.locator('#create-growth').click(); await expect(page.locator('#online-map')).toBeVisible();
    await page.locator('#online-map').selectOption('signal');
    const room = [...server.rooms.values()][0];
    if(contrast){const build=defaultGrowthLoadout('assault');build.attachments.primary=['O06'];room.equipGrowth(room.hostId!,build);}
    await expect.poll(() => room.mapId).toBe('signal');
    await expect(page.locator('#online-map')).toHaveValue('signal');
    await page.locator('#online-mode').selectOption('dom');
    await expect.poll(() => room.mode).toBe('dom');
    for (let i = 0; i < 7; i++) {
      const socket = new WebSocket(proxy.url); sockets.push(socket);
      let lastBatch = 0, refreshed = false;
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'welcome') owners[i] = message.playerId;
        if (message.type === 'probe') send(socket, { type: 'probeReply', nonce: message.nonce });
        if (message.type === 'error' && message.message === '升级选择已过期或不可用') staleRejected++;
        else if (message.type === 'error' || message.type === 'rejected') errors.push(JSON.stringify(message));
        if (message.type !== 'state') return;
        snapshots++; maxBytes = Math.max(maxBytes, Buffer.byteLength(raw.toString()));
        leakage ||= !message.growthV3 || message.growthV3.classId !== classId
          || message.state.actors.some((actor: { growthV3?: object }) => actor.growthV3 && ['offer', 'pool', 'perks', 'selected', 'loadout'].some(key => key in actor.growthV3!));
        const offer = message.growthV3?.offer;
        if (!offer || offer.batch <= lastBatch) return;
        lastBatch = offer.batch;
        if (!refreshed) {
          refreshed = true;
          send(socket, { type: 'growthReroll', roomId: room.id, round: room.round, batch: offer.batch });
          // Same ordered connection: this choice must be rejected after the reroll invalidates its batch.
          send(socket, { type: 'growthChoice', roomId: room.id, round: room.round, batch: offer.batch, upgrade: offer.cards[0] });
        } else send(socket, { type: 'growthChoice', roomId: room.id, round: room.round, batch: offer.batch, upgrade: offer.cards[i % 3] });
      });
      await new Promise<void>(resolve => socket.once('open', resolve));
      await authorizeSocket(server, socket, `Combat load ${i}`);
      send(socket, { type: 'join', code: room.id, name: `Combat load ${i}` }); await expect.poll(() => room.players.size).toBe(i + 2);
      const classId = (['tank', 'sniper', 'assault', 'medic'] as GrowthClassId[])[i % 4];
      send(socket, { type: 'growthEquip', loadout: defaultGrowthLoadout(classId) });
      send(socket, { type: 'ready', ready: true });
    }
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('canvas')).toBeVisible();
    const battle = room.session!.battle;
    // Initial XP is accelerated; seed one wounded ally near the scripted medic so
    // the healing workload does not depend on a lucky nonlethal combat exchange.
    for (const actor of battle.actors) {
      const p=battle.growthV3!.participant(actor.id);
      awardGrowthV3(p.progression,p.loadout,1200,battle.frame,seededRandom(9));
    }
    const medic=battle.actors.find(a=>a.id===room.session!.actorId(owners[3]))!;
    const patient=battle.actors.find(a=>a!==medic&&a.team===medic.team)!;
    medic.movement.reset(480,599.5);patient.movement.reset(520,599.5);
    medic.life.spawnProtectionFrames=0;patient.life.health=patient.life.maxHealth-30;
    let sequence = 0;
    timer = setInterval(() => {
      sockets.forEach((socket, i) => {
        const actor = battle.actors.find(a => a.id === room.session!.actorId(owners[i]));
        if (!actor) return;
        const enemy = battle.actors.filter(a => a.team !== actor.team && a.life.alive)
          .sort((a, b) => Math.abs(a.movement.x - actor.movement.x) - Math.abs(b.movement.x - actor.movement.x))[0];
        const input = idleInput(), x = actor.movement.x;
        input.right = x < 840; input.left = x > 960; input.jump = sequence % 60 < 8;
        input.fire = sequence % 4 < 2; input.aim = enemy ? { x: enemy.movement.x, y: enemy.movement.y - 32 } : input.aim;
        const actions: PlayerAction[] = sequence % 240 === 0 ? ['skill', 'item'] : sequence % 60 === 0 ? ['skill'] : sequence % 90 === 0 ? ['reload'] : [];
        if (battle.growthV3!.participant(actor.id).loadout.classId === 'medic') {
          const wounded = battle.actors.filter(a => a !== actor && a.team === actor.team && a.life.alive && a.life.health < a.life.maxHealth - 5)
            .sort((a, b) => Math.abs(a.movement.x - x) - Math.abs(b.movement.x - x))[0];
          const skill = actions.indexOf('skill'); if (skill >= 0) actions.splice(skill, 1);
          if (wounded) {
            input.jump=false;input.fire=false;
            input.left = x > wounded.movement.x + 60; input.right = x < wounded.movement.x - 60;
            if (sequence % 15 === 0 && Math.hypot(x - wounded.movement.x, actor.movement.y - wounded.movement.y) < 160) actions.push('skill');
          }
        }
        send(socket, { type: 'input', roomId: room.id, round: room.round, command: { sequence, input,
          actions } });
      }); sequence++;
    }, 1000 / 30);
    for (let n = 1; n <= 4; n++) {
      await expect(page.locator('[data-upgrade]')).toHaveCount(3);
      const previousBatch = await page.locator('#growth-panel').getAttribute('data-growth-batch');
      await page.locator('[data-upgrade]').first().click();
      await expect.poll(() => battle.growthV3!.participant(battle.player.id).progression.selected.length).toBe(n);
      await expect(page.locator('#growth-panel')).not.toHaveAttribute('data-growth-batch', previousBatch!);
    }
    await expect.poll(() => battle.actors.filter(a => battle.growthV3!.participant(a.id).progression.selected.length === 4).length).toBe(8);
    await page.locator('canvas').click(); await page.keyboard.down('d'); await page.mouse.down();
    const frame = battle.frame;
    measuring=true;
    const cadence = await page.evaluate(async () => {
      const canvas=document.querySelector('canvas')!,gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const debug=gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer=gl&&debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable';
      const intervals: number[] = []; let previous = performance.now(); const start = previous;
      await new Promise<void>(resolve => {
        const sample = (now: number) => { intervals.push(now - previous); previous = now;
          if (now - start >= 20000) resolve(); else requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      });
      intervals.shift(); intervals.sort((a, b) => a - b);
      return { samples: intervals.length, p95Ms: intervals[Math.floor(intervals.length * .95)], p99Ms: intervals[Math.floor(intervals.length * .99)],
        renderer,canvas:{width:canvas.width,height:canvas.height},viewport:{width:innerWidth,height:innerHeight},hidden:document.hidden,
        bundles:Array.from(document.scripts).map(script=>script.src).filter(Boolean) };
    });
    measuring=false;await page.keyboard.up('d'); await page.mouse.up();
    const combat = battle.actors.map(a => {
      const p=battle.growthV3!.participant(a.id);
      return { classId:p.loadout.classId,shots:p.metrics.shots,hits:p.metrics.hits,healingDone:p.metrics.healingDone,
        movingTicks:p.metrics.movingTicks,kills:a.kills,choices:p.progression.selected.length };
    });
    const report = { content: CONTENT_VERSION, date: new Date().toISOString(), cadence, server: server.metrics(), transport: proxy.metrics(),
      simulationFrames: battle.frame - frame, snapshots, maxMessageBytes: maxBytes, staleRejected, leakage, errors, combat,
      contrast:{equipped:contrast,contrastSnapshots,visibleEnemySamples},
      targets:{serverP99Ms:8,renderP95Ms:16.7,serverMet:server.metrics().p99<8,renderMet:cadence.p95Ms<=16.7},
      scope: 'One production Chromium client plus seven authenticated scripted clients; four classes including Medic healing, DOM, movement, fire, skills, grenades, simultaneous four-card queues. All eight connections cross 100–140ms one-way delay and ordered 500ms TCP stalls every 5s. Initial XP is accelerated; one ally starts 30HP injured next to the scripted medic with medic spawn protection cleared. All healing casts use network inputs. This is not eight rendered devices, physical packet-loss testing or human balance acceptance.' };
    const reportName=contrast?'growth-combat-contrast-performance':'growth-combat-performance';
    mkdirSync('artifacts/qa', { recursive: true }); writeFileSync(`artifacts/qa/${reportName}.json`, JSON.stringify(report, null, 2));
    await page.screenshot({ path: `artifacts/qa/${reportName}.png`, fullPage: true });
    if(contrast){expect(contrastSnapshots).toBeGreaterThan(30);expect(visibleEnemySamples).toBeGreaterThan(30);}
    expect(errors).toEqual([]); expect(leakage).toBe(false); expect(staleRejected).toBe(7);
    expect(combat.every(a => a.choices === 4)).toBe(true);
    expect(combat.reduce((sum, a) => sum + a.shots, 0)).toBeGreaterThan(100);
    expect(combat.reduce((sum, a) => sum + a.hits, 0)).toBeGreaterThan(10);
    expect(combat.reduce((sum, a) => sum + a.healingDone, 0)).toBeGreaterThan(0);
    expect(combat.filter(a => a.movingTicks > 30)).toHaveLength(8);
    expect(proxy.metrics().stalled).toBeGreaterThan(100); expect(snapshots).toBeGreaterThan(1500);
    expect(battle.frame - frame).toBeGreaterThan(500); expect(server.metrics().p95).toBeLessThan(33.34);
  } finally { if (timer) clearInterval(timer); for (const socket of sockets) socket.terminate(); await proxy.close(); await server.close(); }
});
