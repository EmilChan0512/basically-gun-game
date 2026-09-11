import { expect, it } from 'vitest';
import map from '../../src/shared/content/maps/hijack.json';
import { CollisionWorld } from '../../src/shared/content/CollisionWorld';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
import { customMatch } from '../../src/shared/content/Maps';
import { trackedWaypoint } from '../../src/game/campaign/Navigation';
import { traversalJump } from '../../src/shared/simulation/Traversal';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';

it('all extracted team spawns settle on the original opaque collision mask', () => {
  const world = new CollisionWorld([], map.collisionMask);
  expect(map.spawns.map(team => team.length)).toEqual([8, 8]);
  for (const point of map.spawns.flat()) {
    const movement = new OriginalMovement(world.solid); movement.reset(point.x, point.y);
    for (let i = 0; i < 90; i++) movement.tick({ left: false, right: false, crouch: false });
    expect(movement.jumping, JSON.stringify(point)).toBe(false);
    expect(Math.abs(movement.y - point.y), JSON.stringify(point)).toBeLessThan(45);
    expect(world.solid(movement.x, movement.y - 40)).toBe(false);
  }
});

it('finishes contested 4v4 TDM and domination with combat and respawns', () => {
  for (const mode of ['tdm', 'dom'] as const) {
    const b = new Battle(customMatch('hijack', mode), 'normal', 'm4', seededRandom(12));
    b.actors.forEach(actor => { actor.human = false; });
    while (b.phase === 'running') b.tickPlayers(new Map());
    expect(b.frame).toBeLessThan(9000);
    expect(Math.max(...b.scores)).toBe(b.mission.goal);
    expect(Math.min(...b.scores)).toBeGreaterThan(0);
    expect(b.actors.every(a => a.kills > 0 && a.life.deaths > 0)).toBe(true);
    expect(b.actors.filter(a => a.life.alive).every(a => a.movement.y <= b.mission.killY!)).toBe(true);
  }
});

it('kills a fallen player instead of stranding them on the bitmap border and respawns them', () => {
  const b = new Battle(customMatch('hijack'));
  b.player.movement.reset(1000, 1300);
  b.tickPlayers(new Map()); expect(b.player.life.alive).toBe(false);
  for (let i = 0; i < 151; i++) b.tickPlayers(new Map());
  expect(b.player.life.alive).toBe(true);
  expect(b.player.movement.y).toBeLessThan(b.mission.killY!);
});

it('all 240 ordered platform pairs are reachable with real movement and no teleports', () => {
  const map = customMatch('hijack'), world = new CollisionWorld([], map.collisionMask);
  for (let from = 0; from < map.navigation.length; from++) for (let to = 0; to < map.navigation.length; to++) {
    if (from === to) continue;
    const m = new OriginalMovement(world.solid), origin = map.navigation[from], target = map.navigation[to];
    m.reset(origin.x, origin.y); const route = {}; let reached = false;
    for (let tick = 0; tick < 1800; tick++) {
      if (Math.abs(m.x - target.x) < 35 && Math.abs(m.y - target.y) < 45) { reached = true; break; }
      const waypoint = trackedWaypoint(map.navigation, m, target, route), dx = waypoint.x - m.x;
      if (traversalJump(m, waypoint, world.solid)) m.jump();
      m.tick({ left: dx < -8, right: dx > 8, crouch: false });
      if (m.y > map.height! + 140) break;
    }
    expect(reached, `${from} -> ${to}`).toBe(true);
  }
});
