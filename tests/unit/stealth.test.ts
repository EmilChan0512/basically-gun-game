import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { defaultLoadout } from '../../src/game/campaign/Catalog';
import { RevealPolicy } from '../../src/shared/simulation/RevealPolicy';
import { isConcealed } from '../../src/shared/simulation/Stealth';
import { traceBulletLine } from '../../src/game/combat/Ballistics';

function setup() {
  const battle = new Battle({ ...MISSIONS[0], enemies: 1, allies: 0, goal: 999 }, 'normal', 'm4', seededRandom(42), defaultLoadout('assassin'));
  const enemy = battle.actors[1]; enemy.human = true;
  battle.player.movement.reset(200, 599.5); enemy.movement.reset(430, 599.5);
  for (let i = 0; i < 20; i++) battle.tick(idleInput());
  battle.player.stealthFrames = 0;
  return { battle, actor: battle.player, enemy };
}
function wait(b: Battle, frames = 150) { for (let i = 0; i < frames; i++) b.tick(idleInput()); }

it('enters at exactly 150 stationary ticks, is hidden from enemies but visible to teammates', () => {
  const { battle, actor } = setup(), reveal = new RevealPolicy();
  wait(battle, 149); expect(isConcealed(actor)).toBe(false);
  wait(battle, 1); expect(actor.stealthFrames).toBe(150); expect(isConcealed(actor)).toBe(true);
  expect(reveal.visible(battle.actors, battle.frame, [], () => false, 2).has(actor.id)).toBe(false);
  expect(reveal.visible(battle.actors, battle.frame, [], () => false, 1).has(actor.id)).toBe(true);
  expect(reveal.visible(battle.actors, battle.frame, [], () => false, 2, new Set([actor.id])).has(actor.id)).toBe(true);
});
it('keeps crouch walking concealed, standing still stays concealed, standing movement and jumping reset it', () => {
  const { battle, actor } = setup(); wait(battle);
  const x = actor.movement.x;
  for (let i = 0; i < 10; i++) battle.tick({ ...idleInput(), crouch: true, right: true });
  expect(actor.movement.x).toBeGreaterThan(x); expect(isConcealed(actor)).toBe(true);
  for (let i = 0; i < 15; i++) battle.tick({ ...idleInput(), crouch: true });
  battle.tick(idleInput()); expect(isConcealed(actor)).toBe(true);
  battle.tick({ ...idleInput(), right: true }); expect(actor.stealthFrames).toBe(0);
  wait(battle, 160); expect(isConcealed(actor)).toBe(true);
  battle.tick({ ...idleInput(), jump: true }); expect(actor.stealthFrames).toBe(0);
});
it('crouch movement cannot charge the passive; actual shots and reloads break it and require a fresh wait', () => {
  const { battle, actor } = setup();
  for (let i = 0; i < 20; i++) battle.tick({ ...idleInput(), crouch: true, right: true });
  expect(actor.stealthFrames).toBe(0);
  wait(battle, 165); expect(isConcealed(actor)).toBe(true);
  battle.tick({ ...idleInput(), fire: true }); expect(actor.stealthFrames).toBe(0);
  wait(battle, 150); expect(isConcealed(actor)).toBe(true);
  battle.reload(); expect(actor.stealthFrames).toBe(0);
  expect(actor.arsenal.gun.reloadFrames).toBeGreaterThan(0);
  while (actor.arsenal.gun.reloadFrames) { battle.tick(idleInput()); expect(actor.stealthFrames).toBe(0); }
  wait(battle, 149); expect(isConcealed(actor)).toBe(false);
  wait(battle, 1); expect(isConcealed(actor)).toBe(true);
});
it('remains hittable and concealed after nonlethal damage, clears on death and respawn', () => {
  const { battle, actor, enemy } = setup(); wait(battle);
  actor.life.spawnProtectionFrames = 0;
  const trace = traceBulletLine({ origin: { x: actor.movement.x + 100, y: actor.movement.y - 30 }, aim: { x: actor.movement.x, y: actor.movement.y - 30 },
    source: enemy.id, sourceTeam: enemy.team, units: battle['hitboxes'](), rangeUnits: 60, random: seededRandom(1), isOpaqueWall: () => false });
  expect(trace.hit?.type).toBe('unit');
  const hp = actor.life.health; battle.damage(actor, 10, enemy);
  expect(actor.life.health).toBe(hp - 10); expect(isConcealed(actor)).toBe(true);
  battle.damage(actor, 999, enemy); expect(actor.stealthFrames).toBe(0);
  wait(battle, 155); expect(actor.life.alive).toBe(true); expect(isConcealed(actor)).toBe(false);
});
it('preserves countdown in checkpoints and resets on class reconfiguration; other classes never gain it', () => {
  const { battle, actor } = setup(); wait(battle, 120);
  const restored = Battle.restore(battle.checkpoint()); wait(restored, 30); expect(isConcealed(restored.player)).toBe(true);
  battle.mission.debug = true;
  battle.reconfigureDebugActor(actor, { classId: 'medic', primary: 'm4', secondary: 'usp' });
  wait(battle, 160); expect(actor.stealthFrames).toBe(0);
});
it('AI forgets a concealed target', () => {
  const { battle, actor, enemy } = setup(); wait(battle);
  enemy.human = false; enemy.brain.target = actor.id;
  battle.tick(idleInput()); expect(enemy.brain.target).toBeNull();
});
