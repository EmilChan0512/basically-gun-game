import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createLogger, requestErrorReason } from '../../server/Logger';
import { startServer } from '../../server/server';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';

it('writes one JSON line, filters severity and redacts nested sensitive fields', () => {
  const lines: string[] = [];
  const logger = createLogger({ level: 'warn', context: { revision: 'abc' }, sink: line => lines.push(line) });
  logger.log('info', 'hidden');
  logger.log('warn', 'visible', { note: 'line1\nline2', token: 'private-token', nested: { authorization: 'private-auth', name: 'private-name' } });
  expect(lines).toHaveLength(1);
  expect(lines[0].split('\n')).toHaveLength(2);
  expect(lines[0]).not.toContain('private-');
  expect(JSON.parse(lines[0])).toMatchObject({ revision: 'abc', level: 'warn', event: 'visible', service: 'project-strike' });
  expect(() => createLogger({ level: 'typo' })).toThrow('LOG_LEVEL');
});

it('does not expose payload text from parser errors or arbitrary exception text', () => {
  expect(requestErrorReason(new SyntaxError('private incoming token'))).toBe('invalid-json');
  expect(requestErrorReason(new Error('private incoming token'))).toBe('invalid-request');
  expect(requestErrorReason(new Error('Content version mismatch'))).toBe('Content version mismatch');
});

it('correlates real connection/room/match events, limits warnings and handles oversized frames', async () => {
  const lines: string[] = [];
  const logger = createLogger({ sink: line => lines.push(line) });
  const records = () => lines.map(line => JSON.parse(line));
  const events = (event: string) => records().filter(record => record.event === event);
  const server = startServer(0, '127.0.0.1', 500, logger, 40);
  const sockets: WebSocket[] = [];
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 4000;
    while (!predicate()) {
      if (Date.now() > deadline) throw Error('Logging test timed out');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address();
  if (!address || typeof address === 'string') throw Error('No address');
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
    sockets.push(socket);
    const messages: any[] = [];
    socket.on('message', data => messages.push(JSON.parse(data.toString())));
    await wait(() => messages.some(m => m.type === 'welcome'));
    return { socket, messages, send: (message: object) => socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message })) };
  };
  try {
    const first = await connect();
    first.send({ type: 'create', name: 'private-nickname' });
    await wait(() => first.messages.some(m => m.type === 'credential'));
    const token = first.messages.find(m => m.type === 'credential').token;
    const roomId = first.messages.find(m => m.type === 'lobby').room.id;
    first.send({ type: 'configure', mapId: 'hijack', mode: 'coop' });
    first.send({ type: 'ready', ready: true });
    first.send({ type: 'start' });
    await wait(() => events('match.started').length === 1);
    for (let i = 0; i < 20; i++) first.socket.send('{"token":"private-payload",');
    await wait(() => first.messages.filter(m => m.type === 'error').length === 20);
    expect(events('client.request_rejected')).toHaveLength(1);
    expect(events('client.request_rejected')[0].reason).toBe('invalid-json');
    first.socket.close();
    await wait(() => events('client.disconnected').length === 1);
    const second = await connect();
    second.send({ type: 'resume', token });
    await wait(() => events('client.resumed').length === 1);
    const original = events('client.connected')[0];
    const resumed = events('client.resumed')[0];
    expect(resumed.playerId).toBe(original.playerId);
    expect(resumed.connectionId).not.toBe(original.connectionId);
    expect(resumed.roomId).toBe(roomId);
    server.rooms.get(roomId)!.session!.battle.endMatch(1, 'test-finished');
    await wait(() => events('match.ended').length === 1);
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(events('match.ended')).toHaveLength(1);
    second.socket.close();
    await wait(() => events('client.reconnect_expired').length === 1 && events('room.closed').length === 1);
    const oversized = await connect();
    oversized.socket.send('x'.repeat(8193));
    await wait(() => events('client.socket_error').length === 1);
    expect(events('client.socket_error')[0].code).toBe('WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
    await wait(() => events('server.metrics').some(m => m.connections === 0));
    expect(events('server.metrics').reduce((sum, m) => sum + m.interval.requestErrors, 0)).toBe(20);
    expect(lines.join('')).not.toContain(token);
    expect(lines.join('')).not.toContain('private-payload');
    expect(lines.join('')).not.toContain('private-nickname');
    expect(events('client.disconnected')[0].suppressedWarnings).toBe(19);
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
});
