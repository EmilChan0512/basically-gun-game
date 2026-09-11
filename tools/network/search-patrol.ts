import type { Point } from '../../src/game/combat/Ballistics';
/** Scripted player's exploration memory, based only on public map waypoints.
 * Never accepts hidden actor positions. Persist between received snapshots. */
export class SearchPatrol {
  private index = -1;
  private since = 0;
  target(position: Point, tick: number, nodes: readonly Point[]): Point | undefined {
    if (!nodes.length) return undefined;
    if (this.index < 0 || this.index >= nodes.length) {
      this.index = nodes.reduce((best, p, i) => Math.hypot(p.x - position.x, p.y - position.y)
        < Math.hypot(nodes[best].x - position.x, nodes[best].y - position.y) ? i : best, 0);
      this.since = tick;
    }
    const node = nodes[this.index];
    if (Math.abs(node.x - position.x) < 45 && Math.abs(node.y - position.y) < 70 || tick - this.since >= 450) {
      this.index = (this.index + 1) % nodes.length; this.since = tick;
    }
    const target = nodes[this.index]; return { x: target.x, y: target.y };
  }
  reset() { this.index = -1; this.since = 0; }
}
