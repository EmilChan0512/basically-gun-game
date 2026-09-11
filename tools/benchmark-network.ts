import { WebSocket } from 'ws';
import type { Socket } from 'node:net';
import { startServer } from '../server/server';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import { idleInput } from '../src/game/campaign/Battle';
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
const server = startServer(0);
await new Promise<void>(resolve => server.wss.once('listening', resolve));
const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
const sockets: WebSocket[] = [], states: any[] = [], bytes = Array(8).fill(0), snapshots = Array(8).fill(0), errors: string[] = [];
const transports: Socket[] = [];
const wait = async (f: () => boolean) => { const end = Date.now() + 5000; while (!f()) { if (Date.now() > end) throw Error('Timeout'); await new Promise(r => setTimeout(r, 10)); } };
const send = (i: number, value: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...value }));
let code = '', timer: ReturnType<typeof setInterval> | undefined;
try {
  for (let i = 0; i < 8; i++) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`); sockets.push(socket);
    socket.on('upgrade', response => { transports[i] = response.socket; });
    socket.on('message', raw => {
      bytes[i] += Buffer.byteLength(raw.toString(), 'utf8'); const m = JSON.parse(raw.toString());
      if (m.type === 'lobby') code = m.room.id;
      if (m.type === 'probe') send(i, { type: 'probeReply', nonce: m.nonce });
      if (m.type === 'state') { states[i] = m; snapshots[i]++; }
      if (m.type === 'error') errors.push(m.message);
      if (m.type === 'rejected') errors.push(`Client ${i}: rejected sequence ${m.sequence}`);
    });
    await new Promise<void>(resolve => socket.once('open', resolve));
    send(i, i === 0 ? { type: 'create', name: `p${i}` } : { type: 'join', code, name: `p${i}` });
    await wait(() => [...server.rooms.values()][0]?.players.size === i + 1 && !!code);
    send(i, { type: 'ready', ready: true });
  }
  await wait(() => [...server.rooms.values()][0].players.size === 8 && [...[...server.rooms.values()][0].players.values()].every(p => p.ready));
  send(0, { type: 'start' }); await wait(() => states.filter(Boolean).length === 8);
  bytes.fill(0); snapshots.fill(0); const startFrame = [...server.rooms.values()][0].session!.battle.frame;
  const wireStart = transports.map(socket => socket.bytesRead), cpuStart = process.cpuUsage();
  const start = performance.now(); let sequence = 0, maxBatch = 0;
  const pump = () => {
    const due = Math.floor((Math.min(performance.now() - start, 30000)) * 30 / 1000);
    maxBatch = Math.max(maxBatch, due - sequence);
    while (sequence < due) {
    for (let i = 0; i < 8; i++) send(i, { type: 'input', roomId: code, round: states[i].round, command: { sequence, input: { ...idleInput(), right: sequence % 120 < 50, left: sequence % 120 > 70, jump: sequence % 50 < 3, fire: sequence % 60 < 30 }, actions: sequence % 120 === 0 ? ['swap'] : [] } });
    sequence++;
    }
  };
  timer = setInterval(pump, 8);
  await new Promise(r => setTimeout(r, 30000));
  clearInterval(timer); timer = undefined; pump();
  const seconds = (performance.now() - start) / 1000;
  const measuredBytes = [...bytes], measuredSnapshots = [...snapshots];
  const wireBytes = transports.map((socket, i) => socket.bytesRead - wireStart[i]);
  const measuredFrame = [...server.rooms.values()][0].session!.battle.frame;
  await wait(() => states.every(s => s.ack === sequence - 1));
  const report = { date: new Date().toISOString(), cpu: cpus()[0].model, node: process.version, clients: 8, seconds,
    network: 'loopback; no injected latency', byteMeasurement: 'UTF-8 application payload; excludes WebSocket/TCP overhead',
    kbPerSecond: measuredBytes.map(n => Math.round(n / seconds / 1000)), snapshotsPerSecond: measuredSnapshots.map(n => n / seconds),
    wireKbPerSecond: wireBytes.map(n => n / seconds / 1000), compression: sockets.map(socket => socket.extensions),
    wireMeasurement: 'received WebSocket frames on TCP stream; excludes TCP/IP headers and TLS', processCpuMicros: process.cpuUsage(cpuStart),
    inputHz: sequence / seconds, maxCatchUpBatch: maxBatch, simulationHz: (measuredFrame - startFrame) / seconds,
    simulationAdvanceMs: server.metrics(), serverFrame: measuredFrame, lastAcknowledged: states.map(s => s.ack), sentSequences: sequence, errors };
  mkdirSync('artifacts/qa', { recursive: true }); writeFileSync('artifacts/qa/network-benchmark.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (errors.length || sequence !== 900) throw Error('Network benchmark acceptance failed');
} finally { if (timer) clearInterval(timer); await server.close(); }
