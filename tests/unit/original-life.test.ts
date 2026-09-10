import { describe, expect, it, vi } from 'vitest';
import { chooseSpawn, OriginalLife, originalDamage, type DamageConditions } from '../../src/game/combat/OriginalLife';
const baseline: DamageConditions = { self: false, sourceHuman: true, targetHuman: false, sourceDifficulty: 0, campaign: false, headMarked: false, criticalChance: 0.06 };
describe('original ordinary FFA damage and player lifecycle', () => {
  it('separates body, critical and head damage and uses the inclusive critical threshold', () => {
    expect(originalDamage(15, baseline, () => 0.060001)).toEqual({ amount: 15, kind: 'body' });
    expect(originalDamage(15, baseline, () => 0.06)).toEqual({ amount: 20.25, kind: 'critical' });
    const random = vi.fn();
    expect(originalDamage(15, { ...baseline, headMarked: true }, random)).toEqual({ amount: 21.75, kind: 'head' });
    expect(random).not.toHaveBeenCalled();
  });
  it('applies difficulty according to the target and source roles before head damage', () => {
    expect(originalDamage(10, { ...baseline, sourceHuman: false, targetHuman: true, sourceDifficulty: 0 }, () => 0.5).amount).toBe(3);
    expect(originalDamage(10, { ...baseline, sourceHuman: false, targetHuman: true, sourceDifficulty: 10 }, () => 0.5).amount).toBe(10);
    expect(originalDamage(10, { ...baseline, sourceHuman: false, sourceDifficulty: 5, campaign: true }, () => 0.5).amount).toBe(5.5);
  });
  it('waits 150 dead updates, then spawns on the following update with 75 protection frames', () => {
    const life = new OriginalLife();
    expect(life.damage(999)).toBe(false); expect(life.health).toBe(85);
    expect(life.damage(999, true)).toBe(true);
    for (let i = 0; i < 150; i++) expect(life.tick()).toBe(false);
    expect(life.snapshot()).toMatchObject({ alive: false, respawnFrames: 0, health: 0 });
    expect(life.tick()).toBe(true);
    expect(life.snapshot()).toMatchObject({ alive: true, health: 85, spawnProtectionFrames: 75, deaths: 1 });
    for (let i = 0; i < 74; i++) life.tick();
    life.damage(10); expect(life.health).toBe(85);
    life.tick(); life.damage(10); expect(life.health).toBe(75);
  });
  it('regenerates 0.1% max HP per frame after 90 delayed frames and preserves fractional HP', () => {
    const life = new OriginalLife(); life.spawnProtectionFrames = 0; life.damage(15);
    for (let i = 0; i < 90; i++) life.tick();
    expect(life.health).toBe(70);
    life.tick(); expect(life.health).toBeCloseTo(70.085);
  });
  it('chooses an FFA spawn node and then applies a separate ±5px horizontal jitter', () => {
    const samples = [0.75, 0];
    expect(chooseSpawn([{ x: 100, y: 600 }, { x: 500, y: 400 }], () => samples.shift()!)).toEqual({ x: 495, y: 400 });
  });
});
