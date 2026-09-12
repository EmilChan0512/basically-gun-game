import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { GROWTH_CLASSES, GROWTH_POOLS, GROWTH_UPGRADES, GROWTH_WEAPONS, defaultGrowthLoadout, type GrowthClassId } from '../../src/shared/content/GrowthCatalog';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { awardGrowth } from '../../src/shared/simulation/Growth';
import { growthSpread } from '../../src/shared/simulation/GrowthCombat';
import { radarSvg } from '../../src/client/presentation/Radar';
import { MAPS } from '../../src/shared/content/Maps';

function roomFor(classId: GrowthClassId, mode: 'tdm' | 'dom' = 'tdm') {
  const room = new Room('classes', 'signal', mode, false, 'growth');
  room.join('a', 'A'); room.join('b', 'B'); room.equipGrowth('a', defaultGrowthLoadout(classId));
  room.ready('a', true); room.ready('b', true); room.start('a', 5);
  return room;
}
it('preserves three MVP classes and extends them with Medic and a seventh weapon with validated lobby selection', () => {
  expect(Object.keys(GROWTH_UPGRADES)).toHaveLength(42); expect(Object.values(GROWTH_POOLS).flat()).toHaveLength(32); expect(Object.keys(GROWTH_WEAPONS)).toHaveLength(7);
  for (const classId of Object.keys(GROWTH_CLASSES) as GrowthClassId[]) {
    const room = roomFor(classId), actor = room.session!.battle.player;
    expect(actor.life.maxHealth).toBe(GROWTH_CLASSES[classId].health);
    expect(actor.arsenal.selected).toBe(GROWTH_CLASSES[classId].primary);
    awardGrowth(actor.growth!, 1200, seededRandom(2), 0);
    expect(actor.growth!.offer!.cards.every(id => GROWTH_POOLS[classId].includes(id))).toBe(true);
    expect(GROWTH_POOLS[classId]).toHaveLength(8);
    expect(() => room.equipGrowth('a', defaultGrowthLoadout('sniper'))).toThrow();
  }
  const room = new Room('validation', 'signal', 'tdm', false, 'growth'); room.join('a', 'A');
  expect(() => room.equipGrowth('a', { classId: 'tank', primary: 'scout' })).toThrow();
  room.ready('a', true); room.equipGrowth('a', { classId: 'sniper', primary: 'mp5' }); expect(room.players.get('a')!.ready).toBe(false);
});
it('tank shields mitigate bullets and impose movement cost, armor is capped and cannot absorb environmental death', () => {
  const battle = roomFor('tank').session!.battle, tank = battle.player, enemy = battle.actors[1];
  tank.life.spawnProtectionFrames = 0; battle.useSkill(tank); battle.damage(tank, 20, enemy);
  expect(tank.life.health).toBeCloseTo(102);
  battle.tick(idleInput()); expect(tank.movement.speedScale).toBeCloseTo(.9 * .75);
  tank.growth!.selected.push('mobileCover'); battle.tick(idleInput()); expect(tank.movement.speedScale).toBeCloseTo(.9 * .95);
  tank.skillFrames = 0; tank.growth!.ultimate = true; tank.growth!.selected.push('emergencyPlate'); tank.life.health = 20;
  battle.damage(tank, 10, enemy); expect(tank.life.health).toBe(20); expect(tank.growth!.armor).toBe(15);
  battle.damage(tank, 20, enemy); expect(tank.life.health).toBe(15); expect(tank.growth!.armor).toBe(0);
  battle.damage(tank, 10000); expect(tank.life.alive).toBe(false); expect(tank.growth!.armor).toBe(0);
});
it('tank posture, explosion padding, repair, reload and kill reserve each affect their intended condition', () => {
  const battle = roomFor('tank').session!.battle, tank = battle.player, enemy = battle.actors[1];
  tank.growth!.selected = ['brace', 'blastPadding', 'fieldRepair', 'guardReload', 'reserveDrill', 'suppressiveGrip'];
  tank.life.spawnProtectionFrames = 0; tank.movement.crouching = true;
  battle.damage(tank, 10, enemy, true); expect(tank.life.health).toBeCloseTo(115 - 10 * .85 * .7);
  tank.arsenal.gun.ammo = 10; battle.reload(tank); expect(tank.arsenal.gun.reloadFrames).toBe(Math.ceil(tank.arsenal.gun.weapon.reloadFrames * .8));
  expect(growthSpread(tank)).toBe(.65);
  tank.arsenal.gun.reserveAmmo = 0; enemy.life.spawnProtectionFrames = 0; battle.damage(enemy, 1000, tank); expect(tank.arsenal.gun.reserveAmmo).toBe(10);
  tank.life.health = 50; tank.life.regenDelay = 999; tank.growth!.lastDamageTick = 0; tank.growth!.stationaryTicks = 60;
  battle.frame = 200; battle.tick(idleInput()); expect(tank.life.health).toBeCloseTo(50.1);
});
it('sniper focus trades mobility for aim and its conditional gun upgrades switch off outside their conditions', () => {
  const battle = roomFor('sniper').session!.battle, sniper = battle.player;
  sniper.growth!.selected = ['quickScope']; battle.useSkill(sniper);
  expect(sniper.skillFrames).toBe(60); expect(sniper.skillCooldown).toBe(288); expect(growthSpread(sniper)).toBe(.35);
  battle.tick(idleInput()); expect(sniper.movement.speedScale).toBe(.8);
  sniper.skillFrames = 0; sniper.skillCooldown = 0;
  sniper.growth!.selected = ['steadyAim']; sniper.growth!.stationaryTicks = 30; expect(growthSpread(sniper)).toBe(.6);
  sniper.growth!.stationaryTicks = 0; expect(growthSpread(sniper)).toBe(1);
  sniper.growth!.selected = ['firstShot']; expect(growthSpread(sniper)).toBe(.5); sniper.arsenal.gun.ammo--; expect(growthSpread(sniper)).toBe(1);
  sniper.growth!.selected = ['measuredReload', 'evasiveReload']; sniper.arsenal.gun.ammo = 1; battle.reload(sniper);
  expect(sniper.arsenal.gun.reloadFrames).toBe(36); battle.tick(idleInput()); expect(sniper.movement.speedScale).toBe(1.15);
  sniper.growth!.selected = ['sidearmReady']; battle.swap(sniper); sniper.movement.vx = 3; expect(growthSpread(sniper)).toBe(.65);
});
it('sniper ghost removes only enemy radar markers while preserving scene state and teammate visibility', () => {
  const battle = roomFor('sniper').session!.battle, sniper = battle.player;
  sniper.growth!.ghostUntil = 90;
  const message = { state: battle.snapshot(), actorId: battle.actors[1].id, mode: 'tdm' as const }, map = MAPS.find(m => m.id === 'signal')!.geometry;
  expect(radarSvg(map, message, 2)).not.toContain(`data-actor="${sniper.id}"`);
  expect(radarSvg(map, message, 1)).toContain(`data-actor="${sniper.id}"`);
  expect(message.state.actors.some(a => a.id === sniper.id)).toBe(true);
});
it('awards control contribution once per capture window, denies contested farming, and resumes checkpoint progress', () => {
  const room = roomFor('assault', 'dom'), battle = room.session!.battle, actor = battle.player, enemy = battle.actors[1];
  actor.movement.reset(battle.mission.objective.x, battle.mission.objective.y); enemy.movement.reset(100, 599.5);
  for (let i = 0; i < 150; i++) battle.tick(idleInput());
  expect(actor.growth!.xp).toBe(130); expect(enemy.growth!.xp).toBe(0);
  const restored = Battle.restore(battle.checkpoint());
  for (const b of [battle, restored]) {
    b.actors[1].movement.reset(b.player.movement.x, b.player.movement.y);
    for (let i = 0; i < 60; i++) b.tick(idleInput());
  }
  expect(actor.growth!.xp).toBe(130); expect(restored.checkpoint()).toEqual(battle.checkpoint());
});
it('grants a ten percent catch-up bonus when at least two levels below match average', () => {
  const room = roomFor('assault'), battle = room.session!.battle, actor = battle.player, enemy = battle.actors[1];
  enemy.growth!.level = 5; enemy.life.spawnProtectionFrames = 0;
  battle.damage(enemy, 1000, actor); expect(actor.growth!.xp).toBe(110);
});
