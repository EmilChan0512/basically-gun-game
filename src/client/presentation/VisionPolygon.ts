import { SCREEN_VISION_RADIUS as VISION_RADIUS, VISION_EYE_HEIGHT } from '../../shared/simulation/Vision';
export type Point = { x: number; y: number };
/** Ray march the same collision mask used by authority (including authored
 * pixel masks). Only friendly observers are used, never hidden enemy data. */
export function visionPolygon(feet: Point, wall: (x: number, y: number) => boolean, rays = 256): Point[] {
  const eye = { x: feet.x, y: feet.y - VISION_EYE_HEIGHT };
  const polygon: Point[] = [];
  for (let i = 0; i < rays; i++) {
    const angle = i * Math.PI * 2 / rays, dx = Math.cos(angle), dy = Math.sin(angle);
    // Intersect the eye ray with the range circle centered at the feet.
    const limit = VISION_EYE_HEIGHT * dy + Math.sqrt(VISION_RADIUS ** 2 - (VISION_EYE_HEIGHT * dx) ** 2);
    let distance = 0;
    while (distance < limit) {
      const next = Math.min(limit, distance + 8);
      if (wall(eye.x + dx * next, eye.y + dy * next)) break;
      distance = next;
    }
    polygon.push({ x: eye.x + dx * distance, y: eye.y + dy * distance });
  }
  return polygon;
}
