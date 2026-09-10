import { describe, expect, it } from 'vitest';
import { COMBAT_FRAME_MS, GunController, M4, USP } from '../../src/game/combat/Combat';
import { GunLab } from '../../src/game/combat/GunLab';
import db from '../../archaeology/reverse_engineering_db.json';

// P-code: Player.shoot -> UnitEnterFrame -> Guns.EnterFrame; uint delays 7 / 4.
function frame(lab: GunLab) { lab.tick(COMBAT_FRAME_MS, (lab.combatFrame + 1) * COMBAT_FRAME_MS); }

describe('original weapon update ordering', () => {
  it('links the M4 configuration to the reviewed source record', () => {
    expect(db.records.find(r => r.id === 'sfh1.v121.weapon.m4.configuration')).toMatchObject({ evidenceType: 'EXTRACTED', value: { damage: 10, clipSize: 30, clipSpare: 3, automatic: true, shootDelay: 0.15 } });
    expect(M4).toMatchObject({ damage: 10, magazineSize: 30, spareMagazines: 3, automatic: true, shootDelayFrames: 4 });
  });
  it('links USP and M4 reload spans to the decompiled arm timeline', () => {
    expect(db.records.find(r => r.id === 'sfh1.v121.weapon.reload.timeline')).toMatchObject({
      evidenceType: 'EXTRACTED',
      value: {
        pistol: { labelFrame: 9, soundFrame: 9, doneFrame: 37, advanceFrames: 28 },
        rifle: { labelFrame: 81, soundFrame: 81, doneFrame: 115, advanceFrames: 34 },
      },
    });
    expect(USP.reloadFrames).toBe(28);
    expect(M4.reloadFrames).toBe(34);
  });
  it('fires M4 on frames 1, 5, 9 and decrements on the shot frame', () => {
    const lab = new GunLab(); lab.select('m4'); lab.setTrigger(true);
    const shotFrames: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const before = lab.shotsFired; frame(lab);
      if (lab.shotsFired !== before) shotFrames.push(lab.lastShotFrame!);
      if (i === 1) expect(lab.gun.cooldownFrames).toBe(3);
    }
    expect(shotFrames).toEqual([1, 5, 9]);
    expect(lab.gun.ammo).toBe(27);
  });
  it('samples 30 Hz firing from 120 Hz physics without a shot in the first three substeps', () => {
    const lab = new GunLab(); lab.setTrigger(true);
    for (let i = 1; i <= 3; i++) lab.tick(1000 / 120, i * 1000 / 120);
    expect(lab.shotsFired).toBe(0);
    lab.tick(1000 / 120, 1000 / 30);
    expect(lab.snapshot()).toMatchObject({ shotsFired: 1, cooldownFrames: 6, combatFrame: 1 });
  });
  it('keeps USP latched until release, then retries a held press made during cooldown', () => {
    const lab = new GunLab(); lab.setTrigger(true); frame(lab);
    lab.setTrigger(false); lab.setTrigger(true);
    for (let i = 2; i <= 7; i++) frame(lab);
    expect(lab.shotsFired).toBe(1);
    frame(lab);
    expect(lab.snapshot()).toMatchObject({ shotsFired: 2, lastShotFrame: 8 });
    for (let i = 0; i < 20; i++) frame(lab);
    expect(lab.shotsFired).toBe(2);
  });
  it('does not buffer a press released before a frame or before cooldown expires', () => {
    const lab = new GunLab(); lab.setTrigger(true); lab.setTrigger(false); frame(lab);
    expect(lab.shotsFired).toBe(0);
    lab.setTrigger(true); frame(lab); lab.setTrigger(false); lab.setTrigger(true); frame(lab); lab.setTrigger(false);
    for (let i = 0; i < 10; i++) frame(lab);
    expect(lab.shotsFired).toBe(1);
  });
  it('retains clock phase and blocks held fire across swaps, including automatic weapons', () => {
    const lab = new GunLab(); lab.setTrigger(true); frame(lab);
    lab.tick(COMBAT_FRAME_MS / 2, COMBAT_FRAME_MS * 1.5);
    lab.select('m4');
    lab.tick(COMBAT_FRAME_MS / 2, COMBAT_FRAME_MS * 2);
    expect(lab.gun.cooldownFrames).toBe(5);
    for (let i = 0; i < 10; i++) frame(lab);
    expect(lab.gun.ammo).toBe(30);
    lab.setTrigger(false); lab.setTrigger(true); frame(lab);
    expect(lab.gun.ammo).toBe(29);
  });
  it('blocks manual reload until the seventh decrement but permits it before the next shot phase', () => {
    const lab = new GunLab(); lab.setTrigger(true); frame(lab); lab.setTrigger(false);
    for (let i = 0; i < 5; i++) frame(lab);
    expect(lab.gun.reload()).toBe(false);
    frame(lab);
    expect(lab.gun.cooldownFrames).toBe(0);
    expect(lab.gun.reload()).toBe(true);
  });
  it('produces the same combat state across frame batching, including automatic reload', () => {
    const run = (hz: number) => {
      const lab = new GunLab(); lab.select('m4'); lab.setTrigger(true);
      for (let i = 1; i <= hz * 8; i++) lab.tick(1000 / hz, i * 1000 / hz);
      return lab.snapshot();
    };
    const reference = run(30);
    for (const hz of [15, 60, 120]) {
      const actual = run(hz);
      expect(actual.ammo).toBe(reference.ammo);
      expect(actual.reserveAmmo).toBe(reference.reserveAmmo);
      expect(actual.shotsFired).toBe(reference.shotsFired);
      expect(actual.cooldownFrames).toBe(reference.cooldownFrames);
      expect(actual.combatFrame).toBe(240);
      expect(actual.reloadMs).toBeCloseTo(reference.reloadMs, 6);
    }
  });
  it('advances manual reload on the 30 Hz arm timeline', () => {
    const gun = new GunController(USP); gun.fire('p', null, 0); gun.tick(250);
    expect(gun.reload()).toBe(true);
    gun.tick(27 * COMBAT_FRAME_MS);
    expect(gun.ammo).toBe(11);
    expect(gun.reloadFrames).toBe(1);
    gun.tick(COMBAT_FRAME_MS);
    expect([gun.ammo, gun.reserveAmmo, gun.reloadFrames]).toEqual([12, 59, 0]);
  });
  it('does not advance an automatic reload on the frame that starts it', () => {
    const lab = new GunLab(); lab.select('m4'); lab.gun.ammo = 1; lab.setTrigger(true);
    frame(lab);
    expect(lab.snapshot()).toMatchObject({ ammo: 0, reloadFrames: 34, combatFrame: 1 });
    for (let i = 0; i < 33; i++) frame(lab);
    expect(lab.snapshot()).toMatchObject({ ammo: 0, reloadFrames: 1, combatFrame: 34 });
    frame(lab);
    expect(lab.snapshot()).toMatchObject({ ammo: 30, reserveAmmo: 60, reloadFrames: 0, combatFrame: 35 });
  });
  it('finishes reload after the held-fire attempt on the callback frame', () => {
    const lab = new GunLab(); lab.select('m4'); lab.gun.ammo = 1; lab.setTrigger(true); frame(lab);
    for (let i = 0; i < M4.reloadFrames; i++) frame(lab);
    expect(lab.snapshot()).toMatchObject({ ammo: 30, shotsFired: 1, reloadFrames: 0 });
    frame(lab);
    expect(lab.snapshot()).toMatchObject({ ammo: 29, shotsFired: 2 });
  });
});
