import { describe, expect, it } from 'vitest';
import { COMBAT_FRAME_MS, GunController, M4, USP } from '../../src/game/combat/Combat';
import { GunLab } from '../../src/game/combat/GunLab';
import db from '../../archaeology/reverse_engineering_db.json';

// Expectations from reviewed Guns/UnitMC source and arm_gun_316 timeline.
describe('SFH1 ammunition baseline', () => {
  it('uses the extracted USP spare-magazine count at unitInfo.amm=1', () => {
    expect(db.records.find(r => r.id === 'sfh1.v121.weapon.usp.clipSpare')).toMatchObject({ value: 5, evidenceType: 'EXTRACTED' });
    expect(USP.spareMagazines).toBe(5);
    const gun = new GunController();
    expect([gun.ammo, gun.reserveAmmo]).toEqual([12, 60]);
  });
  it('blocks manual reload during shot cooldown and preserves a partial magazine', () => {
    const gun = new GunController();
    gun.fire('p', null, 0);
    expect(gun.reload()).toBe(false);
    gun.tick(USP.shootDelayFrames * COMBAT_FRAME_MS);
    expect(gun.reload()).toBe(true);
    expect([gun.ammo, gun.reserveAmmo]).toEqual([11, 60]);
    gun.tick((USP.reloadFrames - 1) * COMBAT_FRAME_MS);
    expect(gun.ammo).toBe(11);
    gun.tick(COMBAT_FRAME_MS);
    expect([gun.ammo, gun.reserveAmmo]).toEqual([12, 59]);
  });
  it('automatically reloads the final shot and consumes finite reserves', () => {
    const gun = new GunController();
    gun.ammo = 1;
    gun.reserveAmmo = 3;
    gun.fire('p', null, 0);
    expect(gun.reloadFrames).toBe(USP.reloadFrames);
    expect([gun.ammo, gun.reserveAmmo]).toEqual([0, 3]);
    gun.tick(USP.reloadFrames * COMBAT_FRAME_MS);
    expect([gun.ammo, gun.reserveAmmo]).toEqual([3, 0]);
    for (let i = 0; i < 3; i++) { gun.fire('p', null, i * 250); gun.tick(250); }
    gun.tick(10000);
    expect([gun.ammo, gun.reserveAmmo, gun.reloadMs]).toEqual([0, 0, 0]);
    expect(gun.reload()).toBe(false);
  });
  it('never creates ammo when ticking an empty gun outside a reload', () => {
    const gun = new GunController();
    gun.ammo = 0;
    gun.tick(10000);
    expect(gun.ammo).toBe(0);
  });
  it('preserves both magazines and a single shared cooldown across swaps', () => {
    const lab = new GunLab();
    lab.fire(0);
    lab.select('m4');
    expect(lab.gun.cooldownFrames).toBe(7);
    lab.fire(0);
    expect(lab.gun.ammo).toBe(30);
    lab.tick(250, 250);
    lab.fire(250);
    lab.select('usp');
    expect([lab.gun.ammo, lab.gun.cooldownFrames]).toEqual([11, 4]);
    lab.select('m4');
    expect(lab.gun.ammo).toBe(29);
  });
  it('cancels partial reload on swap and restarts empty-magazine reload on return', () => {
    const lab = new GunLab();
    lab.fire(0); lab.tick(250, 250); lab.gun.reload();
    lab.select('m4'); lab.tick(2000, 2250); lab.select('usp');
    expect([lab.gun.ammo, lab.gun.reserveAmmo, lab.gun.reloadMs]).toEqual([11, 60, 0]);
    lab.gun.ammo = 1; lab.fire(2250);
    lab.tick(200, 2450);
    lab.select('m4'); lab.tick(2000, 4450); lab.select('usp');
    expect([lab.gun.ammo, lab.gun.reserveAmmo, lab.gun.reloadFrames]).toEqual([0, 60, USP.reloadFrames]);
  });
  it('applies the Medic level-1 ammunition factor before rounding total ammunition', () => {
    const usp = new GunController(USP, undefined, 0.9);
    const m4 = new GunController(M4, undefined, 0.9);
    expect([usp.ammo, usp.reserveAmmo]).toEqual([12, 53]);
    expect([m4.ammo, m4.reserveAmmo]).toEqual([30, 78]);
    const lab = new GunLab(0.9);
    lab.select('m4');
    expect(lab.snapshot()).toMatchObject({ ammoMultiplier: 0.9, reserveAmmo: 78 });
    lab.select('usp');
    expect(lab.gun.reserveAmmo).toBe(53);
  });
});
