import { expect, it } from 'vitest';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { OffhandController } from '../../src/shared/simulation/Offhand';

function fixture(kind: 'melee' | 'shield') {
  const battle = new Battle({ ...customMatch('signal'), allies: 0, enemies: 1 });
  battle.actors.forEach((a, i) => { a.human = true; a.life.spawnProtectionFrames = 0; a.movement.reset(100 + i * 30, 200); });
  battle.player.offhand = new OffhandController(kind);
  battle.player.aim = { x: 300, y: 158 };
  battle.swap();
  return battle;
}
const attack = () => ({ ...idleInput(), fire: true, aim: { x: 300, y: 158 } });

it('runs knife damage through real Battle ticks, restores windup and suppresses guns', () => {
  const battle = fixture('melee');
  battle.tick(attack()); battle.tick(attack());
  battle.swap(); expect(battle.player.offhand!.equipped).toBe(true);
  const restored = Battle.restore(battle.checkpoint());
  for (let i = 0; i < 5; i++) { battle.tick(attack()); restored.tick(attack()); }
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(battle.actors[1].life.health).toBe(45);
  expect(battle.player.arsenal.shots).toBe(0);
  expect(battle.journal.since(0).filter(e => e.kind === 'damage')).toHaveLength(1);
});

it('uses deployed controller defense and resets durability on actual respawn', () => {
  const battle = fixture('shield');
  for (let i = 0; i < 6; i++) battle.tick(attack());
  const player = battle.player;
  expect(player.offhand!.shield.deployed).toBe(true);
  const context = { kind: 'bullet' as const, amount: 30, sourceId: battle.actors[1].id,
    origin: { x: player.movement.x + 100, y: player.movement.y - 42 },
    hitPoint: { x: player.movement.x, y: player.movement.y - 42 } };
  battle.applyDamage(player, context);
  expect(player.life.health).toBe(85); expect(player.offhand!.shield.durability).toBe(90);
  expect(player.arsenal.shots).toBe(0);
  battle.damage(player, 9999);
  player.life.respawnFrames = 0; battle.tick(idleInput());
  expect(player.life.alive).toBe(true);
  expect(player.offhand!.shield).toEqual({ durability: 120, deployed: false });
  expect(player.offhand!.equipped).toBe(false);
});

it('forces the special offhand while carrying a case and restores selection on release', () => {
  const battle = new Battle({ ...customMatch('hijack'), mode: 'ctf', allies: 0, enemies: 1 });
  battle.actors.forEach(a => a.human = true);
  battle.player.offhand = new OffhandController('shield');
  const base = battle.mission.deliveryBases![1]; battle.player.movement.reset(base.x, base.y);
  battle.tick(idleInput());
  expect(battle.player.offhand.equipped).toBe(true);
  battle.swap(); expect(battle.player.offhand.equipped).toBe(true);
  const restored = Battle.restore(battle.checkpoint());
  restored.releaseObjective(restored.player.id);
  expect(restored.player.offhand!.equipped).toBe(false);
  expect(restored.player.arsenal.selected).toBe('m4');
});
