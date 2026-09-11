import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

it('eight human actors have independent movement, fire and jump edges', () => {
  const battle = new Battle({ ...MISSIONS[0], allies: 3, enemies: 4 }, 'easy', 'm4', seededRandom(1));
  battle.actors.forEach((actor, i) => { actor.human = true; actor.movement.reset(100 + i * 180, 599.5); });
  const starts = battle.actors.map(a => a.movement.x);
  const commands = new Map(battle.actors.map((a, i) => [a.id, { ...idleInput(), right: i % 2 === 0, left: i % 2 !== 0, fire: i === 2, jump: i === 0 }]));
  battle.tickPlayers(commands);
  battle.actors.forEach((a, i) => {
    expect(Math.sign(a.movement.x - starts[i])).toBe(i % 2 === 0 ? 1 : -1);
    expect(a.arsenal.shots).toBe(i === 2 ? 1 : 0);
    expect(a.movement.jumping).toBe(i === 0);
  });
  commands.get(battle.actors[1].id)!.jump = true;
  battle.tickPlayers(commands);
  expect(battle.actors[1].movement.jumping).toBe(true);
});

it('missing player commands do not inherit the local player trigger', () => {
  const battle = new Battle(MISSIONS[0]);
  battle.actors[1].human = true;
  battle.tick({ ...idleInput(), fire: true });
  expect(battle.player.arsenal.shots).toBe(1);
  expect(battle.actors[1].arsenal.shots).toBe(0);
  battle.swap(battle.actors[1]);
  expect(battle.actors[1].arsenal.selected).toBe('usp');
  expect(battle.player.arsenal.selected).toBe('m4');
});
