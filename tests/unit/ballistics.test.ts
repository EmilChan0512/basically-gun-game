import { describe, expect, it, vi } from 'vitest';
import { BASE_HEAD_BONUS, BULLET_STEP_PX, hitRegionAt, sampleRangePx, traceBulletLine, unitHitRects, type UnitHitbox } from '../../src/game/combat/Ballistics';
import { GunController, M4, USP } from '../../src/game/combat/Combat';
import { GunLab } from '../../src/game/combat/GunLab';
import db from '../../archaeology/reverse_engineering_db.json';

const dummy = (x = 100): UnitHitbox => ({ id: 'dummy', position: { x, y: 66 }, alive: true });
const trace = (overrides: Partial<Parameters<typeof traceBulletLine>[0]> = {}) => traceBulletLine({
  origin: { x: 0, y: 33 }, aim: { x: 1000, y: 33 }, rangeUnits: USP.rangeUnits,
  random: () => 0.5, source: 'player', units: [], ...overrides,
});

describe('reviewed original bullet flight stage (post-muzzle)', () => {
  it('links constants to the manually reviewed evidence, not old range placeholders', () => {
    expect(db.records.find(r => r.id === 'sfh1.v121.bullet.range')).toMatchObject({ evidenceType: 'EXTRACTED', value: { usp: 66, m4: 60, randomMin: -3, randomMax: 3, pixelsPerUnit: 10 } });
    expect(db.records.find(r => r.id === 'sfh1.v121.damage.headBonus')).toMatchObject({ evidenceType: 'EXTRACTED', value: { marker: 1.5, baseHeadBonus: 1.45 } });
    expect(USP.rangeUnits).toBe(66); expect(M4.rangeUnits).toBe(60);
    expect(BULLET_STEP_PX).toBe(10); expect(BASE_HEAD_BONUS).toBe(1.45);
  });
  it('samples all seven inclusive range offsets using UT.irand buckets', () => {
    expect(Array.from({ length: 7 }, (_, i) => sampleRangePx(66, () => (i + 0.5) / 7))).toEqual([630, 640, 650, 660, 670, 680, 690]);
    expect(sampleRangePx(60, () => 0)).toBe(570);
    expect(sampleRangePx(60, () => 1 - Number.EPSILON)).toBe(630);
  });
  it('rejects invalid injected random values', () => {
    for (const value of [-1, 1, NaN, Infinity]) expect(() => sampleRangePx(66, () => value)).toThrow(RangeError);
  });
  it('advances before testing and includes the final range sample', () => {
    const samples: number[] = [];
    const result = trace({ isOpaqueWall: point => { samples.push(point.x); return false; } });
    expect(samples).toEqual(Array.from({ length: 66 }, (_, i) => (i + 1) * 10));
    expect(result).toMatchObject({ steps: 66, maxDistance: 660, end: { x: 660, y: 33 }, hit: null });
    expect(trace({ units: [dummy(670)] }).hit).toEqual({ type: 'unit', target: 'dummy', region: 'body' });
    expect(trace({ units: [dummy(673)] }).hit).toBeNull(); // x=660 is strictly outside the left boundary.
  });
  it('uses floor(maxDist/10) rather than a continuous range endpoint', () => {
    expect(trace({ rangeUnits: 2.9 })).toMatchObject({ steps: 2, end: { x: 20, y: 33 } });
  });
  it('preserves point-sampling gaps rather than silently adding segment collision', () => {
    expect(trace({ isOpaqueWall: p => p.x > 14 && p.x < 16 }).hit).toBeNull();
    expect(trace({ isOpaqueWall: p => p.x === 20 })).toMatchObject({ steps: 2, hit: { type: 'wall' }, end: { x: 20, y: 33 } });
  });
  it('normalizes diagonal travel to ten pixels and supports reverse / vertical aim', () => {
    const diagonal = trace({ origin: { x: 0, y: 0 }, aim: { x: 1, y: 1 }, rangeUnits: 1 });
    expect(Math.hypot(diagonal.end.x, diagonal.end.y)).toBeCloseTo(10);
    expect(trace({ aim: { x: -10, y: 33 }, rangeUnits: 1 }).end).toEqual({ x: -10, y: 33 });
    expect(trace({ aim: { x: 0, y: -10 }, rangeUnits: 1 }).end).toEqual({ x: 0, y: 23 });
  });
  it('stops at the first sampled unit, not the nearest center or aim point', () => {
    expect(trace({ units: [dummy(200), dummy(100)] })).toMatchObject({ steps: 9, end: { x: 90, y: 33 } });
    const first = { ...dummy(), id: 'first' }, second = { ...dummy(), id: 'second' };
    expect(trace({ units: [first, second] }).hit).toMatchObject({ target: 'first' });
    expect(trace({ units: [second, first] }).hit).toMatchObject({ target: 'second' });
  });
  it('checks opaque walls before units at the same sample', () => {
    expect(trace({ units: [dummy()], isOpaqueWall: p => p.x === 90 }).hit).toEqual({ type: 'wall' });
  });
  it('skips the shooter, dead units, blur and same nonzero team; zero is FFA', () => {
    const excluded = [
      { ...dummy(), id: 'player' }, { ...dummy(), alive: false },
      { ...dummy(), blurred: true }, { ...dummy(), team: 1 },
    ];
    for (const unit of excluded) expect(trace({ sourceTeam: 1, units: [unit] }).hit).toBeNull();
    expect(trace({ sourceTeam: 0, units: [{ ...dummy(), team: 0 }] }).hit?.type).toBe('unit');
    expect(trace({ sourceTeam: 1, units: [{ ...dummy(), team: 2 }] }).hit?.type).toBe('unit');
  });
});

describe('original strict unit rectangles and head classification', () => {
  it('uses feet-based standing 26x66 and crouching 26x44 rectangles', () => {
    expect(unitHitRects(dummy())).toEqual({ full: { x: 87, y: 0, width: 26, height: 66 }, body: { x: 87, y: 22, width: 26, height: 44 } });
    expect(unitHitRects({ ...dummy(), crouching: true })).toEqual({ full: { x: 87, y: 22, width: 26, height: 44 }, body: { x: 87, y: 38, width: 26, height: 28 } });
  });
  it('excludes all four external edges, while the internal seam belongs to the head', () => {
    for (const point of [{ x: 87, y: 33 }, { x: 113, y: 33 }, { x: 100, y: 0 }, { x: 100, y: 66 }]) expect(hitRegionAt(point, dummy())).toBeNull();
    expect(hitRegionAt({ x: 100, y: 22 }, dummy())).toBe('head');
    expect(hitRegionAt({ x: 100, y: 22.001 }, dummy())).toBe('body');
    expect(hitRegionAt({ x: 100, y: 1 }, dummy())).toBe('head');
  });
  it('crouching clears the old head area and moves the body seam', () => {
    const crouched = { ...dummy(), crouching: true };
    expect(hitRegionAt({ x: 100, y: 10 }, crouched)).toBeNull();
    expect(hitRegionAt({ x: 100, y: 38 }, crouched)).toBe('head');
    expect(hitRegionAt({ x: 100, y: 38.001 }, crouched)).toBe('body');
  });
});

describe('damage and laboratory integration', () => {
  it('uses headBonus 1.45 rather than the 1.5 hit marker, without rounding damage', () => {
    for (const weapon of [USP, M4]) {
      const lab = new GunLab(1, () => 0.5); lab.select(weapon.id);
      const headY = lab.targetPoint.y - 25;
      expect(lab.fire(0, { x: 180, y: headY }, { x: 700, y: headY })).toBe(true);
      expect(lab.lastEvent).toMatchObject({ hitRegion: 'head', amount: weapon.damage * 1.45 });
      expect(lab.target.health).toBe(100 - weapon.damage * 1.45);
    }
  });
  it('accepts an off-center body hit and does not multiply a later body shot', () => {
    const lab = new GunLab(1, () => 0.5);
    lab.fire(0, { x: 180, y: 515 }, { x: 700, y: 515 });
    lab.tick(250, 250);
    expect(lab.fire(250, { x: 180, y: 560 }, { x: 710, y: 560 })).toBe(true);
    expect(lab.lastEvent).toMatchObject({ hitRegion: 'body', amount: 15 });
    expect(lab.target.health).toBe(63.25);
  });
  it('samples random range only for accepted shots, including misses', () => {
    const random = vi.fn(() => 0.5), lab = new GunLab(1, random);
    lab.targetPoint.x = 2000;
    expect(lab.fire(0)).toBe(false);
    expect(lab.snapshot()).toMatchObject({ ammo: 11, shotsFired: 1, health: 100, lastEvent: null, lastShot: { maxDistance: 660, steps: 66, hit: null } });
    const before = lab.snapshot();
    expect(lab.fire(1)).toBe(false);
    expect(lab.snapshot()).toEqual(before);
    lab.tick(250, 250); lab.gun.reload(); lab.fire(250);
    expect(random).toHaveBeenCalledTimes(1);
    lab.gun.cancelReload(); lab.gun.ammo = 0; lab.fire(251);
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('defines zero-length aim as an explicit laboratory miss', () => {
    expect(trace({ aim: { x: 0, y: 33 } })).toMatchObject({ steps: 0, hit: null });
  });
  it('kills via fractional head damage once, skips dead targets and respawns', () => {
    const lab = new GunLab(1, () => 0.5);
    for (let i = 0; i < 5; i++) {
      lab.fire(i * 250, { x: 180, y: 515 }, { x: 700, y: 515 });
      lab.tick(250, (i + 1) * 250);
    }
    expect(lab.snapshot()).toMatchObject({ health: 0, alive: false, score: 1 });
    lab.fire(1250); expect(lab.lastEvent).toBeNull(); expect(lab.lastShot?.hit).toBeNull();
    lab.tick(4749, 5999); expect(lab.target.alive).toBe(false);
    lab.tick(1, 6000); expect(lab.target.alive).toBe(true); expect(lab.score).toBe(1);
  });
  it('does not produce a damage event for a dead combatant even if passed directly', () => {
    const lab = new GunLab(); lab.target.alive = false;
    expect(new GunController().fire('player', lab.target, 0, 'head')).toBeNull();
  });
});
