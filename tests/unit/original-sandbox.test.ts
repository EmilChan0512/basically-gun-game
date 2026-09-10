import { describe, expect, it } from 'vitest';
import { OriginalSandbox } from '../../src/game/combat/OriginalSandbox';
const idle = { left: false, right: false, crouch: false };
const aim = { x: 700, y: 560 };
describe('original rules integrated sandbox', () => {
  it('uses Medic L1 ammunition, ordinary M4, recoil and muzzle pre-travel', () => {
    const sandbox = new OriginalSandbox(() => 0.5);
    expect(sandbox.snapshot().combat).toMatchObject({ weapon: 'm4', ammo: 30, reserveAmmo: 78 });
    sandbox.tick(idle, aim); sandbox.setTrigger(true); sandbox.tick(idle, aim);
    expect(sandbox.guns.lastShot).toMatchObject({ preSteps: 11, maxDistance: 600 });
    expect(sandbox.guns.gun.ammo).toBe(29);
  });
  it('freezes weapons and motion on death, restores primary ammo on respawn, and latches held fire', () => {
    const sandbox = new OriginalSandbox(() => 0.5);
    sandbox.setTrigger(true); sandbox.tick(idle, aim); sandbox.lethalFixture();
    const before = sandbox.snapshot();
    sandbox.swap(); sandbox.jump(); sandbox.reload();
    for (let i = 0; i < 150; i++) sandbox.tick({ ...idle, right: true }, aim);
    expect(sandbox.snapshot()).toMatchObject({ x: before.x, y: before.y, life: { alive: false, respawnFrames: 0 }, combat: { ammo: before.combat.ammo } });
    sandbox.tick(idle, aim);
    expect(sandbox.snapshot()).toMatchObject({ life: { alive: true, health: 85 }, combat: { weapon: 'm4', ammo: 30, reserveAmmo: 78 } });
    for (let i = 0; i < 10; i++) sandbox.tick(idle, aim);
    expect(sandbox.guns.gun.ammo).toBe(30);
    sandbox.setTrigger(false); sandbox.setTrigger(true); sandbox.tick(idle, aim);
    expect(sandbox.guns.gun.ammo).toBe(29);
  });
  it('preserves identical discrete state across 15/30/60/120Hz scheduling', () => {
    const states = [15, 30, 60, 120].map(hz => {
      const sandbox = new OriginalSandbox(() => 0.5); sandbox.setTrigger(true);
      for (let i = 0; i < hz * 2; i++) sandbox.advance(1000 / hz, idle, aim);
      return sandbox.snapshot();
    });
    for (const state of states.slice(1)) expect(state).toEqual(states[0]);
  });
});
