import { expect, it } from 'vitest';
import { OffhandController, SHIELD_RULES, type OffhandFrame } from '../../src/shared/simulation/Offhand';
import { interceptShield } from '../../src/shared/simulation/Shield';
const frame: OffhandFrame = { alive: true, fire: true, sourceId: 'self', team: 1,
  origin: { x: 0, y: 0 }, aim: { x: 100, y: 0 },
  targets: [{ id: 'enemy', team: 2, alive: true, position: { x: 30, y: 0 } }], wall: () => false };

it('does not turn held fire during selection into a knife attack or repeat held swings', () => {
  const controller = new OffhandController('melee');
  controller.select(true, true);
  for (let i = 0; i < 30; i++) expect(controller.tick(frame)).toEqual([]);
  expect(controller.canSwitch).toBe(true);
  controller.tick({ ...frame, fire: false });
  let hits = 0;
  for (let i = 0; i < 40; i++) hits += controller.tick(frame).length;
  expect(hits).toBe(1);
  expect(controller.checkpoint().melee.serial).toBe(1);
  expect(controller.permitsGunfire).toBe(false);
});

it('blocks switching during a swing and preserves recovery through forced stow and restore', () => {
  const controller = new OffhandController('melee'); controller.select(true, false);
  controller.tick(frame);
  expect(controller.select(false, true)).toBe(false);
  expect(controller.select(false, true, true)).toBe(true);
  const restored = OffhandController.restore(controller.checkpoint());
  for (let i = 1; i < 12; i++) {
    expect(restored.permitsGunfire).toBe(false);
    expect(restored.tick(frame)).toEqual(controller.tick(frame));
    expect(restored.checkpoint()).toEqual(controller.checkpoint());
  }
  expect(restored.permitsGunfire).toBe(true);
  expect(restored.canSwitch).toBe(true);
});

it('requires continuous shield deployment and retains reusable defense across stow', () => {
  const controller = new OffhandController('shield'); controller.select(true, false);
  for (let i = 0; i < SHIELD_RULES.deployTicks - 1; i++) controller.tick(frame);
  expect(controller.shield.deployed).toBe(false);
  const restored = OffhandController.restore(controller.checkpoint()); restored.tick(frame);
  expect(restored.shield.deployed).toBe(true);
  interceptShield(restored.shield, frame.origin, frame.aim,
    { kind: 'bullet', amount: 30, sourceId: 'enemy', origin: frame.aim, hitPoint: frame.origin });
  restored.select(false, true); restored.select(true, true);
  expect(restored.shield).toEqual({ durability: 120, deployed: false });
  restored.tick(frame); restored.tick({ ...frame, fire: false }); restored.tick(frame);
  expect(restored.shield.deployed).toBe(false);
  restored.tick({ ...frame, alive: false });
  expect(restored.checkpoint().deployAge).toBe(0);
});

it('keeps a shield reusable after heavy hits and rejects impossible restored defense', () => {
  const controller = new OffhandController('shield'); controller.select(true, false);
  for (let i = 0; i < 6; i++) controller.tick(frame);
  interceptShield(controller.shield, frame.origin, frame.aim,
    { kind: 'bullet', amount: 140, sourceId: 'enemy', origin: frame.aim, hitPoint: frame.origin });
  const restored = OffhandController.restore(controller.checkpoint());
  for (let i = 0; i < 12; i++) restored.tick(frame);
  expect(restored.shield).toEqual({ durability: 120, deployed: true });
  expect(() => OffhandController.restore({ ...restored.checkpoint(), selected: false })).toThrow();
});
