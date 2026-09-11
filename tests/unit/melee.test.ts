import { expect, it } from 'vitest';
import { MeleeSwing, KNIFE_RULES, type MeleeTarget } from '../../src/shared/simulation/Melee';
const origin = { x: 0, y: 0 }, aim = { x: 100, y: 0 };
const target = (id: string, x: number, y = 0): MeleeTarget => ({ id, team: 2, alive: true, position: { x, y } });
it('honors windup, hits once per target and prevents restarting during recovery', () => {
  const swing = new MeleeSwing(), targets = [target('enemy', 40)];
  expect(swing.start(origin, aim)).toBe(true);
  for (let i = 0; i < 4; i++) expect(swing.tick('self', 1, origin, targets, () => false)).toEqual([]);
  const hits = swing.tick('self', 1, origin, targets, () => false);
  expect(hits).toHaveLength(1); expect(hits[0].damage.amount).toBe(KNIFE_RULES.damage);
  for (let i = 5; i < 19; i++) {
    expect(swing.start(origin, aim)).toBe(false);
    expect(swing.tick('self', 1, origin, targets, () => false)).toEqual([]);
  }
  expect(swing.start(origin, aim)).toBe(true);
});
it('filters friends, dead, out-of-range and rear targets and respects thin walls', () => {
  const swing = new MeleeSwing(); swing.start(origin, aim);
  const targets = [target('front', 40), target('back', -20), target('far', 65),
    { ...target('friend', 20), team: 1 as const }, { ...target('dead', 20), alive: false }];
  for (let i = 0; i < 4; i++) swing.tick('self', 1, origin, targets, () => false);
  expect(swing.tick('self', 1, origin, targets, x => x >= 19 && x <= 20)).toEqual([]);
  expect(swing.tick('self', 1, origin, targets, () => false).map(h => h.targetId)).toEqual(['front']);
});
it('restores active-window hit deduplication and allows a newly entering target', () => {
  const swing = new MeleeSwing(); swing.start(origin, aim);
  for (let i = 0; i < 5; i++) swing.tick('self', 1, origin, [target('first', 40)], () => false);
  const restored = new MeleeSwing(); restored.restore(swing.checkpoint());
  const targets = [target('first', 40), target('second', 30)];
  expect(restored.tick('self', 1, origin, targets, () => false)).toEqual(swing.tick('self', 1, origin, targets, () => false));
  expect(restored.checkpoint().hitIds).toEqual(['first', 'second']);
});
