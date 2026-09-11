import { expect, it } from 'vitest';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { botInput } from '../../src/shared/simulation/BotController';
import { createMode } from '../../src/shared/simulation/ModeRules';
it('keeps crossing a gap when an enemy enters range, and stops to fight after landing', () => {
  const battle = new Battle({ ...customMatch('hijack'), allies: 0, enemies: 1, terrain: [], collisionMask: undefined,
    navigation: [{ x: 100, y: 400, links: [1] }, { x: 500, y: 400, links: [0] }] });
  const actor = battle.player;
  actor.movement.reset(100, 400); actor.movement.jumping = true;
  battle.actors[1].movement.reset(250, 400);
  const context = { actors: battle.actors, frame: 30, difficulty: battle.difficulty, mission: battle.mission,
    mode: createMode('tdm'), random: seededRandom(12), wall: battle.wall, scores: battle.scores, objective: battle.objective };
  const airborne = botInput(context, actor).input;
  expect(airborne.right).toBe(true); expect(airborne.left).toBe(false); expect(airborne.crouch).toBe(false);
  actor.movement.jumping = false;
  const grounded = botInput(context, actor).input;
  expect(grounded.right).toBe(false); expect(grounded.left).toBe(false);
});
