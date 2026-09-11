import { expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../../server/server';
import { delayedProxy } from '../../tools/network/delayed-proxy';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import type { StateMessage } from '../../src/shared/protocol/State';

it('eight mixed clients through 150ms RTT resolve knife and front/rear shield damage authoritatively', async () => {
  const server = startServer(0); await new Promise<void>(r => server.wss.once('listening', r));
  const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No port');
  const proxy = await delayedProxy(`ws://127.0.0.1:${address.port}`, 150, 10, 0);
  const sockets: WebSocket[] = [], logs: any[][] = Array.from({ length: 8 }, () => []);
  const send = (i: number, message: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...message }));
  const wait = async (predicate: () => boolean) => {
    const until = performance.now() + 6000;
    while (!predicate()) { if (performance.now() > until) throw Error('Mixed equipment fixture timeout'); await new Promise(r => setTimeout(r, 10)); }
  };
  let driver: ReturnType<typeof setInterval> | undefined;
  try {
    for (let i = 0; i < 8; i++) {
      const socket = new WebSocket(proxy.url); sockets.push(socket);
      socket.on('message', raw => { const m = JSON.parse(raw.toString()); logs[i].push(m); if (m.type === 'probe') send(i, { type: 'probeReply', nonce: m.nonce }); });
    }
    await wait(() => logs.every(log => log.some(m => m.type === 'welcome')));
    send(0, { type: 'create', name: 'p0' }); await wait(() => logs[0].some(m => m.type === 'lobby'));
    const code = logs[0].find(m => m.type === 'lobby').room.id;
    // Sequential joins give stable team assignment for the controlled pairs.
    for (let i = 1; i < 8; i++) { send(i, { type: 'join', code, name: `p${i}` }); await wait(() => logs[i].some(m => m.type === 'lobby')); }
    const secondary = ['knife', 'shield', 'usp', 'shield', 'knife', 'usp', 'shield', 'beretta'];
    for (let i = 0; i < 8; i++) { send(i, { type: 'equip', equipment: { classId: secondary[i] === 'knife' ? 'assassin' : secondary[i] === 'shield' ? 'tank' : 'medic', primary: 'm4', secondary: secondary[i] } }); send(i, { type: 'ready', ready: true }); }
    await wait(() => logs[0].some(m => m.room?.players.length === 8 && m.room.players.every((p: any) => p.ready)));
    send(0, { type: 'start' }); await wait(() => logs.every(log => log.some(m => m.type === 'state')));
    const room = server.rooms.get(code)!;
    // Isolate damage geometry; this is not a natural match or a player teleport API.
    const battle = new Battle({ ...MISSIONS[0], allies: 3, enemies: 4,
      terrain: [{ x: 0, y: 400, width: 1800, height: 300 }] }, 'normal', 'm4', seededRandom(1));
    const roster = [...room.players.values()].sort((a, b) => a.team - b.team);
    const session = new MatchSession(battle);
    roster.forEach((p, i) => { battle.actors[i].name = p.name; battle.equipActor(battle.actors[i], p.equipment); session.bind(p.id, battle.actors[i].id); });
    const actors = Array.from({ length: 8 }, (_, i) => battle.actors.find(a => a.name === `p${i}`)!);
    const positions = [100, 140, 400, 550, 1000, 1100, 1250, 1350];
    actors.forEach((a, i) => { a.movement.reset(positions[i], 399.5); a.life.spawnProtectionFrames = 0; a.aim = { x: positions[i] + (i % 2 ? -100 : 100), y: 357.5 }; });
    room.session = session;
    const controls = actors.map(a => ({ ...idleInput(), aim: { ...a.aim } }));
    controls[1].fire = true; controls[3].fire = true;
    const actions = actors.map(a => a.offhand ? ['swap'] : []);
    const sequences = Array(8).fill(0);
    driver = setInterval(() => {
      for (let i = 0; i < 8; i++) send(i, { type: 'input', roomId: code, round: 1,
        command: { sequence: sequences[i]++, input: controls[i], actions: actions[i].splice(0) } });
    }, 70);
    await wait(() => actors[1].offhand!.shield.deployed && actors[3].offhand!.shield.deployed);
    controls[0].fire = true;
    await wait(() => actors[1].life.health < 130);
    controls[0].fire = false;
    expect(actors[1].life.health).toBe(117.5);
    expect(actors[1].offhand!.shield.durability).toBe(120); // Frontal melee receives the same directional reduction.
    controls[2].fire = true;
    await wait(() => actors[3].life.health < 130);
    controls[2].fire = false;
    expect(actors[3].life.health).toBeGreaterThan(100);
    const stopFrame = battle.frame; await wait(() => battle.frame >= stopFrame + 10);
    const durability = actors[3].offhand!.shield.durability, frontHealth = actors[3].life.health;
    controls[3].aim = { x: 800, y: 357.5 }; // Turn away through normal aim commands.
    await wait(() => actors[3].aim.x > 700);
    controls[2].fire = true;
    await wait(() => actors[3].life.health < frontHealth);
    controls[2].fire = false;
    expect(actors[3].offhand!.shield.durability).toBe(durability);
    expect(actors[0].arsenal.shots).toBe(0);
    expect(battle.journal.since(0).filter(e => e.kind === 'damage' && e.actorId === actors[0].id && e.targetId === actors[1].id)).toHaveLength(1);
    const received = (i: number) => logs[i].filter(m => m.type === 'state').at(-1) as StateMessage;
    await wait(() => received(3).state.actors.some(a => a.id === actors[3].id && a.life.health < frontHealth));
    expect(received(3).state.actors.find(a => a.id === actors[3].id)!.offhand).toMatchObject({ kind: 'shield', equipped: true, durability });
    expect(logs.flat().filter(m => m.type === 'error' || m.type === 'rejected')).toEqual([]);
  } finally { if (driver) clearInterval(driver); for (const socket of sockets) socket.terminate(); await proxy.close(); await server.close(); }
}, 20000);
