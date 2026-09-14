import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NetworkSession } from '../../src/client/session/NetworkSession';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';

class Socket {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: any[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
beforeEach(() => vi.stubEnv('DEV', false));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function setup(welcomed = true) {
  vi.stubGlobal('WebSocket', Socket);
  const session = new NetworkSession('ws://test');
  if (welcomed) (session.socket as unknown as Socket).receive({ type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: 'p' });
  return { session, socket: session.socket as unknown as Socket };
}
const lobby = (round: number, phase = 'playing') => ({ type: 'lobby', room: { id: 'room', round, phase, players: [], mapId: 'signal', mode: 'tdm' } });
function state(round: number, frame: number, roomId = 'room') {
  const battle = new Battle(MISSIONS[0]); battle.frame = frame;
  return { type: 'state', roomId, round, actorId: battle.player.id, mapId: 'signal', mode: 'tdm',
    state: battle.snapshot(), ack: -1, result: null, poses: [], effects: [], bursts: [], grenades: [], events: [] };
}
it('rejects old/foreign snapshots and sends input scoped to the active round', () => {
  const { session, socket } = setup();
  socket.receive(lobby(1)); socket.receive(state(1, 900));
  expect(session.state?.state.frame).toBe(900);
  socket.receive(lobby(1, 'lobby')); socket.receive(state(1, 901));
  expect(session.state).toBeNull();
  socket.receive(lobby(2));
  socket.receive(state(1, 999)); socket.receive(state(2, 999, 'other'));
  expect(session.state).toBeNull();
  socket.receive(state(2, 1)); session.input(idleInput());
  expect(socket.sent.at(-1)).toMatchObject({ type: 'input', roomId: 'room', round: 2, command: { sequence: 0 } });
  socket.receive(state(2, 0)); expect(session.state?.state.frame).toBe(1);
});
it('keeps the compatibility error when closing an incompatible connection', () => {
  const { session, socket } = setup(); const errors: string[] = [];
  session.onError = message => errors.push(message);
  socket.receive({ type: 'welcome', protocol: 1, content: `${CONTENT_VERSION}-old` });
  expect(socket.readyState).toBe(Socket.CLOSED);
  expect(errors).toEqual(['地图或装备版本不一致，请更新客户端与服务器']);
});
it('accepts a terminal result at the already displayed frame and stops sending input', () => {
  const { session, socket } = setup(); socket.receive(lobby(1));
  const snapshot = state(1, 100); socket.receive(snapshot);
  socket.receive({ ...snapshot, result: { winner: 1, draw: false, reason: 'forfeit', tick: 100 } });
  expect(session.state?.result?.reason).toBe('forfeit');
  session.input(idleInput()); expect(socket.sent).toHaveLength(0);
});
it('resumes the existing round at the server sequence without reusing pending actions', () => {
  const { session, socket } = setup();
  socket.receive(lobby(1)); socket.receive(state(1, 10));
  socket.receive({ type: 'credential', token: 'secret' }); session.action('swap'); socket.close();
  session.reconnect(); const resumed = session.socket as unknown as Socket;
  resumed.onopen?.(); expect(resumed.sent).toHaveLength(0);
  resumed.receive({ type: 'welcome', protocol: 1, content: CONTENT_VERSION, playerId: 'new' });
  expect(resumed.sent.at(-1)).toMatchObject({ type: 'resume', token: 'secret' });
  resumed.receive({ type: 'resumed', playerId: 'p', nextSequence: 42 });
  resumed.receive(lobby(1)); resumed.receive(state(1, 20)); session.input(idleInput());
  expect(resumed.sent.at(-1).command).toMatchObject({ sequence: 42, actions: [] });
});

it('does not send queued login credentials to an incompatible server', () => {
  const { session, socket } = setup(false);
  session.send({ type: 'auth', mode: 'login', name: 'Pilot', password: 'test-password' });
  expect(socket.sent).toHaveLength(0);
  socket.receive({ type: 'welcome', protocol: 1, content: 'old-version', allowInsecureAccounts: true });
  expect(socket.sent).toHaveLength(0); expect(socket.readyState).toBe(Socket.CLOSED);
});


it('allows content drift in development and stamps queued commands with the server version', () => {
  vi.stubEnv('DEV', true); vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { session, socket } = setup(false);
  session.send({ type: 'joinDebug' });
  socket.receive({ type: 'welcome', protocol: 1, content: 'server-build-a', playerId: 'p' });
  expect(socket.readyState).toBe(Socket.OPEN);
  expect(socket.sent.at(-1)).toMatchObject({ type: 'joinDebug', content: 'server-build-a', protocol: 1 });
  socket.receive(lobby(1)); socket.receive(state(1,10)); session.input(idleInput());
  expect(socket.sent.at(-1)).toMatchObject({ type: 'input', content: 'server-build-a' });
  socket.receive({ type:'credential', token:'resume-token' }); socket.close();session.reconnect();
  const resumed=session.socket as unknown as Socket;resumed.onopen?.();
  expect(resumed.sent).toHaveLength(0);
  resumed.receive({ type:'welcome', protocol:1, content:'server-build-b', playerId:'p' });
  expect(resumed.sent.at(-1)).toMatchObject({ type:'resume',content:'server-build-b' });
});

it.each([{ protocol:2, content:'other' }, { protocol:1, content:null }])('still rejects incompatible protocol or malformed welcome in development: %j', welcome => {
  vi.stubEnv('DEV',true);
  const { session,socket }=setup(false);session.send({type:'joinDebug'});
  socket.receive({type:'welcome',...welcome});
  expect(socket.readyState).toBe(Socket.CLOSED);expect(socket.sent).toHaveLength(0);
});
