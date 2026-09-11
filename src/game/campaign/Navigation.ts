import type { Point } from '../combat/Ballistics';
import type { Waypoint } from './Missions';

/** Small authored graph, Dijkstra shortest route; no teleports or direct position control. */
export function nextWaypoint(nodes: readonly Waypoint[], from: Point, to: Point): Point {
  if (!nodes.length) return to;
  const nearest = (p: Point) => nodes.reduce((best, n, i) =>
    Math.hypot(n.x - p.x, (n.y - p.y) * 2) < Math.hypot(nodes[best].x - p.x, (nodes[best].y - p.y) * 2) ? i : best, 0);
  const start = nearest(from), goal = nearest(to);
  if (start === goal) return to;
  const costs = nodes.map(() => Infinity), parent = nodes.map(() => -1), open = new Set(nodes.map((_, i) => i));
  costs[start] = 0;
  while (open.size) {
    const cur = [...open].reduce((a, b) => costs[a] <= costs[b] ? a : b);
    if (!Number.isFinite(costs[cur])) break;
    open.delete(cur);
    if (cur === goal) {
      let step = goal;
      while (parent[step] !== start && parent[step] !== -1) step = parent[step];
      return nodes[step];
    }
    for (const next of nodes[cur].links) {
      if (!open.has(next)) continue;
      const cost = costs[cur] + Math.hypot(nodes[next].x - nodes[cur].x, nodes[next].y - nodes[cur].y);
      if (cost < costs[next]) { costs[next] = cost; parent[next] = cur; }
    }
  }
  return nodes[start];
}

export function clearSight(from: Point, to: Point, wall: (x: number, y: number) => boolean) {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8);
  for (let i = 1; i <= steps; i++) {
    if (wall(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps)) return false;
  }
  return true;
}
