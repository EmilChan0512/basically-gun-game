import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';

it.each(['classic', 'growth'] as const)('%s fills both teams and keeps human controllers on their teams', rules => {
  const room = new Room('bots', 'signal', 'tdm', false, rules);
  room.join('host', 'Host'); room.join('friend', 'Friend'); room.join('third', 'Third');
  room.configure('host', 'signal', 'tdm', 'standard', true);
  expect(room.lobby().fillBots).toBe(true);
  expect(() => room.start('host', 1)).toThrow('ready');
  for (const player of room.players.values()) room.ready(player.id, true);
  room.start('host', 1);
  const session = room.session!, battle = session.battle;
  expect(battle.actors).toHaveLength(8);
  expect(battle.actors.filter(a => a.human)).toHaveLength(3);
  for (const team of [1, 2]) expect(battle.actors.filter(a => a.team === team)).toHaveLength(4);
  for (const player of room.players.values()) expect(battle.actors.find(a => a.id === session.actorId(player.id))).toMatchObject({ name: player.name, team: player.team, human: true });
  const bots = battle.actors.filter(a => !a.human);
  expect(bots.every(a => a.name.includes('机器人'))).toBe(true);
  if (rules === 'growth') for (const bot of bots) expect(battle.growthV3!.participant(bot.id).loadout).toBeDefined();
  const positions = bots.map(a => a.movement.x);
  for (let i = 0; i < 90; i++) session.tick();
  expect(bots.some((a, i) => a.movement.x !== positions[i])).toBe(true);
  room.disconnect('friend'); room.expire('friend');
  expect(battle.result).toBeNull(); // Red bots keep the opposing team in the match.
  room.join('late', 'Late'); expect(session.actorId('late')).toBeNull();
  battle.endMatch(1, 'fixture'); room.returnToLobby('host');
  expect(room.fillBots).toBe(true);
  for (const player of room.players.values()) room.ready(player.id, true);
  room.start('host', 2);
  expect(room.session!.battle.actors).toHaveLength(8);
  expect(room.session!.actorId('late')).not.toBeNull();
});

it('validates host-only lobby changes atomically, resets ready, and permits disabling bots', () => {
  const room = new Room('config'); room.join('host', 'Host'); room.join('friend', 'Friend'); room.ready('friend', true);
  const before = structuredClone(room.lobby());
  expect(() => room.configure('friend', 'signal', 'tdm', 'standard', true)).toThrow();
  expect(() => room.configure('host', 'signal', 'tdm', 'standard', 'true')).toThrow();
  expect(room.lobby()).toEqual(before);
  room.configure('host', 'signal', 'tdm', 'standard', true);
  expect(room.players.get('friend')!.ready).toBe(false);
  room.configure('host', 'signal', 'dom'); expect(room.fillBots).toBe(true);
  room.configure('host', 'signal', 'tdm', 'standard', false);
  for (const player of room.players.values()) room.ready(player.id, true);
  room.start('host', 3); expect(room.session!.battle.actors).toHaveLength(2);
  expect(() => room.configure('host', 'signal', 'tdm', 'standard', true)).toThrow();
});

it('supports one or eight humans, without consuming join slots or adding excess bots', () => {
  for (const count of [1, 8]) {
    const room = new Room('capacity'); room.join('host', 'Host');
    room.configure('host', 'hijack', 'tdm', 'standard', true);
    for (let i = 1; i < count; i++) room.join(`p${i}`, `Player ${i}`);
    for (const player of room.players.values()) room.ready(player.id, true);
    room.start('host', 4);
    expect(room.session!.battle.actors).toHaveLength(8);
    expect(room.session!.battle.actors.filter(a => !a.human)).toHaveLength(8 - count);
  }
});

it('disables competitive bot fill when switching to cooperative waves', () => {
  const room = new Room('coop'); room.join('host', 'Host');
  room.configure('host', 'hijack', 'tdm', 'standard', true);
  room.configure('host', 'hijack', 'coop'); expect(room.fillBots).toBe(false);
  room.ready('host', true); room.start('host', 5);
  expect(room.session!.battle.actors.filter(a => a.team === 1)).toHaveLength(1);
});
