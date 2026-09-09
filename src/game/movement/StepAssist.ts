import type { Terrain } from '../config/course';
export interface Bounds { x: number; y: number; width: number; height: number }
function overlaps(a: Bounds, b: Bounds) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
export function findStep(body: Bounds, direction: number, grounded: boolean, maxHeight: number, probe: number, terrain: readonly Terrain[]) {
  if (!grounded || !direction || maxHeight <= 0) return null;
  const shifted = { ...body, x: body.x + Math.sign(direction) * probe };
  const candidates = terrain.filter(t => !t.oneWay && overlaps(shifted, t)).map(t => ({ t, rise: body.y + body.height - t.y })).filter(c => c.rise > 0.05 && c.rise <= maxHeight).sort((a, b) => b.rise - a.rise);
  for (const candidate of candidates) {
    const raised = { ...shifted, y: body.y - candidate.rise - 0.1 };
    if (!terrain.some(t => !t.oneWay && overlaps(raised, t))) return { rise: candidate.rise, target: candidate.t, x: raised.x, y: raised.y };
  }
  return null;
}
