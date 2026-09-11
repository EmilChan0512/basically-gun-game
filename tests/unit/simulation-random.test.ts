import { expect, it } from 'vitest';
import { createRandom } from '../../src/shared/simulation/Random';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

it('restores the exact next random sequence after JSON roundtrip', () => {
  const rng = createRandom(42);
  for (let i = 0; i < 999; i++) rng();
  const saved = JSON.parse(JSON.stringify(rng.state()));
  const expected = Array.from({ length: 100 }, rng);
  const restored = createRandom(0); restored.restore(saved);
  expect(Array.from({ length: 100 }, restored)).toEqual(expected);
});

it('reports draws independently of campaign failure semantics', () => {
  const battle = new Battle({ ...MISSIONS[0], seconds: 0 });
  expect(battle.result).toBeNull();
  battle.tick(idleInput());
  expect(battle.phase).toBe('lost');
  expect(battle.result).toMatchObject({ winner: null, draw: true, tick: 1 });
});
