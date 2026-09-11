import { authorizeSocket } from '../helpers/network-account';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from '../../server/server';
import { delayedProxy } from '../../tools/network/delayed-proxy';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { idleInput } from '../../src/game/campaign/Battle';
import { Prediction } from '../../src/client/session/Prediction';

it.each([50, 100, 150])('eight clients preserve commands under %ims RTT, jitter and ordered stalls', async rtt => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const proxy = await delayedProxy(`ws://127.0.0.1:${address.port}`, rtt);
  const sockets: WebSocket[] = [], logs: any[][] = [], sentAt = new Map<number, number>(), ackDelay: number[] = [];
  const predictions = Array.from({ length: 8 }, () => new Prediction());
  const corrections: number[] = [];
  const largestCorrections: { pixels: number; client: number; frame: number; ack: number; before: { x: number; y: number }; after: { x: number; y: number }; alive: boolean; deaths: number }[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  const wait = async (f: () => boolean) => {
    const end = Date.now() + 6000;
    while (!f()) { if (Date.now() > end) throw Error('Delayed network timeout'); await new Promise(r => setTimeout(r, 10)); }
  };
  const send = (i: number, message: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  try {
    for (let i = 0; i < 8; i++) {
      logs[i] = []; const socket = new WebSocket(proxy.url); sockets.push(socket);
      let previousAck = -1;
      socket.on('message', raw => {
        const m = JSON.parse(raw.toString()); logs[i].push(m);
        if (m.type === 'probe') send(i, { type: 'probeReply', nonce: m.nonce });
        if (m.type === 'state') {
          const movement = predictions[i].movement;
          const before = movement ? { x: movement.x, y: movement.y } : null;
          predictions[i].accept(m);
          if (before) {
            const after = { x: predictions[i].movement!.x, y: predictions[i].movement!.y };
            const pixels = Math.hypot(after.x - before.x, after.y - before.y);
            corrections.push(pixels);
            const actor = m.state.actors.find((a: any) => a.id === m.actorId);
            largestCorrections.push({ pixels, client: i, frame: m.state.frame, ack: m.ack, before, after, alive: actor.life.alive, deaths: actor.life.deaths });
            largestCorrections.sort((a, b) => b.pixels - a.pixels); largestCorrections.splice(5);
          }
        }
        if (m.type === 'state' && m.ack > previousAck) {
          for (let seq = previousAck + 1; seq <= m.ack; seq++) if (sentAt.has(seq)) ackDelay.push(performance.now() - sentAt.get(seq)!);
          previousAck = m.ack;
        }
      });
    }
    await wait(() => logs.every(log => log.some(m => m.type === 'welcome')));
    const accounts = []; for (let i = 0; i < 8; i++) accounts.push(await authorizeSocket(server, sockets[i], `p${i}`));
    send(0, { type: 'create', name: 'p0' });
    await wait(() => logs[0].some(m => m.type === 'lobby'));
    const code = logs[0].find(m => m.type === 'lobby').room.id;
    for (let i = 1; i < 8; i++) send(i, { type: 'join', code, name: `p${i}` });
    await wait(() => logs.every(log => log.some(m => m.room?.players.length === 8)));
    for (let i = 0; i < 8; i++) send(i, { type: 'ready', ready: true });
    await wait(() => logs[0].some(m => m.room?.players.length === 8 && m.room.players.every((p: any) => p.ready)));
    send(0, { type: 'start' }); await wait(() => logs.every(log => log.some(m => m.type === 'state')));
    const commands = vi.spyOn(server.rooms.get(code)!, 'command');
    const start = performance.now(); let sequence = 0;
    const pump = () => {
      const due = Math.min(90, Math.floor((performance.now() - start) * 30 / 1000));
      while (sequence < due) {
        sentAt.set(sequence, performance.now());
        for (let i = 0; i < 8; i++) {
          const input = { ...idleInput(), right: sequence < 20, jump: sequence === 5 };
          predictions[i].input(sequence, input);
          send(i, { type: 'input', roomId: code, round: 1,
            command: { sequence, input, actions: sequence === 40 ? ['swap'] : [] } });
        }
        sequence++;
      }
    };
    timer = setInterval(pump, 8);
    await wait(() => sequence === 90); clearInterval(timer); timer = undefined;
    await wait(() => logs.every(log => log.some(m => m.type === 'state' && m.ack === 89)));
    expect(logs.flat().filter(m => m.type === 'error' || m.type === 'rejected')).toEqual([]);
    for (const [i, log] of logs.entries()) {
      const state = log.filter(m => m.type === 'state').at(-1);
      expect(state.state.actors.find((a: any) => a.id === state.actorId).weapon).toBe('usp');
      const acks = log.filter(m => m.type === 'state').map(m => m.ack);
      expect(acks).toEqual([...acks].sort((a, b) => a - b));
      expect(predictions[i].movement!.checkpoint()).toEqual(state.movement);
    }
    expect(server.rooms.get(code)!.session!.battle.actors.every(a => a.arsenal.selected === 'usp')).toBe(true);
    expect(ackDelay).toHaveLength(720);
    expect(commands.mock.calls.some(call => call[2] !== undefined)).toBe(true);
    ackDelay.sort((a, b) => a - b);
    corrections.sort((a, b) => a - b);
    expect(corrections.every(Number.isFinite)).toBe(true);
    mkdirSync('artifacts/qa', { recursive: true });
    writeFileSync(`artifacts/qa/network-delay-${rtt}.json`, JSON.stringify({ rttMs: rtt, jitterMs: 10, stallEvery: 23, stallMs: 80,
      transport: 'ordered application delay over loopback WebSocket; not TCP packet loss', clients: 8, commandsPerClient: 90,
      acknowledged: ackDelay.length, authorityTimedCommands: commands.mock.calls.filter(call => call[2] !== undefined).length,
      ackDelayMs: { p50: ackDelay[360], p95: ackDelay[684], max: ackDelay.at(-1) },
      predictionCorrectionPx: { samples: corrections.length, p50: corrections[Math.floor(corrections.length * 0.5)],
        p95: corrections[Math.floor(corrections.length * 0.95)], max: corrections.at(-1) },
      largestCorrections,
      proxy: proxy.stats, errors: [], measuredAt: new Date().toISOString() }, null, 2));
  } finally { if (timer) clearInterval(timer); for (const socket of sockets) socket.terminate(); await proxy.close(); await server.close(); }
}, 30000);
