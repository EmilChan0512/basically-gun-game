import { expect, it } from 'vitest';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { botInput } from '../../src/shared/simulation/BotController';
import { createMode } from '../../src/shared/simulation/ModeRules';

function fixture(secondary: 'knife' | 'shield') {
  const battle = new Battle({ ...customMatch('signal'), allies: 0, enemies: 1,
    terrain: [{ x: 0, y: 500, width: 1800, height: 200 }], collisionMask: undefined,
    navigation: [{ x: 100, y: 499, links: [1] }, { x: 500, y: 499, links: [0] }] }, 'normal', 'm4', seededRandom(9));
  battle.player.human = false; battle.actors[1].human = true;
  battle.equipActor(battle.player, { classId: secondary === 'knife' ? 'assassin' : 'tank', primary: secondary === 'knife' ? 'scout' : 'shotgun', secondary });
  battle.actors.forEach((a, i) => { a.movement.reset(200 + i * 80, 499); a.life.spawnProtectionFrames = 0; });
  battle.player.aim = { x: 280, y: 457 };
  return battle;
}
it('closes knife distance and attacks repeatedly through ordinary AI inputs without gunfire', () => {
  const battle = fixture('knife'), target = battle.actors[1];
  for (let i = 0; i < 65; i++) battle.tickPlayers(new Map());
  expect(battle.player.movement.x).toBeGreaterThan(200);
  expect(battle.player.offhand!.attackSerial).toBeGreaterThanOrEqual(2);
  expect(battle.player.arsenal.shots).toBe(0);
  expect(target.life.health).toBeLessThan(45);
});
it('leaves timed defense and resumes defense in the next tactical window', () => {
  const battle = fixture('shield'); battle.player.life.health = 30; battle.player.life.regenDelay = 999;
  for (let i = 0; i < 30; i++) battle.tickPlayers(new Map());
  expect(battle.player.offhand!.shield.deployed).toBe(true);
  expect(battle.player.arsenal.shots).toBe(0);
  const restored = Battle.restore(battle.checkpoint());
  for (let i = 0; i < 40; i++) { battle.tickPlayers(new Map()); restored.tickPlayers(new Map()); }
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(battle.player.offhand!.equipped).toBe(false);
  battle.frame = 121; battle.player.offhand!.select(true, false); battle.player.offhand!.shield.durability = 0;
  battle.tickPlayers(new Map()); expect(battle.player.offhand!.equipped).toBe(true);
});
it('keeps delivery navigation while a carrier must use a special offhand', () => {
  const battle = fixture('shield'), actor = battle.player;
  actor.deliveryPreviousWeapon = 'm4'; actor.offhand!.select(true, false);
  actor.movement.reset(200, 499); battle.actors[1].movement.reset(280, 499);
  const mode = createMode('ctf', [{ x: 100, y: 499 }, { x: 500, y: 499 }]);
  const state = mode.checkpoint(); state.delivery![1].carrierId = actor.id; mode.restore(state);
  const decision = botInput({ ...battle, mode, random: seededRandom(1), frame: 30 }, actor);
  expect(decision.actions).not.toContain('swap');
  expect(decision.input.left).toBe(true); expect(decision.input.right).toBe(false);
});
