import { expect, it } from 'vitest';
import { LatencyBudget } from '../../server/LatencyBudget';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';

it('uses fresh server-clock nonce samples, ignores forged/replayed replies and caps rewind', () => {
  const timing = new LatencyBudget();
  expect(timing.shotFrame(100, 0)).toBeUndefined();
  timing.begin('a', 0);
  expect(timing.complete('forged', 1)).toBe(false);
  expect(timing.complete('a', 50)).toBe(true);
  expect(timing.complete('a', 100)).toBe(false);
  expect(timing.shotFrame(100, 100)).toBe(98);
  timing.begin('b', 200); timing.complete('b', 2200);
  expect(timing.shotFrame(100, 2200)).toBe(98);
  expect(timing.shotFrame(100, 11000)).toBe(97);
  expect(timing.shotFrame(100, 13000)).toBeUndefined();
  timing.begin('c', 14000); expect(timing.complete('c', 17000)).toBe(false);
  expect(timing.shotFrame(100, 17000)).toBeUndefined();
});

function fixture() {
  const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1, terrain: [] }, 'normal', 'm4', seededRandom(1));
  const [shooter, target] = battle.actors;
  for (const actor of battle.actors) { actor.human = true; actor.life.spawnProtectionFrames = 0; }
  shooter.movement.reset(100, 400); target.movement.reset(350, 400); shooter.aim = { x: 350, y: 358 };
  const session = new MatchSession(battle); session.bind('p', shooter.id);
  session.tick(); target.movement.reset(350, 200);
  return session;
}
const fire = { sequence: 0, input: { ...idleInput(), fire: true, aim: { x: 350, y: 358 } }, actions: [] };
it('only authority metadata enables rewind and survives a queued checkpoint', () => {
  const forged = fixture(); forged.submit('p', { ...fire, shotFrame: 0 } as typeof fire); forged.tick();
  expect(forged.battle.actors[1].life.health).toBe(85);
  const trusted = fixture(); trusted.submit('p', fire, 0);
  const restored = MatchSession.restore(trusted.checkpoint()); trusted.tick(); restored.tick();
  expect(trusted.battle.actors[1].life.health).toBeLessThan(85);
  expect(restored.checkpoint()).toEqual(trusted.checkpoint());
});
it('an old queued command falls back to current hitboxes after the hard history window', () => {
  const session = fixture();
  // Discrete actions are not coalesced, so this still exercises an actually
  // queued old shot rather than the new continuous-input catch-up path.
  for (let sequence = 0; sequence < 4; sequence++) session.submit('p', { sequence, input: idleInput(), actions: ['skill'] });
  session.submit('p', { ...fire, sequence: 4 }, 0);
  for (let i = 0; i < 5; i++) session.tick();
  expect(session.battle.actors[1].life.health).toBe(85);
  expect(session.acknowledgements().p).toBe(4);
});
