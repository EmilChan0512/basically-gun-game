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
import { OnlineAccounts } from './OnlineAccounts';
import { ownedEquipment } from '../src/shared/content/OnlineProgress';
import { validateEquipment } from '../src/shared/content/Equipment';
import type { ClassId } from '../src/game/campaign/Catalog';

export function startServer(port = 4180, host = '127.0.0.1', reconnectMs = 30000, logger: Logger = silentLogger, metricsIntervalMs = 60000, enableDebugRoom = false, accounts = new OnlineAccounts(), secureAccounts = false) {
  const wss = new WebSocketServer({ port, host, maxPayload: 8192,
    perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true,
      concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  const rooms = new Map<string, Room>();
  if (enableDebugRoom) { rooms.set('debug', new Room('debug', 'hijack', 'tdm', true)); logger.log('info', 'room.debug_created', { roomId: 'debug' }); }
  const endedSessions = new WeakSet<MatchSession>();
  const counters = { connections: 0, disconnections: 0, requestErrors: 0, rejectedCommands: 0, skippedSends: 0 };
  let lastMetrics = performance.now();
  const roomFields = (room: Room) => ({ roomId: room.id, round: room.round, mapId: room.mapId, mode: room.mode });
  const removeRoom = (id: string) => {
    const room = rooms.get(id);
    if (room && !room.debug) {
      try { settle(room); } catch { logger.log('error', 'account.settlement_failed', roomFields(room)); return; }
      rooms.delete(id); logger.log('info', 'room.closed', roomFields(room));
    }
  };
  const timings: number[] = [];
  const revealPolicies = new WeakMap<MatchSession, RevealPolicy>();
  const credentials = new Map<string, { id: string; room: Room; expires: number; accountId?: string }>();
  type Client = { connectionId: string; connectedAt: number; warningAt: number; suppressedWarnings: number; id: string; accountId?: string; authToken?: string; authenticating?: boolean; room?: Room; count: number; window: number; eventMatch?: string; eventCursor?: number; latency: LatencyBudget; nextProbe: number };
  const clients = new Map<WebSocket, Client>();
  type Participant = { accountId: string; classId: ClassId; team: 1 | 2; kills: number; commands: number };
  const participants = new WeakMap<MatchSession, Map<string, Participant>>();
  const send = (socket: WebSocket, data: unknown) => {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 65536) { counters.skippedSends++; return false; }
    socket.send(JSON.stringify(data)); return true;
  };
  const lobby = (room: Room) => { for (const [socket, client] of clients) if (client.room === room) send(socket, { type: 'lobby', room: room.lobby() }); };
  const publishProfile = (id: string) => { for (const [socket, client] of clients) if (client.accountId === id) send(socket, { type: 'profile', profile: accounts.profile(id) }); };
  const settle = (room: Room) => {
    const session = room.session;
    if (!session || !session.battle.result || endedSessions.has(session)) return;
    const roster = participants.get(session);
    if (!room.debug && roster && session.battle.frame >= 900) {
      const rewards = [...roster.values()].filter(p => p.commands >= 30).map(p => ({ ...p, won: session.battle.result!.winner === p.team }));
      for (const id of accounts.settle(`${room.instanceId}:${room.round}`, rewards)) publishProfile(id);
    }
    endedSessions.add(session);
    logger.log('info', 'match.ended', { ...roomFields(room), frame: session.battle.frame, result: session.battle.result });
  };
  const warnClient = (client: Client, reason: string) => {
    const now = performance.now();
    if (now < client.warningAt) { client.suppressedWarnings++; return; }
    logger.log('warn', 'client.request_rejected', { connectionId: client.connectionId, playerId: client.id,
      roomId: client.room?.id, reason, suppressedWarnings: client.suppressedWarnings });
    client.warningAt = now + 10000; client.suppressedWarnings = 0;
  };
  wss.on('connection', (socket, request) => {
    const assertAccountTransport = () => {
      const address = request.socket.remoteAddress;
      // Production trusts only a TLS reverse proxy on loopback, never forwarded headers from the client.
      if (secureAccounts && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')) throw Error('公网账号登录需使用 WSS 加密地址；当前 WS 地址仅供调试试玩');
    };
    const client: Client = { connectionId: randomUUID(), connectedAt: performance.now(), warningAt: 0, suppressedWarnings: 0, id: randomUUID(), count: 0, window: performance.now(), latency: new LatencyBudget(), nextProbe: 0 };
    clients.set(socket, client); send(socket, { type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: client.id, allowInsecureAccounts: !secureAccounts });
    counters.connections++;
    logger.log('info', 'client.connected', { connectionId: client.connectionId, playerId: client.id, connections: clients.size });
    socket.on('error', error => {
      logger.log('warn', 'client.socket_error', { connectionId: client.connectionId, playerId: client.id,
        errorType: error.name, code: (error as NodeJS.ErrnoException).code });
    });
    socket.on('message', async data => {
      try {
        const now = performance.now(); if (now - client.window > 1000) { client.window = now; client.count = 0; }
        if (++client.count > 90) throw Error('Input rate exceeded');
        const message = JSON.parse(data.toString());
        if (message.protocol !== 1) throw Error('Protocol mismatch');
        if (message.content !== CONTENT_VERSION) throw Error('Content version mismatch');
        if (message.type === 'probeReply') {
          client.latency.complete(message.nonce, now);
        } else if (message.type === 'auth') {
          assertAccountTransport();
          if (client.room || client.authenticating || !['login', 'register', 'restore'].includes(message.mode)) throw Error('请先退出房间或等待登录完成');
          client.authenticating = true;
          try {
            const result = message.mode === 'restore' ? { token: message.token, profile: accounts.authenticate(message.token) }
              : await accounts.login(message.mode, message.name, message.password, request.socket.remoteAddress ?? 'unknown');
            if (socket.readyState !== WebSocket.OPEN) return;
            client.accountId = result.profile.id; client.authToken = result.token;
            send(socket, { type: 'authenticated', ...result });
          } finally { client.authenticating = false; }
        } else if (message.type === 'logout') {
          if (client.room) {
            const room = client.room;
            settle(room); room.disconnect(client.id); room.expire(client.id); settle(room);
            for (const [token, entry] of credentials) if (entry.id === client.id) credentials.delete(token);
            client.room = undefined; lobby(room);
          }
          accounts.revoke(client.authToken); client.accountId = undefined; client.authToken = undefined;
          socket.close();
        } else if (client.authenticating) {
          throw Error('请等待登录完成');
        } else if (message.type === 'leave') {
          const room = client.room; if (!room) throw Error('Join a room first');
          settle(room); room.disconnect(client.id); room.expire(client.id); settle(room);
          for (const [token, entry] of credentials) if (entry.id === client.id) credentials.delete(token);
          client.room = undefined; client.eventMatch = undefined; lobby(room); send(socket, { type: 'left' });
        } else if (message.type === 'purchase' || message.type === 'profileEquip') {
          if (!client.accountId) throw Error('请先登录联机账号');
          if (client.room) throw Error('请在进入房间前购买或保存配装');
          if (message.type === 'purchase') accounts.buy(client.accountId, message.kind, message.id);
          else accounts.equip(client.accountId, message.equipment);
          publishProfile(client.accountId);
        } else if (message.type === 'resume') {
          const entry = typeof message.token === 'string' ? credentials.get(message.token) : undefined;
          if (client.room || !entry || entry.expires <= now) throw Error('Reconnect token invalid or expired');
          if (entry.accountId) {
            assertAccountTransport();
            const profile = accounts.authenticate(message.authToken);
            if (profile.id !== entry.accountId) throw Error('重连账号不匹配');
            client.accountId = profile.id; client.authToken = message.authToken;
            send(socket, { type: 'profile', profile });
          }
          entry.room.reconnect(entry.id); client.id = entry.id; client.room = entry.room;
          entry.expires = Infinity;
          logger.log('info', 'client.resumed', { connectionId: client.connectionId, playerId: client.id, ...roomFields(entry.room) });
          send(socket, { type: 'resumed', playerId: client.id, nextSequence: entry.room.session!.nextSequence(client.id) }); lobby(entry.room);
        } else if (message.type === 'create' || message.type === 'join' || message.type === 'joinDebug') {
          if (client.room) throw Error('Already in room');
          if (typeof message.name !== 'string') throw Error('Name required');
          const code = message.type === 'create' ? randomBytes(4).toString('hex') : message.type === 'joinDebug' ? 'debug' : message.code;
          if (typeof code !== 'string') throw Error('Room code required');
          const room = message.type === 'create' ? new Room(code) : rooms.get(code);
          if (!room) throw Error('Room not found');
          if (!room.debug && !client.accountId) throw Error('请先登录联机账号');
          if (client.accountId && [...credentials.values()].some(c => c.accountId === client.accountId)) throw Error('此账号已有房间席位，请断线重连或等待旧席位释放');
          const profile = client.accountId ? accounts.profile(client.accountId) : undefined;
          const equipment = room.debug ? message.equipment === undefined ? undefined : validateEquipment(message.equipment)
            : ownedEquipment(profile!, message.equipment ?? profile!.classes[profile!.selected].equipment);
          room.join(client.id, profile?.name ?? message.name, equipment); rooms.set(code, room); client.room = room; lobby(room);
          logger.log('info', message.type === 'create' ? 'room.created' : 'room.joined', { connectionId: client.connectionId, playerId: client.id, ...roomFields(room), players: room.players.size });
          const token = randomBytes(32).toString('hex'); credentials.set(token, { id: client.id, room, expires: Infinity, accountId: client.accountId });
          send(socket, { type: 'credential', token });
        } else {
          const room = client.room; if (!room) throw Error('Join a room first');
          if (message.type === 'ready') {
            if (typeof message.ready !== 'boolean') throw Error('Invalid ready'); room.ready(client.id, message.ready); lobby(room);
            logger.log('debug', 'room.ready_changed', { playerId: client.id, ...roomFields(room), ready: message.ready });
          } else if (message.type === 'equip') {
            if (!room.debug) {
              if (!client.accountId) throw Error('请先登录联机账号');
              ownedEquipment(accounts.profile(client.accountId), message.equipment);
              if (room.session) throw Error('Cannot change equipment');
              accounts.equip(client.accountId, message.equipment); publishProfile(client.accountId);
            }
            room.equip(client.id, message.equipment); lobby(room);
            logger.log('debug', 'room.equipment_changed', { playerId: client.id, ...roomFields(room), equipment: room.players.get(client.id)!.equipment });
          } else if (message.type === 'configure') {
            if (typeof message.mapId !== 'string' || !['tdm', 'dom', 'coop', 'ctf'].includes(message.mode)) throw Error('Invalid configuration');
            room.configure(client.id, message.mapId, message.mode); lobby(room);
            logger.log('info', 'room.configured', { playerId: client.id, ...roomFields(room) });
          } else if (message.type === 'start') {
            room.start(client.id, randomBytes(4).readInt32LE());
            const roster = new Map<string, Participant>();
            for (const player of room.players.values()) {
              const owner = [...clients.values()].find(c => c.id === player.id)?.accountId;
              if (owner && !player.spectator) roster.set(player.id, { accountId: owner, classId: player.equipment.classId ?? 'medic', team: player.team, kills: 0, commands: 0 });
            }
            participants.set(room.session!, roster);
            lobby(room); logger.log('info', 'match.started', { ...roomFields(room), players: room.players.size });
          }
          else if (message.type === 'return') { settle(room); room.returnToLobby(client.id); lobby(room); logger.log('info', 'room.returned_to_lobby', roomFields(room)); }
          else if (message.type === 'input') {
            if (message.roomId !== room.id || message.round !== room.round) throw Error('Match mismatch');
            const shotFrame = client.latency.shotFrame(room.session?.battle.frame ?? 0, now);
            const rejection = room.session?.rejectionReason(client.id, message.command) ?? 'invalid-command';
            if (!room.command(client.id, message.command, shotFrame)) {
              counters.rejectedCommands++; warnClient(client, rejection);
              send(socket, { type: 'rejected', sequence: message.command?.sequence,
              reason: rejection });
            } else {
              const participant = room.session && participants.get(room.session)?.get(client.id), command = message.command;
              if (participant && (command.actions.length || ['left', 'right', 'crouch', 'jump', 'fire'].some(key => command.input[key]))) participant.commands++;
            }
          } else throw Error('Unknown message');
        }
      } catch (error) { counters.requestErrors++; warnClient(client, requestErrorReason(error)); send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid request' }); }
    });
    socket.on('close', code => {
      counters.disconnections++;
      if (client.room?.session) logger.log('info', 'network.client_metrics', { connectionId: client.connectionId, playerId: client.id,
        ...roomFields(client.room), ...client.latency.metrics(performance.now()), input: client.room.session.diagnostics(client.id), bufferedBytes: socket.bufferedAmount, final: true });
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
    for (const room of rooms.values()) {
      room.session?.advance(Math.min(delta, 250));
      if (room.session) for (const [id, participant] of participants.get(room.session) ?? []) {
        const actor = room.session.battle.actors.find(a => a.id === room.session!.actorId(id));
        if (actor) participant.kills = Math.max(participant.kills, actor.kills);
      }
    }
    if ([...rooms.values()].some(r => r.session)) { timings.push(performance.now() - simulationStart); if (timings.length > 2048) timings.shift(); }
    for (const room of rooms.values()) if (room.session?.battle.result && !endedSessions.has(room.session)) {
      try { settle(room); } catch { logger.log('error', 'account.settlement_failed', roomFields(room)); }
    }
    if (now - lastMetrics >= metricsIntervalMs) {
      lastMetrics = now;
      for (const [socket, client] of clients) if (client.room?.session) {
        logger.log('info', 'network.client_metrics', { connectionId: client.connectionId, playerId: client.id,
          ...roomFields(client.room), ...client.latency.metrics(now), input: client.room.session.diagnostics(client.id), bufferedBytes: socket.bufferedAmount });
      }
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
  return { wss, rooms, accounts, metrics: () => { const sorted = [...timings].sort((a, b) => a - b); return { samples: sorted.length, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0 }; }, close: async () => { clearInterval(timer); for (const socket of clients.keys()) socket.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); } };
}
