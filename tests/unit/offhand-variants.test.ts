import { CLASS_STARTERS, type ClassId } from '../../src/game/campaign/Catalog';
import { expect, it } from 'vitest';
import { SPECIAL_OFFHANDS, type SpecialOffhandId } from '../../src/shared/content/Offhands';
import { validateEquipment } from '../../src/shared/content/Equipment';
import { CareerProgress } from '../../src/game/campaign/CareerProgress';
import { SAVE_KEY } from '../../src/game/campaign/Progress';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { OffhandController } from '../../src/shared/simulation/Offhand';
import { MeleeSwing } from '../../src/shared/simulation/Melee';

it.each(Object.keys(SPECIAL_OFFHANDS) as SpecialOffhandId[])('enforces class authority and preserves %s through respawn/checkpoint', id => {
  const definition = SPECIAL_OFFHANDS[id];
  for (const classId of ['medic', 'assassin', 'commando', 'tank']) {
    const equip = { classId, primary: CLASS_STARTERS[classId as ClassId], secondary: id };
    if (classId === definition.classId) expect(validateEquipment(equip)).toEqual(equip);
    else expect(() => validateEquipment(equip)).toThrow();
  }
  expect(() => validateEquipment({ primary: 'm4', secondary: id })).toThrow();
  const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1 }, 'normal', 'm4', seededRandom(1));
  battle.equipActor(battle.player, { classId: definition.classId, primary: CLASS_STARTERS[definition.classId], secondary: id });
  const restored = Battle.restore(battle.checkpoint());
  restored.player.life.spawnProtectionFrames = 0; restored.damage(restored.player, 9999);
  restored.player.life.respawnFrames = 0; restored.tick(idleInput());
  expect(restored.player.offhand?.id).toBe(id);
  expect(restored.snapshot().actors[0]).toMatchObject({ classId: definition.classId, offhand: { id, equipped: false } });
});
it('migrates illegal old offhands to a pistol, retaining progress and valid class variants', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const progress = new CareerProgress(storage);
  expect(progress.equipOffhand('knife')).toBe(false);
  progress.selectClass('assassin'); expect(progress.equipOffhand('katana')).toBe(false);
  progress.current.xp = 4960; progress.current.loadout.level = 32;
  expect(progress.equipOffhand('katana')).toBe(true);
  const raw = JSON.parse(storage.getItem(SAVE_KEY)!);
  raw.career.classes.medic.loadout.secondary = 'shield';
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const restored = new CareerProgress(storage);
  expect(restored.loadout.secondary).toBe('katana');
  expect(restored.current.xp).toBe(4960);
  restored.selectClass('medic'); expect(restored.loadout.secondary).toBe('usp');
});
it('short traces strike the nearest body once and long blades reach farther without hitting behind walls', () => {
  const run = (id: 'knife' | 'katana', distance: number, wall = (_x: number) => false) => {
    const swing = new MeleeSwing(SPECIAL_OFFHANDS[id]); swing.start({ x: 0, y: 0 }, { x: 100, y: 0 });
    const hits = [];
    for (let i = 0; i < 20; i++) hits.push(...swing.tick('self', 1, { x: 0, y: 0 }, [
      { id: 'far', team: 2 as const, alive: true, position: { x: distance + 20, y: 0 } },
      { id: 'near', team: 2 as const, alive: true, position: { x: distance, y: 0 } }], wall));
    return hits;
  };
  expect(run('knife', 80)).toEqual([]);
  expect(run('katana', 80)).toMatchObject([{ targetId: 'near', damage: { amount: 150 } }]);
  expect(run('katana', 80, x => x === 30)).toEqual([]);
});
it('reflects via a real ray, credits the defender and never bounces indefinitely', () => {
  const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1, terrain: [] }, 'normal', 'm4', () => 0);
  const [defender, attacker] = battle.actors;
  for (const actor of battle.actors) { actor.life.spawnProtectionFrames = 0; actor.human = true; }
  defender.movement.reset(100, 200); defender.aim = { x: 300, y: 158 };
  attacker.movement.reset(150, 200); attacker.aim = { x: 100, y: 158 };
  defender.offhand = new OffhandController('shield', 'siegius'); defender.offhand.shield.deployed = true;
  attacker.offhand = new OffhandController('shield', 'siegius'); attacker.offhand.shield.deployed = true;
  battle.applyDamage(defender, { kind: 'bullet', amount: 40, sourceId: attacker.id, origin: { x: 150, y: 158 }, hitPoint: { x: 110, y: 158 } });
  expect(defender.life.health).toBe(85);
  expect(attacker.life.health).toBeCloseTo(73);
  expect(battle.effects).toHaveLength(1);
  expect(battle.effects[0]).toMatchObject({ actorId: defender.id, reflected: true });
  expect(battle.journal.since(0).find(e => e.kind === 'damage')).toMatchObject({ actorId: defender.id, targetId: attacker.id });
});

it('stops a reflected ray at a wall instead of applying damage directly to the original shooter', () => {
  const battle = new Battle({ ...MISSIONS[0], allies: 0, enemies: 1,
    terrain: [{ x: 120, y: 0, width: 20, height: 400 }] }, 'normal', 'm4', () => 0);
  const [defender, attacker] = battle.actors;
  defender.life.spawnProtectionFrames = attacker.life.spawnProtectionFrames = 0;
  defender.movement.reset(100, 200); defender.aim = { x: 300, y: 158 }; attacker.movement.reset(160, 200);
  defender.offhand = new OffhandController('shield', 'siegius'); defender.offhand.shield.deployed = true;
  battle.applyDamage(defender, { kind: 'bullet', amount: 40, sourceId: attacker.id, origin: { x: 160, y: 158 }, hitPoint: { x: 110, y: 158 } });
  expect(attacker.life.health).toBe(85);
  expect(battle.effects[0].trace.hit).toEqual({ type: 'wall' });
});
