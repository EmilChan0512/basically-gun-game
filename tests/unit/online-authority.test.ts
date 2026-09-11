import { it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { starterEquipment } from '../../src/shared/content/OnlineProgress';
import { idleInput } from '../../src/game/campaign/Battle';
import { OnlineAccounts } from '../../server/OnlineAccounts';

it('production rejects remote plaintext credentials even with forged forwarding headers', async () => {
  const server = startServer(0, '127.0.0.1', 100, undefined, 60000, true, new OnlineAccounts(), true);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const port = (server.wss.address() as { port: number }).port;
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { localAddress: '127.0.0.2', headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1' } });
  try {
    const rejection = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Transport test timeout')), 3000);
      socket.on('error', reject);
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'welcome') socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, type: 'auth', mode: 'register', name: 'Unsafe', password: 'password-123' }));
        if (message.type === 'error') { clearTimeout(timeout); resolve(message.message); }
      });
    });
    expect(rejection).toContain('WSS');
    expect(server.rooms.get('debug')).toBeDefined();
  } finally { socket.terminate(); await server.close(); }
});

it('authorizes before joining, rejects forged unlocks, and only rewards server-owned participants once', async () => {
  const server = startServer(0, '127.0.0.1', 100, undefined, 60000, true);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const port = (server.wss.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const wait = async (test: () => boolean) => { const end = Date.now() + 5000; while (!test()) { if (Date.now() > end) throw Error('Account authority timeout'); await new Promise(r => setTimeout(r, 10)); } };
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`); sockets.push(socket); const messages: any[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await wait(() => messages.some(m => m.type === 'welcome'));
    return { socket, messages, send: (m: object) => socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...m })) };
  };
  try {
    const a = await connect();
    a.send({ type: 'create', name: 'Guest' }); await wait(() => a.messages.some(m => m.type === 'error'));
    expect(server.rooms.size).toBe(1);
    const alice = await authorizeSocket(server, a.socket, 'Alice');
    a.send({ type: 'purchase', kind: 'weapon', id: 'vector', price: 0, credits: 99999, accountId: 'other' });
    await wait(() => a.messages.some(m => m.type === 'profile' && m.profile.credits === 150));
    a.send({ type: 'profileEquip', equipment: { ...starterEquipment('assassin'), primary: 'vector', secondary: 'knife' } });
    await wait(() => server.accounts.profile(alice.profile.id).selected === 'assassin');
    a.send({ type: 'create', name: 'Forged name', equipment: { ...starterEquipment('assassin'), primary: 'saw' } });
    await wait(() => a.messages.filter(m => m.type === 'error').length === 2);
    expect(server.rooms.size).toBe(1);
    a.send({ type: 'create', name: 'Forged name' }); await wait(() => a.messages.some(m => m.type === 'lobby'));
    const room = [...server.rooms.values()].find(r => !r.debug)!;
    expect([...room.players.values()][0]).toMatchObject({ name: 'Alice', equipment: { classId: 'assassin', primary: 'vector', secondary: 'knife' } });
    const b = await connect(), bob = await authorizeSocket(server, b.socket, 'Bob');
    b.send({ type: 'join', code: room.id, name: 'Bob' }); await wait(() => room.players.size === 2);
    const duplicate = await connect();
    duplicate.send({ type: 'auth', mode: 'restore', token: alice.token }); await wait(() => duplicate.messages.some(m => m.type === 'authenticated'));
    duplicate.send({ type: 'join', code: room.id, name: 'Alice' }); await wait(() => duplicate.messages.some(m => m.type === 'error'));
    expect(room.players.size).toBe(2);
    for (const client of [a, b]) client.send({ type: 'ready', ready: true });
    await wait(() => [...room.players.values()].every(p => p.ready)); a.send({ type: 'start' });
    await wait(() => !!room.session);
    const spectator = await connect(), observer = await authorizeSocket(server, spectator.socket, 'Observer');
    spectator.send({ type: 'join', code: room.id, name: 'Observer' }); await wait(() => room.players.size === 3);
    a.send({ type: 'settle', winner: 1, credits: 999999, xp: 1440 });
    await wait(() => a.messages.some(m => m.type === 'error' && m.message === 'Unknown message'));
    for (let sequence = 0; sequence < 30; sequence++) for (const client of [a, b]) client.send({ type: 'input', roomId: room.id, round: room.round, command: { sequence, input: { ...idleInput(), right: true }, actions: [] } });
    await wait(() => [...room.players.keys()].slice(0, 2).every(id => room.session!.nextSequence(id) === 30));
    // Server-only terminal fixture: clients have no API to choose time, score or rewards.
    room.session!.battle.frame = 900; room.session!.battle.player.kills = 3;
    await new Promise(r => setTimeout(r, 50));
    room.session!.battle.endMatch(1, 'reward fixture');
    await wait(() => server.accounts.profile(alice.profile.id).matches === 1);
    expect(server.accounts.profile(alice.profile.id)).toMatchObject({ credits: 366, classes: { assassin: { xp: 160 }, medic: { xp: 0 } } });
    expect(server.accounts.profile(bob.profile.id)).toMatchObject({ credits: 390, matches: 1, wins: 0 });
    expect(server.accounts.profile(observer.profile.id)).toEqual(observer.profile);
    a.send({ type: 'return' }); await wait(() => !room.session);
    expect(server.accounts.profile(alice.profile.id).matches).toBe(1);
    a.send({ type: 'leave' }); await wait(() => a.messages.some(m => m.type === 'left'));
    a.send({ type: 'joinDebug', name: 'Alice' }); await wait(() => server.rooms.get('debug')!.players.size === 1);
    const beforeDebug = server.accounts.profile(alice.profile.id);
    a.send({ type: 'equip', equipment: { ...starterEquipment('tank'), primary: 'saw', secondary: 'blast-shield', skill: 'iron', item: 'frag' } });
    await wait(() => server.rooms.get('debug')!.session!.battle.player.offhand?.id === 'blast-shield');
    expect(server.accounts.profile(alice.profile.id)).toEqual(beforeDebug);
  } finally { for (const socket of sockets) socket.terminate(); await server.close(); }
});
