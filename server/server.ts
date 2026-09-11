import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'node:crypto';
import { Room } from '../src/shared/simulation/Room';
import { performance } from 'node:perf_hooks';
import type { StateMessage } from '../src/shared/protocol/State';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import { LatencyBudget } from './LatencyBudget';
import { silentLogger, requestErrorReason, type Logger } from './Logger';
import { SNAPSHOT_INTERVAL_MS } from '../src/shared/protocol/Timing';
import { RevealPolicy } from '../src/shared/simulation/RevealPolicy';
import { visibleState } from '../src/shared/protocol/VisibleState';
import type { MatchSession } from '../src/shared/simulation/MatchSession';

export function startServer(port = 4180, host = '127.0.0.1', reconnectMs = 30000, logger: Logger = silentLogger, metricsIntervalMs = 60000) {
  const wss = new WebSocketServer({ port, host, maxPayload: 8192,
    perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  const rooms = new Map<string, Room>();
  const endedSessions = new WeakSet<MatchSession>();
  const counters = { connections: 0, disconnections: 0, requestErrors: 0, rejectedCommands: 0, skippedSends: 0 };
  let lastMetrics = performance.now();
  const roomFields = (room: Room) => ({ roomId: room.id, round: room.round, mapId: room.mapId, mode: room.mode });
  const removeRoom = (id: string) => {
    const room = rooms.get(id);
    if (room) { rooms.delete(id); logger.log('info', 'room.closed', roomFields(room)); }
  };
  const timings: number[] = [];
  const revealPolicies = new WeakMap<MatchSession, RevealPolicy>();
  const credentials = new Map<string, { id: string; room: Room; expires: number }>();
  type Client = { connectionId: string; connectedAt: number; warningAt: number; suppressedWarnings: number; id: string; room?: Room; count: number; window: number; eventMatch?: string; eventCursor?: number; latency: LatencyBudget; nextProbe: number };
  const clients = new Map<WebSocket, Client>();
  const send = (socket: WebSocket, data: unknown) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 512000) { counters.skippedSends++; return false; }
    socket.send(JSON.stringify(data)); return true;
  };
  const lobby = (room: Room) => { for (const [socket, client] of clients) if (client.room === room) send(socket, { type: 'lobby', room: room.lobby() }); };
  const warnClient = (client: Client, reason: string) => {
    const now = performance.now();
    if (now < client.warningAt) { client.suppressedWarnings++; return; }
    logger.log('warn', 'client.request_rejected', { connectionId: client.connectionId, playerId: client.id,
      roomId: client.room?.id, reason, suppressedWarnings: client.suppressedWarnings });
    client.warningAt = now + 10000; client.suppressedWarnings = 0;
  };
  wss.on('connection', socket => {
    const client: Client = { connectionId: randomUUID(), connectedAt: performance.now(), warningAt: 0, suppressedWarnings: 0, id: randomUUID(), count: 0, window: performance.now(), latency: new LatencyBudget(), nextProbe: 0 };
    clients.set(socket, client); send(socket, { type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: client.id });
    counters.connections++;
    logger.log('info', 'client.connected', { connectionId: client.connectionId, playerId: client.id, connections: clients.size });
    socket.on('error', error => {
      logger.log('warn', 'client.socket_error', { connectionId: client.connectionId, playerId: client.id,
        errorType: error.name, code: (error as NodeJS.ErrnoException).code });
    });
    socket.on('message', data => {
      try {
        const now = performance.now(); if (now - client.window > 1000) { client.window = now; client.count = 0; }
        if (++client.count > 90) throw Error('Input rate exceeded');
        const message = JSON.parse(data.toString());
        if (message.protocol !== 1) throw Error('Protocol mismatch');
        if (message.content !== CONTENT_VERSION) throw Error('Content version mismatch');
        if (message.type === 'probeReply') {
          client.latency.complete(message.nonce, now);
        } else if (message.type === 'resume') {
          const entry = typeof message.token === 'string' ? credentials.get(message.token) : undefined;
          if (client.room || !entry || entry.expires <= now) throw Error('Reconnect token invalid or expired');
          entry.room.reconnect(entry.id); client.id = entry.id; client.room = entry.room;
          entry.expires = Infinity;
          logger.log('info', 'client.resumed', { connectionId: client.connectionId, playerId: client.id, ...roomFields(entry.room) });
          send(socket, { type: 'resumed', playerId: client.id, nextSequence: entry.room.session!.nextSequence(client.id) }); lobby(entry.room);
        } else if (message.type === 'create' || message.type === 'join') {
          if (client.room) throw Error('Already in room');
          if (typeof message.name !== 'string') throw Error('Name required');
          const code = message.type === 'create' ? randomBytes(4).toString('hex') : message.code;
          if (typeof code !== 'string') throw Error('Room code required');
          const room = message.type === 'create' ? new Room(code) : rooms.get(code);
          if (!room) throw Error('Room not found');
          room.join(client.id, message.name); rooms.set(code, room); client.room = room; lobby(room);
          logger.log('info', message.type === 'create' ? 'room.created' : 'room.joined', { connectionId: client.connectionId, playerId: client.id, ...roomFields(room), players: room.players.size });
          const token = randomBytes(32).toString('hex'); credentials.set(token, { id: client.id, room, expires: Infinity });
          send(socket, { type: 'credential', token });
        } else {
          const room = client.room; if (!room) throw Error('Join a room first');
          if (message.type === 'ready') {
            if (typeof message.ready !== 'boolean') throw Error('Invalid ready'); room.ready(client.id, message.ready); lobby(room);
            logger.log('debug', 'room.ready_changed', { playerId: client.id, ...roomFields(room), ready: message.ready });
          } else if (message.type === 'equip') {
            room.equip(client.id, message.equipment); lobby(room);
            logger.log('debug', 'room.equipment_changed', { playerId: client.id, ...roomFields(room), equipment: room.players.get(client.id)!.equipment });
          } else if (message.type === 'configure') {
            if (typeof message.mapId !== 'string' || !['tdm', 'dom', 'coop', 'ctf'].includes(message.mode)) throw Error('Invalid configuration');
            room.configure(client.id, message.mapId, message.mode); lobby(room);
            logger.log('info', 'room.configured', { playerId: client.id, ...roomFields(room) });
          } else if (message.type === 'start') { room.start(client.id, randomBytes(4).readInt32LE()); lobby(room); logger.log('info', 'match.started', { ...roomFields(room), players: room.players.size }); }
          else if (message.type === 'return') { room.returnToLobby(client.id); lobby(room); logger.log('info', 'room.returned_to_lobby', roomFields(room)); }
          else if (message.type === 'input') {
            if (message.roomId !== room.id || message.round !== room.round) throw Error('Match mismatch');
            const shotFrame = client.latency.shotFrame(room.session?.battle.frame ?? 0, now);
            if (!room.command(client.id, message.command, shotFrame)) {
              counters.rejectedCommands++; warnClient(client, 'invalid-command');
              send(socket, { type: 'rejected', sequence: message.command?.sequence,
              reason: room.session?.battle.result ? 'match-ended' : 'invalid-command' });
            }
          } else throw Error('Unknown message');
        }
      } catch (error) { counters.requestErrors++; warnClient(client, requestErrorReason(error)); send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid request' }); }
    });
    socket.on('close', code => {
      counters.disconnections++;
      logger.log('info', 'client.disconnected', { connectionId: client.connectionId, playerId: client.id, roomId: client.room?.id, code, durationMs: Math.round(performance.now() - client.connectedAt), suppressedWarnings: client.suppressedWarnings });
      clients.delete(socket);
      if (client.room) {
        client.room.disconnect(client.id); lobby(client.room);
        for (const [token, entry] of credentials) if (entry.id === client.id) {
          if (client.room.session) entry.expires = performance.now() + reconnectMs; else credentials.delete(token);
        }
        if (!client.room.session && ![...clients.values()].some(c => c.room === client.room)) removeRoom(client.room.id);
      }
    });
  });
  let last = performance.now(), nextBroadcast = last;
  const timer = setInterval(() => {
    const now = performance.now(), delta = now - last; last = now;
    for (const [socket, client] of clients) if (now >= client.nextProbe) {
      const nonce = randomBytes(16).toString('hex');
      if (send(socket, { type: 'probe', nonce })) { client.latency.begin(nonce, now); client.nextProbe = now + 3000; }
    }
    for (const [token, entry] of credentials) if (entry.expires <= now) { credentials.delete(token); entry.room.expire(entry.id); lobby(entry.room); logger.log('info', 'client.reconnect_expired', { playerId: entry.id, ...roomFields(entry.room) }); }
    for (const [id, room] of rooms) if (![...clients.values()].some(c => c.room === room) && ![...credentials.values()].some(c => c.room === room)) removeRoom(id);
    const simulationStart = performance.now();
    for (const room of rooms.values()) room.session?.advance(Math.min(delta, 250));
    if ([...rooms.values()].some(r => r.session)) { timings.push(performance.now() - simulationStart); if (timings.length > 2048) timings.shift(); }
    for (const room of rooms.values()) if (room.session?.battle.result && !endedSessions.has(room.session)) {
      endedSessions.add(room.session);
      logger.log('info', 'match.ended', { ...roomFields(room), frame: room.session.battle.frame, result: room.session.battle.result });
    }
    if (now - lastMetrics >= metricsIntervalMs) {
      lastMetrics = now;
      const sorted = [...timings].sort((a, b) => a - b);
      logger.log('info', 'server.metrics', { connections: clients.size, rooms: rooms.size,
        activeMatches: [...rooms.values()].filter(r => r.session && !r.session.battle.result).length,
        simulationP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        simulationP99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
        rssBytes: process.memoryUsage().rss, uptimeSeconds: Math.round(process.uptime()), interval: { ...counters } });
      counters.connections = counters.disconnections = counters.requestErrors = counters.rejectedCommands = counters.skippedSends = 0;
    }
    // Schedule snapshots by elapsed time, not callback count. Timer jitter must
    // not silently reduce the intended 15Hz rate; missed snapshots are coalesced.
    if (now < nextBroadcast) return;
    nextBroadcast += (Math.floor((now - nextBroadcast) / SNAPSHOT_INTERVAL_MS) + 1) * SNAPSHOT_INTERVAL_MS;
    for (const [socket, client] of clients) {
      const session = client.room?.session;
      if (session) {
        const b = session.battle;
        const eventMatch = `${client.room!.id}:${client.room!.round}`;
        const eventCursor = client.eventMatch === eventMatch ? client.eventCursor! : Math.max(0, b.journal.cursor - 32);
        const message: StateMessage = { type: 'state', roomId: client.room!.id, round: client.room!.round, actorId: session.actorId(client.id), mapId: client.room!.mapId, mode: client.room!.mode,
          state: b.snapshot(), result: b.result, ack: session.acknowledgements()[client.id] ?? -1,
          poses: b.actors.map(a => ({ id: a.id, name: a.name, aim: { ...a.aim } })), effects: b.effects, bursts: b.bursts,
          grenades: b.grenades.map(g => ({ x: g.x, y: g.y })), events: b.journal.since(eventCursor) };
        message.movement = b.actors.find(a => a.id === message.actorId)?.movement.checkpoint();
        message.jumpHeld = session.jumpHeld(client.id);
        // WebSocket delivers in order. Advance only when queued successfully;
        // a skipped snapshot must not consume the recipient's pending events.
        let reveal = revealPolicies.get(session);
        if (!reveal) { reveal = new RevealPolicy(); revealPolicies.set(session, reveal); }
        const team = client.room!.players.get(client.id)!.team;
        const carriers = new Set((message.state.deliveryTargets ?? []).flatMap(t => t.carrierId ? [t.carrierId] : []));
        const visible = reveal.visible(b.actors, b.frame, b.journal.since(0), b.wall, team, carriers);
        if (send(socket, visibleState(message, visible, team, b.wall))) { client.eventMatch = eventMatch; client.eventCursor = b.journal.cursor; }
      }
    }
  }, 1000 / 30);
  return { wss, rooms, metrics: () => { const sorted = [...timings].sort((a, b) => a - b); return { samples: sorted.length, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0 }; }, close: async () => { clearInterval(timer); for (const socket of clients.keys()) socket.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); } };
}
