import { hitRegionAt, sampleRangePx, type Point, type RandomSource, type UnitHitbox } from '../../game/combat/Ballistics';
import { WEAPONS } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';

export interface WeaponProjectile { sourceId: string; team: number; weapon: WeaponId; x: number; y: number; vx: number; vy: number; remaining: number; fuse: number; damageScale: number }
export interface ProjectileImpact { projectile: WeaponProjectile; targetId?: string }
/** SFH1 Bullet_Proj_Basic/Bounce/Follow: 5px half-steps, gravity, fuse and local homing. */
export function launchProjectile(sourceId: string, team: number, weapon: WeaponId, origin: Point, aim: Point, random: RandomSource, damageScale = 1): WeaponProjectile {
  const definition = WEAPONS[weapon], angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
  return { sourceId, team, weapon, ...origin, vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
    remaining: sampleRangePx(definition.config.rangeUnits, random), fuse: definition.projectile!.fuse, damageScale };
}
export function stepProjectile(p: WeaponProjectile, units: UnitHitbox[], wall: (x: number, y: number) => boolean): ProjectileImpact | null {
  const rules = WEAPONS[p.weapon].projectile!;
  p.vy += rules.gravity;
  if (rules.kind === 'homing') {
    let angle = Math.atan2(p.vy, p.vx);
    for (const unit of units) if (unit.alive && unit.team !== p.team && Math.hypot(unit.position.x - p.x, unit.position.y - 40 - p.y) < rules.seekRadius) {
      const wanted = Math.atan2(unit.position.y - 40 - p.y, unit.position.x - p.x);
      const delta = Math.atan2(Math.sin(wanted - angle), Math.cos(wanted - angle));
      angle += Math.sign(delta) * Math.min(Math.abs(delta), rules.turn * Math.PI / 180);
    }
    p.vx = Math.cos(angle) * 5; p.vy = Math.sin(angle) * 5;
  }
  // Sweep each substep as speed grows under gravity; walls cannot be skipped.
  for (let i = 0; i < rules.steps * 2; i++) {
    const count = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) / 5));
    for (let n = 0; n < count; n++) {
      const nx = p.x + p.vx / count, ny = p.y + p.vy / count;
      if (wall(nx, ny)) {
        if (rules.kind !== 'bounce') { p.fuse = 0; return { projectile: p }; }
        if (wall(nx, p.y)) { p.vx *= -.6; p.vy *= .7; }
        else { p.vy *= -.5; p.vx *= .8; }
        break;
      }
      p.x = nx; p.y = ny; p.remaining -= Math.hypot(p.vx, p.vy) / count;
      const target = units.find(u => u.alive && u.id !== p.sourceId && u.team !== p.team && hitRegionAt(p, u));
      if (target) { p.fuse = 0; return { projectile: p, targetId: target.id }; }
    }
  }
  if (--p.fuse <= 0) return rules.kind === 'bounce' ? { projectile: p } : null;
  if (rules.kind !== 'bounce' && p.remaining <= 0) p.fuse = 0;
  return null;
}
