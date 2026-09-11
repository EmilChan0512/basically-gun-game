import { expect, it } from 'vitest';
import { DeliveryObjectives, type ObjectiveActor } from '../../src/shared/simulation/DeliveryObjectives';
const bases: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: 100 }, { x: 1000, y: 100 }];
const player = (id: string, team: 1 | 2, x: number): ObjectiveActor => ({ id, team, x, y: 100, alive: true });
it('resolves contested pickups by stable ID independent of incoming actor order', () => {
  const a = new DeliveryObjectives(bases), b = new DeliveryObjectives(bases);
  const players = [player('z', 1, 1000), player('a', 1, 1000)];
  expect(a.tick(players)).toEqual(b.tick([...players].reverse()));
  expect(a.snapshot()[1].carrierId).toBe('a');
  expect(a.tick(players)).toEqual([]);
});
it('delivers once even while the own objective is being carried', () => {
  const objectives = new DeliveryObjectives(bases);
  const blue = player('b', 1, 1000), red = player('r', 2, 0);
  objectives.tick([blue, red]); blue.x = 0; red.x = 500;
  expect(objectives.tick([blue, red])).toEqual([{ kind: 'delivery', targetTeam: 2, actorId: 'b', team: 1 }]);
  expect(objectives.snapshot()[0].carrierId).toBe('r');
  expect(objectives.tick([blue, red])).toEqual([]);
});
it.each(['dead', 'missing', 'invalid-position', 'changed-team'])('returns immediately when carrier is %s', cause => {
  const objectives = new DeliveryObjectives(bases), actor = player('b', 1, 1000);
  objectives.tick([actor]);
  if (cause === 'dead') actor.alive = false;
  if (cause === 'invalid-position') actor.x = NaN;
  if (cause === 'changed-team') actor.team = 2;
  expect(objectives.tick(cause === 'missing' ? [] : [actor])).toEqual([
    { kind: 'return', targetTeam: 2, actorId: 'b', reason: 'carrier-unavailable' }]);
  expect(objectives.snapshot()[1].carrierId).toBeNull();
});
it('restores carriers without duplicating objectives and keeps snapshots isolated', () => {
  const original = new DeliveryObjectives(bases), actor = player('b', 1, 1000);
  original.tick([actor]); const restored = new DeliveryObjectives(bases);
  restored.restore(original.snapshot());
  const copy = restored.snapshot(); copy[1].carrierId = null;
  actor.x = 0; expect(restored.tick([actor])).toEqual(original.tick([actor]));
  copy[0].base.x = 1; expect(() => restored.restore(copy)).toThrow();
});
