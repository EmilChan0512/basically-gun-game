import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { startServer } from '../../server/server';
import { registerOnline } from '../helpers/online-account';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

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
    const blankCadence=await page.evaluate(async()=>{
      const intervals:number[]=[];let previous=performance.now();const start=previous;
      await new Promise<void>(resolve=>{
        const sample=(now:number)=>{intervals.push(now-previous);previous=now;
          if(now-start>=3000)resolve();else requestAnimationFrame(sample);};requestAnimationFrame(sample);
      });
      intervals.shift();intervals.sort((a,b)=>a-b);
      return {samples:intervals.length,p95Ms:intervals[Math.floor(intervals.length*.95)],p99Ms:intervals[Math.floor(intervals.length*.99)]};
    });
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
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
          leakage ||= !message.growthV3 || message.growthV3.classId !== 'assault'
            || message.state.actors.some((a: Record<string, unknown>) => a.growthV3 && ['offer','pool','perks','selected','loadout'].some(key => key in (a.growthV3 as object)));
        }
      });
      await new Promise<void>(resolve => socket.once('open', resolve)); await authorizeSocket(server, socket, `Growth load ${i}`);
      send(socket, { type: 'join', code: room.id, name: `Load ${i}` });
      await expect.poll(() => room.players.size).toBe(i + 2); send(socket, { type: 'ready', ready: true });
    }
    await page.locator('#online-ready').click(); await expect(page.locator('#lobby')).not.toContainText('未准备');
    await page.locator('#online-start').click(); await expect(page.locator('canvas')).toBeVisible();
    const battle = room.session!.battle;
    for (const actor of battle.actors) {
      const p=battle.growthV3!.participant(actor.id);
      awardGrowthV3(p.progression,p.loadout,1200,battle.frame,seededRandom(2));
    }
    await expect(page.locator('[data-upgrade]')).toHaveCount(3);
    let sequence = 0;
    timer = setInterval(() => {
      for (const socket of sockets) send(socket, { type: 'input', roomId: room.id, round: room.round,
        command: { sequence, input: idleInput(), actions: [] } });
      sequence++;
    }, 1000 / 30);
    const frame = battle.frame;
    const metricsBefore=(await cdp.send('Performance.getMetrics')).metrics;
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    const cadence = await page.evaluate(async () => {
      const canvas=document.querySelector('canvas')!,gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      const debug=gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer=gl&&debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable';
      const times: number[] = [];
      await new Promise<void>(resolve => {
        const start = performance.now(); let previous = start;
        const sample = (now: number) => { times.push(now - previous); previous = now;
          if (now - start >= 15000) resolve(); else requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      });
      times.shift(); times.sort((a, b) => a - b);
      return { samples: times.length, p95Ms: times[Math.floor(times.length * .95)], p99Ms: times[Math.floor(times.length * .99)],
        renderer,canvas:{width:canvas.width,height:canvas.height},viewport:{width:innerWidth,height:innerHeight},hidden:document.hidden,
        bundles:Array.from(document.scripts).map(script=>script.src).filter(Boolean) };
    });
    const metricsAfter=(await cdp.send('Performance.getMetrics')).metrics;
    const {profile}=await cdp.send('Profiler.stop');
    mkdirSync('artifacts/qa',{recursive:true});writeFileSync('artifacts/qa/growth-render.cpuprofile',JSON.stringify(profile));
    const nodeById=new Map(profile.nodes.map(node=>[node.id,node]));
    const selfUs=new Map<number,number>();
    for(let i=0;i<(profile.samples?.length??0);i++){
      const id=profile.samples![i];selfUs.set(id,(selfUs.get(id)??0)+(profile.timeDeltas?.[i]??0));
    }
    const hotFrames=[...selfUs].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([id,us])=>({
      milliseconds:us/1000,...nodeById.get(id)!.callFrame}));
    const cpuSeconds=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(name=>[
      name,(metricsAfter.find(m=>m.name===name)?.value??0)-(metricsBefore.find(m=>m.name===name)?.value??0)]));
    const canvasIsolation=await page.evaluate(async()=>{
      const canvas=document.querySelector('canvas')!,original=canvas.style.visibility;
      const sample=async(hidden:boolean)=>{
        canvas.style.visibility=hidden?'hidden':original;
        const intervals:number[]=[];let previous=performance.now();const start=previous;
        await new Promise<void>(resolve=>{
          const frame=(now:number)=>{intervals.push(now-previous);previous=now;if(now-start>=3000)resolve();else requestAnimationFrame(frame);};
          requestAnimationFrame(frame);
        });
        intervals.shift();intervals.sort((a,b)=>a-b);
        return {canvasHidden:hidden,samples:intervals.length,p95Ms:intervals[Math.floor(intervals.length*.95)],p99Ms:intervals[Math.floor(intervals.length*.99)]};
      };
      try{return [await sample(false),await sample(true),await sample(false)];}
      finally{canvas.style.visibility=original;}
    });
    await cdp.detach();
    const report = { content: CONTENT_VERSION, date: new Date().toISOString(), instrumentation:'CDP CPU sampling enabled for main cadence; subsequent canvas isolation is unprofiled and diagnostic only', blankCadence, cpuSeconds, hotFrames, canvasIsolation, cadence, server: server.metrics(),
      simulationFrames: battle.frame - frame, snapshots, maxMessageCharacters: maxBytes, leakage, errors,
      targets:{serverP99Ms:8,renderP95Ms:16.7,serverMet:server.metrics().p99<8,renderMet:cadence.p95Ms<=16.7},
      scope: 'Windows production Chromium: one rendered client and seven authenticated WebSocket clients, eight pending level-5 choices; idle movement. Does not establish combat saturation, cross-device FPS or human playtest acceptance.' };
    mkdirSync('artifacts/qa', { recursive: true }); writeFileSync('artifacts/qa/growth-performance.json', JSON.stringify(report, null, 2));
    await page.screenshot({ path: 'artifacts/qa/growth-performance.png', fullPage: true });
    expect(errors).toEqual([]); expect(leakage).toBe(false); expect(snapshots).toBeGreaterThan(1000);
    expect(battle.frame - frame).toBeGreaterThan(400); expect(server.metrics().p95).toBeLessThan(33.34);
  } finally { if (timer) clearInterval(timer); for (const socket of sockets) socket.terminate(); await server.close(); }
});
