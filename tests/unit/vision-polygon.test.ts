import { expect, it } from 'vitest';
import { visionPolygon } from '../../src/client/presentation/VisionPolygon';
import { SCREEN_VISION_RADIUS as VISION_RADIUS } from '../../src/shared/simulation/Vision';

it('ends unobstructed rays on the shared authority range circle', () => {
  const feet = { x: 100, y: 200 };
  const polygon = visionPolygon(feet, () => false);
  expect(polygon).toHaveLength(256);
  for (const point of polygon) expect(Math.hypot(point.x - feet.x, point.y - feet.y)).toBeCloseTo(VISION_RADIUS, 5);
});
it('cuts off vision at walls and preserves open directions', () => {
  const polygon = visionPolygon({ x: 0, y: 42 }, x => x >= 100 && x <= 120);
  expect(polygon[0].x).toBeLessThan(100);
  expect(polygon[0].x).toBeGreaterThanOrEqual(92);
  expect(polygon[128].x).toBeLessThan(-600);
  expect(polygon.every(p => p.x < 100)).toBe(true);
});
