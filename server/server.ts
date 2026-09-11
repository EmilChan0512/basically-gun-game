import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID, randomBytes } from 'node:crypto';
import { Room } from '../src/shared/simulation/Room';
import { performance } from 'node:perf_hooks';
import type { StateMessage } from '../src/shared/protocol/State';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import { LatencyBudget } from './LatencyBudget';
import { SNAPSHOT_INTERVAL_MS } from '../src/shared/protocol/Timing';
import { RevealPolicy } from '../src/shared/simulation/RevealPolicy';
import { visibleState } from '../src/shared/protocol/VisibleState';
import type { MatchSession } from '../src/shared/simulation/MatchSession';

export function startServer(port = 4180, host = '127.0.0.1', reconnectMs = 30000) {
  const wss = new WebSocketServer({ port, host, maxPayload: 8192,
    perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  const rooms = new Map<string, Room>();
  const timings: number[] = [];
  const revealPolicies = new WeakMap<MatchSession, RevealPolicy>();
  const credentials = new Map<string, { id: string; room: Room; expires: number }>();
  type Client = { id: string; room?: Room; count: number; window: number; eventMatch?: string; eventCursor?: number; latency: LatencyBudget; nextProbe: number };
  const clients = new Map<WebSocket, Client>();
  const send = (socket: WebSocket, data: unknown) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 512000) return false;
    socket.send(JSON.stringify(data)); return true;
  };
  const lobby = (room: Room) => { for (const [socket, client] of clients) if (client.room === room) send(socket, { type: 'lobby', room: room.lobby() }); };
  wss.on('connection', socket => {
    const client: Client = { id: randomUUID(), count: 0, window: performance.now(), latency: new LatencyBudget(), nextProbe: 0 };
    clients.set(socket, client); send(socket, { type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: client.id });
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
          send(socket, { type: 'resumed', playerId: client.id, nextSequence: entry.room.session!.nextSequence(client.id) }); lobby(entry.room);
        } else if (message.type === 'create' || message.type === 'join') {
          if (client.room) throw Error('Already in room');
          if (typeof message.name !== 'string') throw Error('Name required');
          const code = message.type === 'create' ? randomBytes(4).toString('hex') : message.code;
          if (typeof code !== 'string') throw Error('Room code required');
          const room = message.type === 'create' ? new Room(code) : rooms.get(code);
          if (!room) throw Error('Room not found');
          room.join(client.id, message.name); rooms.set(code, room); client.room = room; lobby(room);
          const token = randomBytes(32).toString('hex'); credentials.set(token, { id: client.id, room, expires: Infinity });
          send(socket, { type: 'credential', token });
        } else {
          const room = client.room; if (!room) throw Error('Join a room first');
          if (message.type === 'ready') {
            if (typeof message.ready !== 'boolean') throw Error('Invalid ready'); room.ready(client.id, message.ready); lobby(room);
          } else if (message.type === 'equip') {
            room.equip(client.id, message.equipment); lobby(room);
          } else if (message.type === 'configure') {
            if (typeof message.mapId !== 'string' || !['tdm', 'dom', 'coop', 'ctf'].includes(message.mode)) throw Error('Invalid configuration');
            room.configure(client.id, message.mapId, message.mode); lobby(room);
          } else if (message.type === 'start') { room.start(client.id, randomBytes(4).readInt32LE()); lobby(room); }
          else if (message.type === 'return') { room.returnToLobby(client.id); lobby(room); }
          else if (message.type === 'input') {
            if (message.roomId !== room.id || message.round !== room.round) throw Error('Match mismatch');
            const shotFrame = client.latency.shotFrame(room.session?.battle.frame ?? 0, now);
            if (!room.command(client.id, message.command, shotFrame)) send(socket, { type: 'rejected', sequence: message.command?.sequence,
              reason: room.session?.battle.result ? 'match-ended' : 'invalid-command' });
          } else throw Error('Unknown message');
        }
      } catch (error) { send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid request' }); }
    });
    socket.on('close', () => {
      clients.delete(socket);
      if (client.room) {
        client.room.disconnect(client.id); lobby(client.room);
        for (const [token, entry] of credentials) if (entry.id === client.id) {
          if (client.room.session) entry.expires = performance.now() + reconnectMs; else credentials.delete(token);
        }
        if (!client.room.session && ![...clients.values()].some(c => c.room === client.room)) rooms.delete(client.room.id);
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
    for (const [token, entry] of credentials) if (entry.expires <= now) { credentials.delete(token); entry.room.expire(entry.id); lobby(entry.room); }
    for (const [id, room] of rooms) if (![...clients.values()].some(c => c.room === room) && ![...credentials.values()].some(c => c.room === room)) rooms.delete(id);
    const simulationStart = performance.now();
    for (const room of rooms.values()) room.session?.advance(Math.min(delta, 250));
    if ([...rooms.values()].some(r => r.session)) { timings.push(performance.now() - simulationStart); if (timings.length > 2048) timings.shift(); }
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
