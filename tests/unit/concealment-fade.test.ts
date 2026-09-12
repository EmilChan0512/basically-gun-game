import { expect, it } from 'vitest';
import { ConcealmentFade } from '../../src/client/presentation/ConcealmentFade';
import { skillStatus } from '../../src/client/presentation/SkillStatus';

it('fades in and out over one second while retaining a visible self silhouette', () => {
  const fade = new ConcealmentFade();
  expect(fade.alpha('self', false, true, 0)).toBe(1);
  expect(fade.alpha('self', true, true, 150)).toBe(1);
  expect(fade.alpha('self', true, true, 165)).toBeCloseTo(.625);
  expect(fade.alpha('self', true, true, 180)).toBe(.25);
  expect(fade.alpha('self', false, true, 181)).toBe(.25);
  expect(fade.alpha('self', false, true, 196)).toBeCloseTo(.625);
  expect(fade.alpha('self', false, true, 211)).toBe(1);
});
it('reverses without a jump and clears opacity on death or clock reset', () => {
  const fade = new ConcealmentFade(); fade.alpha('self', true, true, 0);
  const before = fade.alpha('self', true, true, 10);
  expect(fade.alpha('self', false, true, 10)).toBe(before);
  expect(fade.alpha('self', false, true, 20)).toBeGreaterThan(before);
  expect(fade.alpha('self', false, false, 21)).toBe(1);
  expect(fade.alpha('self', false, true, 22)).toBe(1);
  fade.alpha('self', true, true, 30); expect(fade.alpha('self', true, true, 60)).toBe(.25);
  expect(fade.alpha('self', false, true, 0)).toBe(1);
});
it('does not transfer pooled actor opacity to another character', () => {
  const fade = new ConcealmentFade(); fade.begin(); fade.alpha('a', true, true, 0);
  fade.begin(); expect(fade.alpha('a', true, true, 30)).toBe(.25);
  expect(fade.alpha('b', false, true, 30)).toBe(1);
  fade.begin(); fade.begin(); expect(fade.alpha('a', false, true, 31)).toBe(1);
});
it('labels the equipped passive without a misleading E key or cooldown', () => {
  expect(skillStatus({ skill: 'stealth', stealthFrames: 150, skillFrames: 0, skillCooldown: 0 })).toBe('被动 隐匿 · 已生效');
  expect(skillStatus({ skill: 'stealth', stealthFrames: 75, skillFrames: 0, skillCooldown: 0 })).toContain('2.5/5s');
  expect(skillStatus({ skill: 'focus', stealthFrames: 150, skillFrames: 0, skillCooldown: 0 })).toBe('E 精准专注 · 就绪');
});
