import { expect, it } from 'vitest';
import { Battle } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { validateDamageContext, type DamageContext } from '../../src/shared/simulation/DamageContext';
it('requires finite combat geometry and an authoritative source but permits environmental damage', () => {
  expect(() => validateDamageContext({ kind: 'bullet', amount: 10 })).toThrow();
  expect(() => validateDamageContext({ kind: 'environment', amount: Infinity })).toThrow();
  expect(() => validateDamageContext({ kind: 'environment', amount: 10, sourceId: 'forged' })).toThrow();
  expect(() => validateDamageContext({ kind: 'melee', amount: 10, sourceId: 'a', origin: { x: NaN, y: 0 }, hitPoint: { x: 0, y: 0 } })).toThrow();
  expect(() => validateDamageContext({ kind: 'environment', amount: 10 })).not.toThrow();
});
it('rejects unknown damage sources before changing life and retains friendly fire filtering', () => {
  const battle = new Battle(customMatch('hijack')), player = battle.player;
  player.life.spawnProtectionFrames = 0;
  const context: DamageContext = { kind: 'melee', amount: 10, sourceId: 'missing', origin: { x: 0, y: 0 }, hitPoint: { x: 1, y: 0 } };
  expect(() => battle.applyDamage(player, context)).toThrow();
  expect(player.life.health).toBe(player.life.maxHealth);
  expect(battle.applyDamage(player, { ...context, sourceId: battle.actors[1].id })).toBe(false);
  expect(player.life.health).toBe(player.life.maxHealth);
  battle.applyDamage(player, { ...context, sourceId: battle.actors[4].id });
  expect(player.life.health).toBe(player.life.maxHealth - 10);
});
it('passes grenade impact position to damage resolution instead of the shooter position', () => {
  const battle = new Battle({ ...customMatch('signal'), allies: 0, enemies: 1, terrain: [], navigation: [] });
  const [source, target] = battle.actors; source.movement.reset(100, 200); target.movement.reset(400, 200);
  target.human = true; target.life.spawnProtectionFrames = 0;
  const contexts: DamageContext[] = [], apply = battle.applyDamage.bind(battle);
  battle.applyDamage = (actor, context) => { contexts.push(structuredClone(context)); return apply(actor, context); };
  battle.grenades.push({ source, x: 400, y: 160, vx: 0, vy: 0, fuse: 1 });
  battle.tickPlayers(new Map());
  expect(contexts).toHaveLength(1);
  expect(contexts[0]).toMatchObject({ kind: 'explosion', sourceId: source.id, origin: { x: 400 } });
  expect(contexts[0].origin!.x).not.toBe(source.movement.x);
  expect(target.life.health).toBeLessThan(target.life.maxHealth);
});
