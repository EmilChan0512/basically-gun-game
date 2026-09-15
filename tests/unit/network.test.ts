import { authorizeSocket } from '../helpers/network-account';
import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { idleInput } from '../../src/game/campaign/Battle';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';

it('eight real WebSocket clients join, start and receive authoritative input results', async () => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (typeof address === 'string' || !address) throw Error('Missing listener');
  const sockets: WebSocket[] = [];
  const logs: any[][] = [];
  const wait = async (predicate: () => boolean) => {
    const until = Date.now() + 4000;
    while (!predicate()) { if (Date.now() > until) throw Error('Network condition timed out'); await new Promise(r => setTimeout(r, 10)); }
  };
  const send = (i: number, message: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  try {
    for (let i = 0; i < 9; i++) {
      logs[i] = []; const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, { perMessageDeflate: i !== 1 }); sockets.push(socket);
      socket.on('message', data => logs[i].push(JSON.parse(data.toString())));
      await wait(() => logs[i].some(m => m.type === 'welcome'));
    }
    expect(sockets[0].extensions).toContain('permessage-deflate');
    expect(sockets[1].extensions).toBe('');
    const accounts = []; for (let i = 0; i < 9; i++) accounts.push(await authorizeSocket(server, sockets[i], `Pilot ${i}`));
    send(0, { type: 'create', name: 'Pilot 0', content: 'outdated' });
    await wait(() => logs[0].some(m => m.type === 'error' && m.message.includes('version mismatch')));
    expect(server.rooms.size).toBe(0);
    send(0, { type: 'create', name: 'Pilot 0' });
    await wait(() => logs[0].some(m => m.type === 'lobby'));
    const code = logs[0].find(m => m.type === 'lobby').room.id;
    for (let i = 1; i < 8; i++) send(i, { type: 'join', code, name: `Pilot ${i}` });
    await wait(() => logs[0].some(m => m.room?.players.length === 8));
    send(8, { type: 'join', code, name: 'Extra' });
    await wait(() => logs[8].some(m => m.type === 'error' && m.message.includes('full')));
    for (let i = 0; i < 8; i++) send(i, { type: 'ready', ready: true });
    await wait(() => logs[0].some(m => m.room?.players.length === 8 && m.room.players.every((p: any) => p.ready)));
    send(0, { type: 'start' });
    await wait(() => logs.slice(0, 8).every(log => log.some(m => m.type === 'state')));
    send(1, { type: 'input', roomId: code, round: 0, command: { sequence: 0, input: idleInput(), actions: ['swap'] } });
    await wait(() => logs[1].some(m => m.type === 'error' && m.message === 'Match mismatch'));
    expect(server.rooms.get(code)!.session!.battle.actors.every(a => a.arsenal.selected === 'm4')).toBe(true);
    send(1, { type: 'input', roomId: code, round: 1, command: { sequence: 0, input: idleInput(), actions: ['swap'] } });
    await wait(() => logs[1].some(m => m.type === 'state' && m.ack === 0));
    const packet = logs[1].filter(m => m.type === 'state').at(-1), state = packet.state;
    expect(server.rooms.get(code)!.session!.battle.actors).toHaveLength(8);
    const team = state.actors.find((a: any) => a.id === packet.actorId).team;
    const friendly = state.actors.filter((a: any) => a.team === team);
    expect(friendly).toHaveLength(4);
    expect(friendly.filter((a: any) => a.weapon === 'usp')).toHaveLength(1);
    expect(friendly.filter((a: any) => a.weapon === 'm4')).toHaveLength(3);
    const battle = server.rooms.get(code)!.session!.battle;
    battle.journal.emit({ tick: battle.frame, kind: 'shot', actorId: battle.player.id });
    const cursor = battle.journal.cursor;
    await wait(() => logs[0].some(m => m.type === 'state' && m.events.some((e: any) => e.id === cursor)));
    const seenFrame = logs[0].filter(m => m.type === 'state').at(-1).state.frame;
    await wait(() => logs[0].some(m => m.type === 'state' && m.state.frame >= seenFrame + 4));
    expect(logs[0].filter(m => m.type === 'state').flatMap(m => m.events).filter((e: any) => e.id === cursor)).toHaveLength(1);
    const token = logs[1].find(m => m.type === 'credential').token;
    const actorId = logs[1].filter(m => m.type === 'state').at(-1).actorId;
    sockets[1].close();
    await wait(() => logs[0].some(m => m.type === 'lobby' && m.room.players.some((p: any) => p.name === 'Pilot 1' && !p.connected)));
    logs[9] = []; const resumed = new WebSocket(`ws://127.0.0.1:${address.port}`); sockets.push(resumed);
    resumed.on('message', data => logs[9].push(JSON.parse(data.toString())));
    await wait(() => logs[9].some(m => m.type === 'welcome'));
    send(9, { type: 'resume', token, authToken: accounts[1].token });
    await wait(() => logs[9].some(m => m.type === 'state'));
    expect(logs[9].find(m => m.type === 'resumed').nextSequence).toBe(1);
    expect(logs[9].find(m => m.type === 'state').actorId).toBe(actorId);
    const resumedState = logs[9].find(m => m.type === 'state');
    const ownTeam = battle.actors.find(a => a.id === actorId)!.team;
    expect(resumedState.state.actors.filter((a: any) => a.team === ownTeam)).toHaveLength(4);
    expect(resumedState.state.actors.some((a: any) => a.id === battle.player.id)).toBe(true); // Shot exposure survives reconnect.
    send(9, { type: 'input', roomId: code, round: 1, command: { sequence: 0, input: idleInput(), actions: ['swap'] } });
    await wait(() => logs[9].some(m => m.type === 'rejected'));
    expect(logs[9].find(m => m.type === 'rejected').reason).toBe('stale-sequence');
    server.rooms.get(code)!.session!.battle.endMatch(1, 'terminal input fixture');
    send(9, { type: 'input', roomId: code, round: 1, command: { sequence: 1, input: idleInput(), actions: ['swap'] } });
    await wait(() => logs[9].some(m => m.type === 'rejected' && m.sequence === 1));
    expect(logs[9].find(m => m.type === 'rejected' && m.sequence === 1).reason).toBe('match-ended');
  } finally { await server.close(); }
}, 15000);
