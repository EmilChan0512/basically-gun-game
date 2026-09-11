import { expect, it } from 'vitest';
import { Battle } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';
it('removes hidden actor coordinates from poses, hits, effects and projectiles without mutating the authority', () => {
  const battle = new Battle(customMatch('hijack')), source = battle.player.id, hidden = battle.actors[4].id;
  const trace = { origin: { x: 20, y: 20 }, end: { x: 30, y: 30 }, maxDistance: 100, steps: 1,
    preSteps: 0, initialHit: null, headMarked: false, hit: { type: 'unit' as const, target: hidden, region: 'body' as const } };
  const message: StateMessage = { type: 'state', roomId: 'test', round: 1, actorId: source, mapId: 'hijack', mode: 'tdm',
    state: battle.snapshot(), result: null, ack: 5,
    poses: battle.actors.map(a => ({ id: a.id, name: a.name, aim: { x: a.movement.x, y: a.movement.y } })),
    effects: [{ frame: 0, actorId: source, team: 1, damage: 10, killed: false, trace }],
    bursts: [{ x: 99999, y: 99999, frame: 0, radius: 10, color: 1 }], grenades: [{ x: 99999, y: 99999 }],
    events: [{ id: 1, tick: 0, kind: 'damage', actorId: source, targetId: hidden }, { id: 2, tick: 0, kind: 'result' }] };
  const filtered = visibleState(message, new Set([source]), 1, () => true);
  expect(filtered.state.actors.map(a => a.id)).toEqual([source]);
  expect(filtered.poses.map(p => p.id)).toEqual([source]);
  expect(filtered.effects).toEqual([]); expect(filtered.bursts).toEqual([]); expect(filtered.grenades).toEqual([]);
  expect(filtered.events.map(e => e.id)).toEqual([2]); expect(filtered.ack).toBe(5);
  expect(message.state.actors).toHaveLength(8); expect(message.effects).toHaveLength(1);
});
