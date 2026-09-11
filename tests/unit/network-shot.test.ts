import { authorizeSocket } from '../helpers/network-account';
import { expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { delayedProxy } from '../../tools/network/delayed-proxy';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';

it('server-timed fire through 150ms RTT uses history without accepting a forged shot frame', async () => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const proxy = await delayedProxy(`ws://127.0.0.1:${address.port}`, 150, 0, 0);
  const sockets: WebSocket[] = [], logs: any[][] = [[], []];
  const send = (i: number, m: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...m }));
  const wait = async (f: () => boolean) => {
    const until = performance.now() + 5000;
    while (!f()) { if (performance.now() > until) throw Error('Shot fixture timeout'); await new Promise(r => setTimeout(r, 10)); }
  };
  try {
    for (let i = 0; i < 2; i++) {
      const socket = new WebSocket(proxy.url); sockets.push(socket);
      socket.on('message', raw => {
        const m = JSON.parse(raw.toString()); logs[i].push(m);
        if (m.type === 'probe') send(i, { type: 'probeReply', nonce: m.nonce });
      });
    }
    await wait(() => logs.every(log => log.some(m => m.type === 'welcome')));
    const accounts = []; for (let i = 0; i < 2; i++) accounts.push(await authorizeSocket(server, sockets[i], i === 0 ? 'shooter' : 'target'));
    send(0, { type: 'create', name: 'shooter' }); await wait(() => logs[0].some(m => m.type === 'lobby'));
    const code = logs[0].find(m => m.type === 'lobby').room.id;
    send(1, { type: 'join', code, name: 'target' }); await wait(() => logs[1].some(m => m.type === 'lobby'));
    for (let i = 0; i < 2; i++) send(i, { type: 'ready', ready: true });
    await wait(() => logs[0].some(m => m.room?.players.length === 2 && m.room.players.every((p: any) => p.ready)));
    send(0, { type: 'start' }); await wait(() => logs.every(log => log.some(m => m.type === 'state')));
    const room = server.rooms.get(code)!;
    // Controlled geometry isolates networking/history from random aim and map
    // obstacles. Target relocation is a fixture, not player teleport capability.
    const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1,
      terrain: [{ x: 0, y: 400, width: 1800, height: 100 }] }, 'normal', 'm4', seededRandom(1));
    const [shooter, target] = battle.actors;
    shooter.movement.reset(100, 399.5); target.movement.reset(350, 399.5); shooter.aim = { x: 350, y: 357.5 };
    for (const actor of battle.actors) actor.life.spawnProtectionFrames = 0;
    room.session = new MatchSession(battle);
    [...room.players.values()].forEach((p, i) => room.session!.bind(p.id, battle.actors[i].id));
    await wait(() => battle.frame >= 10);
    const original = room.command.bind(room);
    let selectedFrame: number | undefined;
    vi.spyOn(room, 'command').mockImplementation((id, command, authorityFrame) => {
      selectedFrame = authorityFrame;
      // Relocate on arrival, after earlier history has been captured. The shot
      // must hit historical y=399.5; its current y=200 is outside the ray.
      target.movement.reset(350, 200);
      return original(id, command, authorityFrame);
    });
    send(0, { type: 'input', roomId: code, round: 1, command: { sequence: 0, shotFrame: 999999,
      input: { ...idleInput(), fire: true, aim: { x: 350, y: 357.5 } }, actions: [] } });
    await wait(() => logs[0].some(m => m.type === 'state' && m.ack === 0));
    expect(selectedFrame).toBeDefined(); expect(selectedFrame).toBeLessThan(battle.frame);
    expect(target.life.health).toBeLessThan(85);
    expect(target.movement.y).toBeLessThan(300);
    expect(logs.flat().filter(m => m.type === 'error' || m.type === 'rejected')).toEqual([]);
    expect(battle.effects.some(e => e.trace.hit?.type === 'unit' && e.trace.hit.target === target.id)).toBe(true);
  } finally { for (const socket of sockets) socket.terminate(); await proxy.close(); await server.close(); }
}, 15000);
