import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { defaultGrowthLoadout, GROWTH_WEAPONS } from '../../src/shared/content/GrowthCatalog';
import { growthReloadScale, growthSpeed, growthSpread } from '../../src/shared/simulation/GrowthCombat';

function clinic() {
  const room = new Room('clinic', 'signal', 'tdm', false, 'growth');
  for (let i = 0; i < 8; i++) { room.join(`${i}`, `Player ${i}`); room.ready(`${i}`, true); }
  room.equipGrowth('0', defaultGrowthLoadout('medic')); room.ready('0', true); room.start('0', 3);
  const battle = room.session!.battle, medic = battle.player;
  for (const actor of battle.actors) { actor.movement.reset(220, 599.5); actor.life.spawnProtectionFrames = 0; }
  const allies = battle.actors.filter(a => a.team === medic.team && a !== medic), enemy = battle.actors.find(a => a.team !== medic.team)!;
  return { battle, medic, allies, enemy };
}

it('Medic heals actual visible allied wounds, earns authority XP, and has a complete independent FAMAS build', () => {
  const { battle, medic, allies: [ally], enemy } = clinic();
  expect(medic.life.maxHealth).toBe(95); expect(medic.arsenal.gun.weapon).toEqual(GROWTH_WEAPONS.famas);
  expect(battle.useSkill(medic)).toBe(false); expect(medic.skillCooldown).toBe(0);
  battle.damage(ally, 60, enemy); expect(ally.life.health).toBe(40);
  expect(battle.useSkill(medic)).toBe(true); expect(ally.life.health).toBe(65);
  expect(medic.growth!.xp).toBe(12); expect(medic.growth!.metrics.healingDone).toBe(25);
  expect(medic.skillCooldown).toBe(420); expect(growthSpeed(medic, battle.frame)).toBe(.9);
  expect(battle.journal.since(0)).toContainEqual(expect.objectContaining({ ability: 'medicPulse', amount: 25, targetId: ally.id }));
  expect(battle.useSkill(medic)).toBe(false);
  const restored = Battle.restore(battle.checkpoint()); battle.tick(idleInput()); restored.tick(idleInput());
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});

it('rejects self/environment/overheal XP and excludes dead, distant and occluded recipients', () => {
  const { battle, medic, allies: [ally], enemy } = clinic();
  battle.damage(medic, 30, enemy); battle.damage(ally, 30);
  battle.useSkill(medic); expect(medic.growth!.xp).toBe(0); expect(medic.life.health).toBe(90);
  medic.life.health = medic.life.maxHealth; ally.life.health = ally.life.maxHealth; medic.skillCooldown = 0;
  battle.damage(ally, 40, enemy); ally.movement.x = 600;
  expect(battle.useSkill(medic)).toBe(false);
  ally.movement.x = 220; ally.life.alive = false; expect(battle.useSkill(medic)).toBe(false);
  ally.life.alive = true; ally.movement.x = 250;
  Object.defineProperty(battle, 'wall', { value: () => true });
  expect(battle.useSkill(medic)).toBe(false);
});

it('caps healing credit per recipient across medics and deaths, and per healer time window', () => {
  const { battle, medic, allies, enemy } = clinic(); medic.growth!.selected = ['triage'];
  for (const ally of allies) battle.damage(ally, 90, enemy);
  battle.useSkill(medic); expect(medic.growth!.xp).toBe(40); expect(medic.growth!.healingWindowXp).toBe(40);
  medic.skillCooldown = 0; battle.useSkill(medic); expect(medic.growth!.xp).toBe(40);
  const other = allies[1]; battle.equipGrowth(other, defaultGrowthLoadout('medic')); other.movement.reset(220, 599.5);
  battle.useSkill(other); expect(other.growth!.xp).toBe(0);
  const target = allies[0]; battle.damage(target, 1000); target.life.alive = true; target.life.health = target.life.maxHealth;
  battle.damage(target, 50, enemy); medic.skillCooldown = 0;
  battle.useSkill(medic); expect(medic.growth!.xp).toBe(40);
  battle.frame = 901; medic.skillCooldown = 0; battle.damage(target, 20, enemy);
  battle.useSkill(medic); expect(medic.growth!.xp).toBeGreaterThan(40);
});

it('implements rescue, ranged/fast triage, handling, self-care and support armor with distinct costs', () => {
  const { battle, medic, allies: [ally], enemy } = clinic();
  medic.growth!.selected = ['widePulse', 'rapidAid', 'selfCare', 'triage'];
  ally.movement.x = 450; battle.damage(ally, 80, enemy); battle.damage(medic, 50, enemy);
  battle.useSkill(medic); expect(ally.life.health).toBe(45); expect(medic.life.health).toBe(68);
  expect(medic.skillCooldown).toBe(336);
  medic.skillCooldown = 0; medic.growth!.selected = ['rescueSprint', 'sharedSupplies', 'clinicalGrip', 'aidReload'];
  ally.movement.x = 220; ally.arsenal.gun.reserveAmmo = 0;
  battle.useSkill(medic); expect(ally.arsenal.gun.reserveAmmo).toBe(4);
  expect(growthSpeed(medic, battle.frame)).toBe(1.2); expect(growthSpread(medic)).toBe(.7); expect(growthReloadScale(medic)).toBe(.75);
  medic.skillCooldown = 0; medic.growth!.selected = ['mobileClinic', 'protectiveAid']; medic.growth!.ultimate = true;
  battle.damage(ally, 20, enemy); battle.useSkill(medic);
  expect(medic.skillCooldown).toBe(462); expect(ally.growth!.armor).toBe(15);
  expect(ally.growth!.armorUntil).toBe(90); expect(ally.growth!.cooldowns.lifeline).toBe(600);
  medic.growth!.momentumUntil = 0; expect(growthSpeed(medic, battle.frame)).toBe(1);
  battle.damage(ally, 1000); expect(ally.growth!.armor).toBe(0); expect(ally.growth!.healableDamage).toBe(0);
});
