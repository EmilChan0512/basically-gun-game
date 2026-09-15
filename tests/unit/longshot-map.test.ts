import { expect, it } from 'vitest';
import { customMatch } from '../../src/shared/content/Maps';
import { wallFor } from '../../src/game/campaign/Missions';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
import { trackedWaypoint } from '../../src/game/campaign/Navigation';
import { traversalJump } from '../../src/shared/simulation/Traversal';
import { traceBulletLine } from '../../src/game/combat/Ballistics';

it.each([[120, 630], [2040, 1530], [2760, 3270], [4680, 4170]])('climbs and descends the nest access at %s with real movement', (base, top) => {
  const map = customMatch('longshot'), wall = wallFor(map);
  for (const reverse of [false, true]) {
    const start = { x: reverse ? top : base, y: reverse ? 719.5 : 959.5 };
    const goal = { x: reverse ? base : top, y: reverse ? 959.5 : 719.5 };
    const movement = new OriginalMovement(wall, map.stairTreads); movement.reset(start.x, start.y);
    const route = {};
    for (let tick = 0; tick < 900; tick++) {
      if (Math.abs(movement.x-goal.x) < 35 && Math.abs(movement.y-goal.y) < 28) break;
      const target = trackedWaypoint(map.navigation, movement, goal, route), dx = target.x-movement.x;
      if (!movement.shouldDescendStairs(goal) && traversalJump(movement, target, wall)) movement.jump();
      movement.tick({ left: dx < -8, right: dx > 8, crouch: movement.shouldDescendStairs(target) || movement.shouldDescendStairs(goal) });
    }
    expect(Math.abs(movement.x-goal.x)).toBeLessThan(35);
    expect(Math.abs(movement.y-goal.y)).toBeLessThan(28);
  }
});

it('supports a 2100px sniper shot between nests while shielding the ground spawns', () => {
  const map = customMatch('longshot'), wall = wallFor(map);
  const origin = { x: 1350, y: 680 }, target = { x: 3450, y: 719.5 };
  const result = traceBulletLine({ origin, aim: { x: target.x, y: 680 }, rangeUnits: 250,
    random: () => .5, source: 'sniper', sourceTeam: 1,
    units: [{ id: 'opponent', position: target, alive: true, team: 2 }], isOpaqueWall: p => wall(p.x,p.y) });
  expect(result.hit).toMatchObject({ type: 'unit', target: 'opponent' });
  for (const spawn of map.spawns.flat()) {
    expect(wall(spawn.x, spawn.y - 40)).toBe(false);
    expect(wall(spawn.x, spawn.y + 1)).toBe(true);
    expect(wall(spawn.x, 730)).toBe(true);
  }
});
