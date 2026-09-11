import { it, expect } from 'vitest';
import { WEAPONS, SPECIAL_OFFHANDS, defaultLoadout, levelForXp, canEquipWeapon, type ClassId } from '../../src/game/campaign/Catalog';
import { validateEquipment } from '../../src/shared/content/Equipment';
import { launchProjectile, stepProjectile } from '../../src/shared/simulation/WeaponProjectile';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

it('uses all original class progression stages with shared sidearms and class-correct free starters', () => {
  expect(Object.keys(WEAPONS)).toHaveLength(54);
  const stages: Record<ClassId, number[]> = { medic: [1,2,6,8,11,14,17,20,23,26,29,32], assassin: [1,6,11,17,23,29], commando: [1,2,6,8,11,14,17,20,23,26,29,32], tank: [1,6,11,17,23,29] };
  for (const role of Object.keys(stages) as ClassId[]) {
    expect(Object.values(WEAPONS).filter(w => w.classId === role).map(w => w.level)).toEqual(stages[role]);
    expect(() => validateEquipment(defaultEquipment(role))).not.toThrow();
    expect(WEAPONS[defaultLoadout(role).primary].price).toBe(0);
  }
  expect(WEAPONS.vector).toMatchObject({ slot: 'secondary', classId: 'shared', level: 15 });
  expect(WEAPONS.ak47.level).toBe(29); expect(WEAPONS.deagle.level).toBe(41);
  expect(canEquipWeapon('tank', 'm4')).toBe(false);
  expect(Object.values(SPECIAL_OFFHANDS).filter(w => w.classId === 'assassin').map(w => w.level)).toEqual([2,8,14,20,26,32]);
  expect(levelForXp(7840)).toBe(50); expect(levelForXp(999999)).toBe(50);
});
function defaultEquipment(role: ClassId) { const l = defaultLoadout(role); return { classId: role, primary: l.primary, secondary: l.secondary }; }
it('rockets travel over multiple ticks, cannot tunnel through a thin wall, and collide with enemies', () => {
  const p = launchProjectile('a', 1, 'rpg', { x: 0, y: 50 }, { x: 200, y: 50 }, () => .5);
  expect(stepProjectile(p, [], () => false)).toBeNull(); expect(p.x).toBe(70);
  expect(stepProjectile(p, [], x => x >= 95 && x < 101)).not.toBeNull(); expect(p.fuse).toBe(0);
  const shot = launchProjectile('a', 1, 'rpg', { x: 0, y: 50 }, { x: 200, y: 50 }, () => .5);
  expect(stepProjectile(shot, [{ id: 'friend', team: 1, alive: true, position: { x: 20, y: 75 } }, { id: 'enemy', team: 2, alive: true, position: { x: 50, y: 75 } }], () => false)?.targetId).toBe('enemy');
});
it('grenades bounce before their fuse and homing missiles turn toward nearby enemies', () => {
  const p = launchProjectile('a', 1, 'thumper', { x: 0, y: 50 }, { x: 100, y: 50 }, () => .5);
  stepProjectile(p, [], x => x >= 20); expect(p.vx).toBeLessThan(0); expect(p.fuse).toBe(44);
  p.fuse = 1; expect(stepProjectile(p, [], () => false)).not.toBeNull();
  const missile = launchProjectile('a', 1, 'stinger', { x: 0, y: 50 }, { x: 100, y: 50 }, () => .5);
  stepProjectile(missile, [{ id: 'b', team: 2, alive: true, position: { x: 80, y: 140 } }], () => false);
  expect(missile.vy).toBeGreaterThan(0);
});
it('checkpoint restores in-flight rockets and resolves the same damage without a long hitscan line', () => {
  const kit = { ...defaultLoadout('commando'), primary: 'rpg' as const };
  const battle = new Battle(MISSIONS[0], 'easy', 'rpg', seededRandom(9), kit);
  battle.player.movement.reset(300, 599.5); battle.player.aim = { x: 600, y: 559.5 };
  battle.tick({ ...idleInput(), fire: true, aim: battle.player.aim });
  expect(battle.projectiles).toHaveLength(1);
  const effect = battle.effects.find(e => e.actorId === battle.player.id)!;
  expect(effect.trace.origin).toEqual(effect.trace.end);
  const restored = Battle.restore(battle.checkpoint());
  for (let i = 0; i < 15; i++) { battle.tick(idleInput()); restored.tick(idleInput()); }
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});
