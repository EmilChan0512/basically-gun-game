import type { Point } from '../../game/combat/Ballistics';
import type { OriginalMovement } from '../../game/movement/OriginalMovement';

/** Jump before leaving a platform; sampling follows the movement collision world. */
export function traversalJump(m: OriginalMovement, target: Point, wall: (x: number, y: number) => boolean) {
  if (m.jumping || m.crouching || m.hardLandingFrames) return false;
  const dx = target.x - m.x, direction = Math.sign(dx);
  if (!direction) return false;
  const obstacle = wall(m.x + direction * 45, m.y - 20);
  const rising = target.y < m.y - 35 && Math.abs(dx) < 260;
  const ahead = m.x + direction * Math.max(25, Math.abs(m.vx) * 4);
  const hasFloorAhead = [1, 12, 24, 40].some(y => wall(ahead, m.y + y));
  // A deliberate lower destination can be reached by dropping; don't jump every downhill edge.
  const gap = Math.abs(dx) > 60 && target.y < m.y + 100 && !hasFloorAhead;
  return obstacle || rising || gap;
}
