import { expect, it } from 'vitest';
import { CollisionWorld } from '../../src/shared/content/CollisionWorld';
it('uses raster runs with offsets and preserves rectangle boundaries', () => {
  const world = new CollisionWorld([{ x: 0, y: 10, width: 20, height: 5 }], { x: 100, y: 20, width: 10, height: 2, rows: [[2, 4, 7, 10], []] });
  expect(world.solid(102, 20)).toBe(true); expect(world.solid(104, 20)).toBe(false);
  expect(world.solid(109, 20)).toBe(true); expect(world.solid(110, 20)).toBe(false);
  expect(world.solid(102, 21)).toBe(false); expect(world.solid(19, 14)).toBe(true);
  expect(world.solid(20, 14)).toBe(false);
});
