import { WebSocket } from 'ws';
import type { Socket } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { startServer } from '../server/server';
import { MatchSession } from '../src/shared/simulation/MatchSession';
import { idleInput } from '../src/game/campaign/Battle';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import type { StateMessage } from '../src/shared/protocol/State';

// Explicit synthetic saturation fixture. Never used by production server or
// natural-match acceptance: health/ammo replenishment keeps 24 actors active.
const duration = Number(process.argv[2] ?? 600);
if (!Number.isInteger(duration) || duration < 10 || duration > 1800) throw Error('Duration must be 10–1800 seconds');
const server = startServer(0);
await new Promise<void>(r => server.wss.once('listening', r));
const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
const sockets: WebSocket[] = [], transports: Socket[] = [], states: StateMessage[] = [];
const bytes = Array(8).fill(0), snapshots = Array(8).fill(0), errors: string[] = [];
const sampleRows: object[] = [], tickMs: number[] = [];
let code = '', sequence = 0, timer: ReturnType<typeof setInterval> | undefined;
let fixtureFrames = 0, saturatedFrames = 0, restoredFalls = 0, maxBuffered = 0, maxAckLag = 0;
const shotEventsByTeam = [0, 0]; let damageEvents = 0, eventCursor = 0;
const lag = monitorEventLoopDelay({ resolution: 20 });
const send = (i: number, message: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
const wait = async (predicate: () => boolean, timeout = 6000) => {
  const end = performance.now() + timeout;
  while (!predicate()) { if (performance.now() > end) throw Error('Load probe timeout'); await new Promise(r => setTimeout(r, 10)); }
};
const date = new Date().toISOString(), stamp = date.replace(/[:.]/g, '-');
const reportPath = `artifacts/qa/coop-load-${CONTENT_VERSION}-${stamp}.json`;
try {
  for (let i = 0; i < 8; i++) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`); sockets.push(socket);
    socket.on('upgrade', response => { transports[i] = response.socket; });
    socket.on('message', raw => {
      bytes[i] += Buffer.byteLength(raw.toString()); const message = JSON.parse(raw.toString());
      if (message.type === 'lobby') code = message.room.id;
      if (message.type === 'probe') send(i, { type: 'probeReply', nonce: message.nonce });
      if (message.type === 'state') { states[i] = message; snapshots[i]++; }
      if (message.type === 'error' || message.type === 'rejected') errors.push(JSON.stringify(message));
    });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    send(i, i ? { type: 'join', code, name: `Load ${i}` } : { type: 'create', name: 'Load 0' });
    await wait(() => !!code && server.rooms.get(code)?.players.size === i + 1);
  }
  const room = server.rooms.get(code)!;
  send(0, { type: 'configure', mapId: 'hijack', mode: 'coop' }); await wait(() => room.mode === 'coop');
  for (let i = 0; i < 8; i++) send(i, { type: 'ready', ready: true });
  await wait(() => [...room.players.values()].every(p => p.ready));
  send(0, { type: 'start' }); await wait(() => states.length === 8);

  const saved = room.session!.checkpoint(), battleState = saved.battle;
  battleState.mission.seconds = 3600;
  battleState.mission.scenario!.seconds = 3600;
  const waves = battleState.waves!;
  waves.scenario.seconds = 3600; waves.phase = 'wave'; waves.wave = 1;
  waves.remaining = 0; waves.cooldown = 0; waves.activeCap = 16;
  for (let i = 0; i < 16; i++) {
    const enemy = structuredClone(battleState.actors[i % 8]);
    const spawn = battleState.mission.spawns[1][i % battleState.mission.spawns[1].length];
    enemy.id = `load-enemy-${i}`; enemy.name = `Enemy ${i}`; enemy.team = 2; enemy.human = false;
    enemy.movement.x = spawn.x; enemy.movement.y = spawn.y;
    battleState.actors.push(enemy);
  }
  for (const actor of battleState.actors) actor.life.health = actor.life.maxHealth = 100000;
  room.session = MatchSession.restore(saved);
  const session = room.session, battle = session.battle, ordinaryTick = session.tick.bind(session);
  session.tick = () => {
    for (const actor of battle.actors) {
      actor.life.health = actor.life.maxHealth;
      if (actor.movement.y > (battle.mission.killY! - 50)) {
        const spawn = battle.mission.spawns[actor.team - 1][0]; actor.movement.reset(spawn.x, spawn.y); restoredFalls++;
      }
      if (actor.arsenal.empty) actor.arsenal.resupply();
    }
    const start = performance.now(); ordinaryTick(); tickMs.push(performance.now() - start);
    for (const event of battle.journal.since(eventCursor)) {
      eventCursor = event.id;
      if (event.kind === 'damage') damageEvents++;
      if (event.kind === 'shot') {
        const source = battle.actors.find(a => a.id === event.actorId);
        if (source) shotEventsByTeam[source.team - 1]++;
      }
    }
    fixtureFrames++;
    if (battle.actors.filter(a => a.team === 1 && a.life.alive).length === 8
      && battle.actors.filter(a => a.team === 2 && a.life.alive).length === 16) saturatedFrames++;
  };
  bytes.fill(0); snapshots.fill(0); lag.enable();
  const wireStart = transports.map(s => s.bytesRead), cpuStart = process.cpuUsage(), startFrame = battle.frame;
  const started = performance.now(); let nextSample = 0;
  const pump = () => {
    const elapsed = performance.now() - started;
    const due = Math.floor(Math.min(elapsed, duration * 1000) * 30 / 1000);
    while (sequence < due) {
      for (let i = 0; i < 8; i++) {
        const state = states[i], self = state.state.actors.find(a => a.id === state.actorId)!;
        const target = state.state.actors.find(a => a.team !== self.team && a.life.alive);
        send(i, { type: 'input', roomId: code, round: room.round, command: { sequence, actions: [],
          input: { ...idleInput(), left: sequence % 180 > 100, right: sequence % 180 < 80,
            jump: sequence % 60 === 0, fire: sequence % 60 < 40,
            aim: target ? { x: target.x, y: target.y - 33 } : { x: self.x + 300, y: self.y - 33 } } } });
      }
      sequence++;
    }
    maxBuffered = Math.max(maxBuffered, ...[...server.wss.clients].map(s => s.bufferedAmount));
    maxAckLag = Math.max(maxAckLag, ...states.map(s => sequence - 1 - s.ack));
    if (elapsed >= nextSample) {
      const sample = { seconds: elapsed / 1000, frame: battle.frame, memory: process.memoryUsage(),
        ackLag: states.map(s => sequence - 1 - s.ack), maxBuffered, saturatedFrames, fixtureFrames };
      sampleRows.push(sample); console.log(JSON.stringify(sample)); nextSample += 15000;
    }
  };
  timer = setInterval(pump, 8);
  await wait(() => performance.now() - started >= duration * 1000, (duration + 10) * 1000);
  clearInterval(timer); timer = undefined; pump();
  const seconds = (performance.now() - started) / 1000;
  const measuredBytes = [...bytes], measuredSnapshots = [...snapshots];
  const wire = transports.map((s, i) => (s.bytesRead - wireStart[i]) / seconds / 1000);
  const hz = (battle.frame - startFrame) / seconds;
  await wait(() => states.every(s => s.ack === sequence - 1)); lag.disable();
  tickMs.sort((a, b) => a - b);
  const percentile = (p: number) => tickMs[Math.min(tickMs.length - 1, Math.floor(tickMs.length * p))];
  const passed = errors.length === 0 && saturatedFrames === fixtureFrames && !battle.result
    && hz >= 29 && hz <= 31 && percentile(.95) < 10 && percentile(.99) < 33.3
    && shotEventsByTeam.every(n => n > 0) && damageEvents > 0;
  const report = { date, content: CONTENT_VERSION, duration, seconds, cpu: cpus()[0].model, logicalCpus: cpus().length, node: process.version,
    fixture: '8 real WebSocket command clients +16 AI; injected trusted checkpoint; replenished health/ammo and reset falls; not natural gameplay or browser FPS',
    measurement: 'tick excludes fixture maintenance; CPU/memory/event-loop include server, compression and all script clients; wire excludes TCP/IP/TLS headers',
    passed, errors, simulationHz: hz, fixtureFrames, saturatedFrames, restoredFalls, shotEventsByTeam, damageEvents,
    tickMs: { count: tickMs.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: tickMs.at(-1) },
    eventLoopMs: { p95: lag.percentile(95) / 1e6, p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 },
    wireKbPerSecond: wire, applicationKbPerSecond: measuredBytes.map(n => n / seconds / 1000),
    snapshotHz: measuredSnapshots.map(n => n / seconds), compression: sockets.map(s => s.extensions),
    maxBuffered, maxAckLag, sent: sequence, finalAcks: states.map(s => s.ack), processCpu: process.cpuUsage(cpuStart), samples: sampleRows,
    remainingGates: ['memory trend review', 'reference hardware', 'browser FPS', 'physical devices', ...(duration < 600 ? ['10 minute run'] : [])] };
  mkdirSync('artifacts/qa', { recursive: true }); writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, passed, tickMs: report.tickMs, wireKbPerSecond: wire }));
  if (!passed) throw Error('Saturation acceptance failed; report retained');
} finally { if (timer) clearInterval(timer); lag.disable(); await server.close(); }
