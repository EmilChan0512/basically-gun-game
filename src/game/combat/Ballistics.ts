/** Reviewed Bullet_Line_Basic flight stage, starting at Bullet.ox/oy (post-muzzle). */
export interface Point { x: number; y: number }
export type HitRegion = 'body' | 'head';
export type RandomSource = () => number;
export const BULLET_STEP_PX = 10;
export const BASE_HEAD_BONUS = 1.45;
export interface UnitHitbox {
  id: string;
  /** Unit.x/y: horizontal center and feet, not the sprite center. */
  position: Point;
  alive: boolean;
  crouching?: boolean;
  blurred?: boolean;
  team?: number;
}
export interface HitRect { x: number; y: number; width: number; height: number }
export type BulletHit = { type: 'unit'; target: string; region: HitRegion } | { type: 'wall' } | { type: 'corpse'; target: string };
export interface MuzzleGeometry { xOff: number; yOff: number; facing: 1 | -1 }
export interface BulletTrace {
  origin: Point;
  end: Point;
  maxDistance: number;
  steps: number;
  hit: BulletHit | null;
  preSteps: number;
  initialHit: BulletHit | null;
  /** Bullet.extra.headMult survives the constructor-to-subclass handoff within one shot. */
  headMarked: boolean;
}

export function unitHitRects(unit: UnitHitbox): { full: HitRect; body: HitRect } {
  const height = unit.crouching ? 44 : 66;
  const bodyHeight = unit.crouching ? 28 : 44;
  return {
    full: { x: unit.position.x - 13, y: unit.position.y - height, width: 26, height },
    body: { x: unit.position.x - 13, y: unit.position.y - bodyHeight, width: 26, height: bodyHeight },
  };
}

// UT.inBox uses strict bounds. In particular, the internal body-top seam is a head hit.
function inside(point: Point, rect: HitRect): boolean {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}
export function hitRegionAt(point: Point, unit: UnitHitbox): HitRegion | null {
  const { full, body } = unitHitRects(unit);
  if (!inside(point, full)) return null;
  return inside(point, body) ? 'body' : 'head';
}

/** UT.irand(-3, 3): seven equiprobable integer offsets, before conversion to pixels. */
export function sampleRangePx(rangeUnits: number, random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a value in [0, 1).');
  return (rangeUnits + Math.floor(value * 7) - 3) * BULLET_STEP_PX;
}

/**
 * No continuous segment intersection: advance 10px, then test the sample point.
 * The optional wall predicate represents opaque wall-bitmap pixels, NOT Arcade terrain.
 * Muzzle pre-travel, corpses, shields and special projectiles are outside this slice.
 */
export function traceBulletLine(options: {
  origin: Point;
  aim: Point;
  rangeUnits: number;
  random: RandomSource;
  source: string;
  sourceTeam?: number;
  units: readonly UnitHitbox[];
  isOpaqueWall?: (point: Point) => boolean;
  corpses?: readonly { id: string; position: Point }[];
  /** When supplied, origin is the arm anchor, before Bullet's offset and 5px traversal. */
  muzzle?: MuzzleGeometry;
}): BulletTrace {
  const { origin, aim, units, source, sourceTeam, isOpaqueWall } = options;
  const maxDistance = sampleRangePx(options.rangeUnits, options.random);
  const dx = aim.x - origin.x, dy = aim.y - origin.y;
  const length = Math.hypot(dx, dy);
  // Zero-length aim is an explicit lab no-direction miss, not an extracted aiming rule.
  const trace: BulletTrace = { origin: { ...origin }, end: { ...origin }, maxDistance, steps: 0, hit: null, preSteps: 0, initialHit: null, headMarked: false };
  if (length === 0) return trace;
  const stepX = dx / length * BULLET_STEP_PX, stepY = dy / length * BULLET_STEP_PX;
  const hitTest = (): BulletHit | null => {
    if (isOpaqueWall?.(trace.end)) {
      return { type: 'wall' };
    }
    // Bullet.hitTestAll keeps game.units order for overlapping units at the same sample.
    for (const unit of units) {
      if (unit.id === source || !unit.alive || unit.blurred || (sourceTeam && sourceTeam === unit.team)) continue;
      const region = hitRegionAt(trace.end, unit);
      if (region) {
        if (region === 'head') trace.headMarked = true;
        return { type: 'unit', target: unit.id, region };
      }
    }
    for (const corpse of options.corpses ?? []) {
      if (Math.hypot(trace.end.x - corpse.position.x, trace.end.y - corpse.position.y) < 30) return { type: 'corpse', target: corpse.id };
    }
    return null;
  };
  if (options.muzzle) {
    const { xOff, yOff, facing } = options.muzzle;
    if (!Number.isInteger(xOff) || xOff < 0 || xOff > 1000) throw new RangeError('Muzzle xOff must be a supported unsigned step count.');
    // Original rotations use sin/-cos; this is the equivalent perpendicular in Cartesian aim coordinates.
    trace.end.x += -dy / length * facing * yOff;
    trace.end.y += dx / length * facing * yOff;
    for (let i = 0; i <= xOff; i++) {
      trace.end.x += stepX * 0.5;
      trace.end.y += stepY * 0.5;
      trace.preSteps++;
      trace.initialHit = hitTest();
      if (trace.initialHit) break;
    }
    trace.origin = { ...trace.end };
  }
  // The subclass always advances again, even after an initial hit. Do not repair this original quirk.
  for (let i = 0; i < Math.trunc(maxDistance / BULLET_STEP_PX); i++) {
    trace.end.x += stepX;
    trace.end.y += stepY;
    trace.steps++;
    trace.hit = hitTest();
    if (trace.hit) break;
  }
  return trace;
}
