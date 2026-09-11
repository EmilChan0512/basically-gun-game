import { expect, it } from 'vitest';
import { interceptShield } from '../../src/shared/simulation/Shield';
import type { DamageContext } from '../../src/shared/simulation/DamageContext';
import { Battle } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
const hit = (x: number, y = 0): DamageContext => ({ kind: 'bullet', sourceId: 'enemy', amount: 30, origin: { x, y }, hitPoint: { x: 0, y: 0 } });
const center = { x: 0, y: 0 }, right = { x: 100, y: 0 };
it('applies defense in Battle, preserving protection and trusted checkpoints', () => {
  const battle = new Battle(customMatch('signal')), target = battle.player;
  target.movement.reset(100, 200); target.aim = { x: 300, y: 158 };
  target.shield = { durability: 20, deployed: true };
  const context: DamageContext = { ...hit(300, 158), sourceId: battle.actors[4].id };
  battle.applyDamage(target, context);
  expect(target.shield.durability).toBe(20); // Birth protection does not spend durability.
  target.life.spawnProtectionFrames = 0;
  const restored = Battle.restore(battle.checkpoint());
  for (const sim of [battle, restored]) sim.applyDamage(sim.player, context);
  expect(target.life.health).toBe(target.life.maxHealth - 10);
  expect(target.shield).toEqual({ durability: 0, deployed: false });
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});
it('blocks frontal bullets, but not rear or side impacts', () => {
  const shield = { durability: 100, deployed: true };
  expect(interceptShield(shield, center, right, hit(100))).toEqual({ amount: 0, blocked: 30 });
  expect(interceptShield(shield, center, right, hit(-100))).toEqual({ amount: 30, blocked: 0 });
  expect(interceptShield(shield, center, right, hit(0, 100))).toEqual({ amount: 30, blocked: 0 });
  expect(shield.durability).toBe(70);
});
it('passes excess damage through when durability breaks, without going negative', () => {
  const shield = { durability: 12, deployed: true };
  expect(interceptShield(shield, center, right, hit(100))).toEqual({ amount: 18, blocked: 12 });
  expect(shield).toEqual({ durability: 0, deployed: false });
  expect(interceptShield(shield, center, right, hit(100)).amount).toBe(30);
});
it('bypasses stowed shields, explosions, melee and environmental damage', () => {
  const shield = { durability: 100, deployed: false };
  expect(interceptShield(shield, center, right, hit(100)).blocked).toBe(0);
  shield.deployed = true;
  for (const kind of ['explosion', 'melee'] as const) expect(interceptShield(shield, center, right, { ...hit(100), kind }).blocked).toBe(0);
  expect(interceptShield(shield, center, right, { kind: 'environment', amount: 30 }).blocked).toBe(0);
  expect(shield.durability).toBe(100);
});
it('rotates defense with aim and does not invent a direction for overlapping origins', () => {
  const shield = { durability: 100, deployed: true };
  expect(interceptShield(shield, center, { x: -100, y: 0 }, hit(-100)).blocked).toBe(30);
  expect(interceptShield(shield, center, right, hit(0)).blocked).toBe(0);
});
