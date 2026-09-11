import { expect, it } from 'vitest';
import { interceptShield } from '../../src/shared/simulation/Shield';
import type { DamageContext } from '../../src/shared/simulation/DamageContext';
import { SPECIAL_OFFHANDS } from '../../src/shared/content/Offhands';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
const center = { x: 0, y: 0 }, right = { x: 100, y: 0 };
const hit = (x: number, y = 0): DamageContext => ({ kind: 'bullet', sourceId: 'enemy', amount: 100, origin: { x, y }, hitPoint: center });
it.each(Array.from({ length: 16 }, (_, i) => i * Math.PI / 8))('rotates defense through the full circle: %s radians', angle => {
  const shield = { durability: 120, deployed: true };
  const aim = { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 };
  expect(interceptShield(shield, center, aim, hit(aim.x, aim.y)).amount).toBe(25);
  expect(interceptShield(shield, center, aim, hit(-aim.x, -aim.y)).amount).toBe(100);
  expect(interceptShield(shield, center, aim, hit(-aim.y, aim.x)).amount).toBe(100);
});
it('wraps the -180/180 seam and uses the original 80-degree half arc', () => {
  const shield = { durability: 120, deployed: true };
  expect(interceptShield(shield, center, { x: -100, y: -1 }, hit(-100, 1)).amount).toBe(25);
  const at = (degrees: number) => hit(Math.cos(degrees * Math.PI / 180) * 100, Math.sin(degrees * Math.PI / 180) * 100);
  expect(interceptShield(shield, center, right, at(79)).amount).toBe(25);
  expect(interceptShield(shield, center, right, at(81)).amount).toBe(100);
});
it('reduces bullets, melee and blasts from the front but never environmental falls or rear blasts', () => {
  const shield = { durability: 120, deployed: true };
  for (const kind of ['bullet', 'melee', 'explosion'] as const) {
    expect(interceptShield(shield, center, right, { ...hit(100), kind }).amount).toBe(25);
    expect(interceptShield(shield, center, right, { ...hit(-100), kind }).amount).toBe(100);
  }
  expect(interceptShield(shield, center, right, { kind: 'environment', amount: 100 }).amount).toBe(100);
  expect(interceptShield(shield, center, right, hit(0)).amount).toBe(100);
  shield.deployed = false;
  expect(interceptShield(shield, center, right, hit(100)).amount).toBe(100);
});
it('keeps shields reusable and distinguishes all six defense profiles', () => {
  const shield = { durability: 120, deployed: true };
  for (const rules of Object.values(SPECIAL_OFFHANDS)) if (rules.kind === 'shield') {
    const damage = interceptShield(shield, center, right, hit(100), rules).amount;
    expect(damage).toBeGreaterThan(0); expect(damage).toBeLessThan(30.000001);
    for (let i = 0; i < 100; i++) expect(interceptShield(shield, center, right, hit(100), rules).amount).toBe(damage);
    expect(shield.deployed).toBe(true);
  }
  expect(interceptShield(shield, center, right, { ...hit(100), kind: 'explosion' }, SPECIAL_OFFHANDS['blast-shield']).amount).toBeCloseTo(6.6);
});
it('reflects only the first frontal bullet, never melee, explosions or another reflection', () => {
  const shield = { durability: 120, deployed: true }, rules = SPECIAL_OFFHANDS.siegius;
  expect(interceptShield(shield, center, right, hit(100), rules, () => 0)).toEqual({ amount: 0, blocked: 100, reflected: true });
  for (const kind of ['melee', 'explosion'] as const) expect(interceptShield(shield, center, right, { ...hit(100), kind }, rules, () => 0).reflected).toBe(false);
  expect(interceptShield(shield, center, right, { ...hit(100), reflected: true }, rules, () => 0).reflected).toBe(false);
  expect(interceptShield(shield, center, right, hit(-100), rules, () => 0).reflected).toBe(false);
});
it('preserves spawn protection and deterministic shield damage through checkpoints', () => {
  const battle = new Battle(customMatch('signal'), 'normal', 'm4', seededRandom(1)), target = battle.player;
  target.movement.reset(100, 200); target.aim = { x: 300, y: 158 };
  target.shield = { durability: 120, deployed: true };
  const context = { ...hit(300, 158), amount: 30, sourceId: battle.actors[4].id };
  battle.applyDamage(target, context); expect(target.life.health).toBe(target.life.maxHealth);
  target.life.spawnProtectionFrames = 0;
  const restored = Battle.restore(battle.checkpoint());
  for (const sim of [battle, restored]) sim.applyDamage(sim.player, context);
  expect(target.life.health).toBe(target.life.maxHealth - 7.5);
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});
