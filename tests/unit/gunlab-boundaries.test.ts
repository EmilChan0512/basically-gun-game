import { describe, expect, it } from 'vitest';
import { GunLab } from '../../src/game/combat/GunLab';
describe('GunLab ray boundaries', () => {
  it('hits only within range and spread', () => { const lab = new GunLab(); expect(lab.fire(0, {x:180,y:580}, {x:980,y:540})).toBe(true); expect(lab.snapshot().health).toBe(85); lab.tick(250,250); expect(lab.fire(250, {x:180,y:580}, {x:980,y:200})).toBe(false); expect(lab.snapshot().health).toBe(85); });
  it('does not create damage for out of range target', () => { const lab = new GunLab(); lab.targetPoint.x = 2000; expect(lab.fire(0, {x:180,y:580}, {x:2000,y:580})).toBe(false); expect(lab.snapshot().health).toBe(100); expect(lab.snapshot().lastEvent).toBeNull(); });
  it('locks firing while reload is active', () => { const lab = new GunLab(); lab.fire(0); lab.tick(250,250); expect(lab.gun.reload()).toBe(true); expect(lab.fire(250)).toBe(false); lab.tick(900,900); expect(lab.snapshot().ammo).toBe(12); });
});
