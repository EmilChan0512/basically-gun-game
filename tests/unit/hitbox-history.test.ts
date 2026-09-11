import { expect, it } from 'vitest';
import { HitboxHistory, type HistoricalHitbox } from '../../src/shared/simulation/HitboxHistory';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

const unit = (x: number, generation = 0): HistoricalHitbox => ({ id: 'target', position: { x, y: 400 }, alive: true, generation, protected: false, team: 2 });
it('bounds historical frames and does not mutate authority positions', () => {
  const history = new HitboxHistory(); const current = [unit(500)];
  history.record(10, [unit(200)]);
  expect(history.resolve(14, 10, current)[0].position.x).toBe(200);
  for (const frame of [9, 15, 14, NaN, 10.5]) expect(history.resolve(14, frame, current)[0].position.x).toBe(500);
  expect(current[0].position.x).toBe(500);
  for (let tick = 11; tick < 100; tick++) history.record(tick, current);
  expect(history.checkpoint()).toHaveLength(5);
});
it('never hits another life, dead units, missing units or spawn protection', () => {
  const history = new HitboxHistory(); history.record(1, [unit(200)]);
  expect(history.resolve(2, 1, [unit(500, 1)])[0].alive).toBe(false);
  expect(history.resolve(2, 1, [{ ...unit(500), alive: false }])[0].alive).toBe(false);
  expect(history.resolve(2, 1, [{ ...unit(500), protected: true }])[0].alive).toBe(false);
  expect(history.resolve(2, 1, [{ ...unit(500), id: 'new' }])[0].alive).toBe(false);
  history.record(1, [{ ...unit(200), protected: true }]);
  expect(history.resolve(2, 1, [unit(500)])[0].alive).toBe(false);
});
it('historical fire hits a moved target, obeys walls and survives checkpoint restore', () => {
  const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1, terrain: [] }, 'normal', 'm4', seededRandom(1));
  const [shooter, target] = battle.actors;
  for (const actor of battle.actors) { actor.human = true; actor.life.spawnProtectionFrames = 0; }
  shooter.movement.reset(100, 400); target.movement.reset(350, 400); shooter.aim = { x: 350, y: 358 };
  battle.tickPlayers(new Map()); target.movement.reset(350, 200);
  const saved = battle.checkpoint();
  const fire = new Map([[shooter.id, { ...idleInput(), fire: true, aim: { x: 350, y: 358 } }]]);
  const ordinary = Battle.restore(saved); ordinary.tickPlayers(fire);
  expect(ordinary.actors[1].life.health).toBe(85);
  const restored = Battle.restore(saved);
  battle.tickPlayers(fire, new Map([[shooter.id, 0]])); restored.tickPlayers(fire, new Map([[shooter.id, 0]]));
  expect(battle.actors[1].life.health).toBeLessThan(85);
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  const blocked = Battle.restore({ ...saved, mission: { ...saved.mission, terrain: [{ x: 200, y: 0, width: 30, height: 500 }] } });
  blocked.tickPlayers(fire, new Map([[shooter.id, 0]]));
  expect(blocked.actors[1].life.health).toBe(85);
  expect(blocked.effects[0].trace.hit?.type).toBe('wall');
});
