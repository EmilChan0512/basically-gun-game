import { describe, expect, it } from 'vitest';
import { traceBulletLine } from '../../src/game/combat/Ballistics';
import { Recoil } from '../../src/game/combat/Recoil';

const trace = (overrides: Partial<Parameters<typeof traceBulletLine>[0]> = {}) => traceBulletLine({
  origin: { x: 0, y: 0 }, aim: { x: 1000, y: 0 }, rangeUnits: 66,
  random: () => 0.5, source: 'player', units: [], muzzle: { xOff: 8, yOff: -8, facing: 1 }, ...overrides,
});

describe('Bullet constructor and Bullet_Line_Basic handoff', () => {
  it('USP and M4 include the xOff endpoint and do not subtract muzzle travel from range', () => {
    expect(trace()).toMatchObject({ preSteps: 9, origin: { x: 45, y: -8 }, end: { x: 705, y: -8 }, steps: 66 });
    expect(trace({ rangeUnits: 60, muzzle: { xOff: 10, yOff: -1, facing: 1 } })).toMatchObject({
      preSteps: 11, origin: { x: 55, y: -1 }, end: { x: 655, y: -1 }, steps: 60,
    });
  });
  it('mirrors the perpendicular offset and preserves upward/downward offsets', () => {
    expect(trace({ aim: { x: -1000, y: 0 }, muzzle: { xOff: 8, yOff: -8, facing: -1 } }).origin).toEqual({ x: -45, y: -8 });
    expect(trace({ aim: { x: 0, y: -1000 } }).origin).toEqual({ x: -8, y: -45 });
    expect(trace({ aim: { x: 0, y: 1000 } }).origin).toEqual({ x: 8, y: 45 });
  });
  it('does one 5px step even with zero xOff', () => {
    expect(trace({ muzzle: { xOff: 0, yOff: 0, facing: 1 } }).origin).toEqual({ x: 5, y: 0 });
  });
  it('continues ten pixels after a pre-travel wall hit, replacing that hit on the next sample', () => {
    const samples: number[] = [];
    const result = trace({ isOpaqueWall: p => { samples.push(p.x); return p.x === 5; } });
    expect(samples.slice(0, 3)).toEqual([5, 15, 25]);
    expect(result).toMatchObject({ preSteps: 1, initialHit: { type: 'wall' }, hit: null, origin: { x: 5, y: -8 }, end: { x: 665, y: -8 } });
    expect(trace({ isOpaqueWall: p => p.x >= 5 })).toMatchObject({ steps: 1, preSteps: 1, hit: { type: 'wall' } });
  });
  it('keeps a pre-travel head marker even when the final sample is a body hit', () => {
    const result = trace({ muzzle: { xOff: 8, yOff: 0, facing: 1 }, units: [
      { id: 'head', position: { x: 0, y: 60 }, alive: true },
      { id: 'body', position: { x: 27, y: 30 }, alive: true },
    ] });
    expect(result).toMatchObject({ initialHit: { target: 'head', region: 'head' }, hit: { target: 'body', region: 'body' }, headMarked: true });
    expect(trace().headMarked).toBe(false);
  });
  it('checks corpses after living units with strict radius 30 and array order', () => {
    const corpse = { id: 'corpse', position: { x: 100, y: -8 } };
    expect(trace({ corpses: [corpse] })).toMatchObject({ hit: { type: 'corpse', target: 'corpse' }, end: { x: 75, y: -8 } });
    expect(trace({ corpses: [corpse], units: [{ id: 'living', position: { x: 75, y: 20 }, alive: true }] }).hit).toMatchObject({ type: 'unit' });
  });
});

describe('Guns recoil update order and asymmetric random interval', () => {
  const standing = { crouching: false, airborne: false, moving: false, aimStat: 1 };
  it('samples negative dynamic recoil through the pose-modified upper endpoint', () => {
    const recoil = new Recoil(4);
    recoil.tick({ ...standing, crouching: true });
    expect(recoil.sampleDegrees(() => 0)).toBe(-4);
    expect(recoil.sampleDegrees(() => 0.5)).toBeCloseTo(-0.8);
    expect(recoil.upper).toBeCloseTo(2.4);
    recoil.tick({ ...standing, airborne: true, aimStat: 0.8 });
    expect(recoil.upper).toBeCloseTo(5.76);
  });
  it('grows after the shot, decays by 0.05, and preserves the original threshold overshoot', () => {
    const recoil = new Recoil(3);
    recoil.afterShot(); recoil.tick(standing);
    expect(recoil.dynamic).toBeCloseTo(3.25);
    recoil.dynamic = 5.05; recoil.afterShot();
    expect(recoil.dynamic).toBeCloseTo(5.35);
    recoil.afterShot(); expect(recoil.dynamic).toBeCloseTo(5.35);
    recoil.dynamic = 3.02; recoil.tick(standing);
    expect(recoil.dynamic).toBeCloseTo(2.97);
  });
  it('switching resets dynamic recoil while leaving the last upper endpoint until update', () => {
    const recoil = new Recoil(3);
    recoil.tick({ ...standing, moving: true });
    recoil.switchWeapon(4);
    expect(recoil.dynamic).toBe(4); expect(recoil.upper).toBeCloseTo(3.3);
    recoil.tick(standing); expect(recoil.upper).toBe(4);
  });
});
