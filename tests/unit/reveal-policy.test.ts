import { expect, it } from 'vitest';
import { RevealPolicy, type RevealActor } from '../../src/shared/simulation/RevealPolicy';
const actor = (id: string, team: 1 | 2, x: number): RevealActor => ({ id, team, movement: { x, y: 100 }, life: { alive: true }, kit: null, skillFrames: 0 });
it('shares living teammates sight but hides occluded or distant enemies', () => {
  const actors = [actor('self', 1, 0), actor('ally', 1, 1000), actor('near', 2, 2500), actor('far', 2, 3500)];
  const reveal = new RevealPolicy();
  expect([...reveal.visible(actors, 0, [], () => false, 1)]).toEqual(['self', 'ally', 'near']);
  expect([...reveal.visible(actors, 0, [], () => true, 1)]).toEqual(['self', 'ally']);
  actors[1].life.alive = false;
  expect([...reveal.visible(actors, 0, [], () => false, 1)]).toEqual(['self', 'ally']);
});
it('exposes authoritative shots for 60 ticks without extending repeated events', () => {
  const actors = [actor('self', 1, 0), actor('enemy', 2, 1000)], reveal = new RevealPolicy();
  const events = [{ id: 1, tick: 10, kind: 'shot' as const, actorId: 'enemy' }];
  expect(reveal.visible(actors, 10, events, () => true, 1).has('enemy')).toBe(true);
  expect(reveal.visible(actors, 69, events, () => true, 1).has('enemy')).toBe(true);
  expect(reveal.visible(actors, 70, events, () => true, 1).has('enemy')).toBe(false);
});
it('hides cloak except for public carriers and never hides own teammates', () => {
  const actors = [actor('self', 1, 0), actor('enemy', 2, 100)];
  actors[1].kit = { skill: 'cloak' }; actors[1].skillFrames = 100;
  const reveal = new RevealPolicy();
  expect(reveal.visible(actors, 0, [], () => false, 1).has('enemy')).toBe(false);
  expect(reveal.visible(actors, 0, [], () => true, 1, new Set(['enemy'])).has('enemy')).toBe(true);
  expect(reveal.visible(actors, 0, [], () => true, 2).has('enemy')).toBe(true);
});
