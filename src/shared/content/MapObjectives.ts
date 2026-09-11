import type { MapGeometry } from './MapTypes';
/** Structural compatibility only; traversal/spawn safety is tested separately. */
export function objectiveIssues(map: MapGeometry, requirement: 'combat' | 'control' | 'delivery' | 'cooperative'): string[] {
  const issues: string[] = [];
  const height = map.height ?? 700;
  const valid = (p: { x: number; y: number } | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= map.width && p.y >= 0 && p.y < Math.min(height, map.killY ?? height);
  if (!Number.isFinite(map.width) || map.width <= 0 || !Number.isFinite(height) || height <= 0) issues.push('地图世界边界无效');
  if (map.spawns.length !== 2 || map.spawns.some(points => !points.length || points.some(p => !valid(p)))) issues.push('双方出生点缺失或越界');
  if (requirement === 'control' && !valid(map.objective)) issues.push('据点目标缺失或越界');
  if (requirement === 'cooperative') {
    if ((map.spawns[0]?.length ?? 0) < 8) issues.push('合作地图需要至少8个玩家出生点');
    const players = map.spawns[0] ?? [];
    if (players.some((a, i) => players.slice(i + 1).some(b => Math.abs(a.x - b.x) < 28 && Math.abs(a.y - b.y) < 65))) issues.push('合作玩家出生空间重叠');
  }
  if (requirement === 'delivery') {
    const bases = map.deliveryBases;
    if (!bases || bases.length !== 2 || bases.some(p => !valid(p))) issues.push('缺少有效的双方交付基地');
    else if (Math.abs(bases[0].x - bases[1].x) <= 80 && Math.abs(bases[0].y - bases[1].y) <= 95) issues.push('双方交付触碰区域重叠');
  }
  return issues;
}
