import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

it('a red-side win emits one terminal event and restored journal does not replay consumed events', () => {
  const b = new Battle({ ...MISSIONS[0], goal: 1 }, 'easy', 'm4', seededRandom(1));
  b.player.life.spawnProtectionFrames = 0;
  b.damage(b.player, 999, b.actors[1]); b.tick(idleInput());
  expect(b.result).toMatchObject({ winner: 2, draw: false });
  const cursor = b.journal.cursor;
  expect(b.journal.since(0).filter(e => e.kind === 'result')).toHaveLength(1);
  const restored = Battle.restore(JSON.parse(JSON.stringify(b.checkpoint())));
  restored.tick(idleInput());
  expect(restored.journal.since(cursor)).toEqual([]);
  expect(restored.result).toEqual(b.result);
});

it('domination partial capture progress survives checkpoint and contested ticks do not add points', () => {
  const b = new Battle(MISSIONS[2], 'easy', 'm4', seededRandom(1));
  b.actors.forEach(a => { a.human = true; a.movement.reset(a.team === 1 ? 900 : 1600, 599.5); });
  for (let i = 0; i < 17; i++) b.tickPlayers(new Map());
  expect(b.scores).toEqual([0, 0]);
  const restored = Battle.restore(JSON.parse(JSON.stringify(b.checkpoint())));
  for (let i = 0; i < 13; i++) restored.tickPlayers(new Map());
  expect(restored.scores).toEqual([1, 0]);
  restored.actors.find(a => a.team === 2)!.movement.reset(900, 599.5);
  for (let i = 0; i < 60; i++) restored.tickPlayers(new Map());
  expect(restored.objective).toBe('contested'); expect(restored.scores).toEqual([1, 0]);
});
