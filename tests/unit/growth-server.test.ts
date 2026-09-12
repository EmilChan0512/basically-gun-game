import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { awardGrowth } from '../../src/shared/simulation/Growth';
import { seededRandom } from '../../src/game/campaign/Battle';

it('authority binds choices to owner/round, isolates legacy rewards, and sends only own candidates', async () => {
  const server = startServer(0);
  await new Promise<void>(resolve => server.wss.once('listening', resolve));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const peers: { socket: WebSocket; messages: any[] }[] = [];
  const send = (index: number, value: object) => peers[index].socket.send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...value }));
  const wait = async (check: () => boolean) => {
    const end = Date.now() + 4000;
    while (!check()) { if (Date.now() > end) throw Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 10)); }
  };
  try {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}`), messages: any[] = [];
      peers.push({ socket, messages }); socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
      await new Promise<void>(resolve => socket.once('open', resolve)); accounts.push(await authorizeSocket(server, socket, `Growth authority ${i}`));
    }
    const before = accounts.map(a => server.accounts.profile(a.profile.id));
    send(0, { type: 'create', rules: 'growth', name: 'A', equipment: { primary: 'invalid-old-loadout' } });
    await wait(() => server.rooms.size === 1); const room = [...server.rooms.values()][0];
    send(1, { type: 'join', code: room.id, name: 'B' }); await wait(() => room.players.size === 2);
    send(0, { type: 'ready', ready: true }); send(1, { type: 'ready', ready: true });
    await wait(() => [...room.players.values()].every(p => p.ready)); send(0, { type: 'start' }); await wait(() => !!room.session);
    const battle = room.session!.battle, actor = battle.player;
    awardGrowth(actor.growth!, 200, seededRandom(1), battle.frame);
    await wait(() => peers[0].messages.some(m => m.type === 'state' && m.growth?.offer));
    await wait(() => peers[1].messages.some(m => m.type === 'state'));
    expect(peers[1].messages.filter(m => m.type === 'state').every(m => !m.growth?.offer)).toBe(true);
    expect(JSON.stringify(peers[1].messages)).not.toContain('attackers');
    const offer = actor.growth!.offer!, choice = { type: 'growthChoice', roomId: room.id, round: room.round, batch: offer.batch, upgrade: offer.cards[0] };
    send(1, { ...choice, actorId: actor.id }); await wait(() => peers[1].messages.some(m => m.type === 'error'));
    expect(actor.growth!.selected).toEqual([]);
    send(0, { ...choice, round: room.round + 1 }); await wait(() => peers[0].messages.some(m => m.type === 'error'));
    expect(actor.growth!.selected).toEqual([]);
    send(0, choice); await wait(() => actor.growth!.selected.length === 1);
    const errors = peers[0].messages.filter(m => m.type === 'error').length;
    send(0, choice); await wait(() => peers[0].messages.filter(m => m.type === 'error').length > errors);
    expect(actor.growth!.selected).toHaveLength(1);
    battle.frame = 1000; battle.endMatch(1, 'fixture'); send(0, { type: 'return' }); await wait(() => !room.session);
    expect(accounts.map(a => server.accounts.profile(a.profile.id))).toEqual(before);
  } finally { for (const peer of peers) peer.socket.terminate(); await server.close(); }
}, 15000);
