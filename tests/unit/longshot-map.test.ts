import { expect, it } from 'vitest';
import { customMatch } from '../../src/shared/content/Maps';
import { wallFor } from '../../src/game/campaign/Missions';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
import { trackedWaypoint, portalCrouch } from '../../src/game/campaign/Navigation';
import { traversalJump } from '../../src/shared/simulation/Traversal';
import { traceBulletLine } from '../../src/game/combat/Ballistics';

it.each([[120, 630], [2040, 1530], [2760, 3270], [4680, 4170]])('climbs and descends the nest access at %s with real movement', (base, top) => {
  const map = customMatch('longshot'), wall = wallFor(map);
  for (const reverse of [false, true]) {
    const start = { x: reverse ? top : base, y: reverse ? 719.5 : 959.5 };
    const goal = { x: reverse ? base : top, y: reverse ? 959.5 : 719.5 };
    const movement = new OriginalMovement(wall, map.stairTreads, map.portals); movement.reset(start.x, start.y);
    const route = {};
    for (let tick = 0; tick < 900; tick++) {
      if (Math.abs(movement.x-goal.x) < 35 && Math.abs(movement.y-goal.y) < 28) break;
      const target = trackedWaypoint(map.navigation, movement, goal, route), dx = target.x-movement.x;
      if (!movement.shouldDescendStairs(goal) && traversalJump(movement, target, wall)) movement.jump();
      movement.tick({ left: dx < -8, right: dx > 8, crouch: portalCrouch(map.portals, movement, target) || movement.shouldDescendStairs(target) || movement.shouldDescendStairs(goal) });
    }
    expect(Math.abs(movement.x-goal.x), JSON.stringify({reverse, x:movement.x,y:movement.y,goal,route})).toBeLessThan(35);
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

it.each([[120, 630], [2040, 1530], [2760, 3270], [4680, 4170]])('walks the smooth ramp at %s without jumping', (base, top) => {
  const map = customMatch('longshot'), movement = new OriginalMovement(wallFor(map), map.stairTreads, map.portals);
  movement.reset(base, 959.5);
  for (let tick = 0; tick < 300 && Math.abs(movement.x-top) > 20; tick++) {
    movement.tick({ left: top < movement.x, right: top > movement.x, crouch: false });
  }
  expect(Math.abs(movement.x-top)).toBeLessThan(20);
  expect(Math.abs(movement.y-719.5)).toBeLessThan(3);
});

it.each([0, 1])('team %s can reach the floating control relay from its spawn', team => {
  const map = customMatch('longshot', 'dom'), wall = wallFor(map), goal = map.objective;
  const movement = new OriginalMovement(wall, map.stairTreads, map.portals), route = {};
  movement.reset(map.spawns[team][0].x, map.spawns[team][0].y);
  for (let tick = 0; tick < 2400; tick++) {
    if (Math.abs(movement.x-goal.x) < 45 && Math.abs(movement.y-goal.y) < 30) break;
    const target = trackedWaypoint(map.navigation, movement, goal, route), dx = target.x-movement.x;
    if (!movement.shouldDescendStairs(goal) && traversalJump(movement, target, wall)) movement.jump();
    movement.tick({ left: dx < -8, right: dx > 8, crouch: portalCrouch(map.portals, movement, target) || movement.shouldDescendStairs(target) || movement.shouldDescendStairs(goal) });
  }
  expect(Math.abs(movement.x-goal.x)).toBeLessThan(45);
  expect(Math.abs(movement.y-goal.y)).toBeLessThan(30);
});
