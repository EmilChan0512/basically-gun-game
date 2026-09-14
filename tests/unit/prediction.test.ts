import { expect, it } from 'vitest';
import { Prediction } from '../../src/client/session/Prediction';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import type { StateMessage } from '../../src/shared/protocol/State';
it('stops predicted falling at the authority boundary while awaiting the death snapshot', () => {
  const b = new Battle(customMatch('hijack'), 'normal', 'm4', seededRandom(1));
  b.player.movement.reset(2700, 1250);
  const prediction = new Prediction();
  prediction.accept({ type: 'state', roomId: 'test', round: 1, actorId: b.player.id, mapId: 'hijack', mode: 'tdm',
    state: b.snapshot(), result: null, ack: -1, movement: b.player.movement.checkpoint(), jumpHeld: false,
    poses: [], effects: [], bursts: [], grenades: [], events: [] });
  for (let sequence = 0; sequence < 20; sequence++) prediction.input(sequence, idleInput());
  expect(prediction.movement!.y).toBeGreaterThan(1260);
  expect(prediction.movement!.y).toBeLessThan(1280);
  const stopped = prediction.movement!.checkpoint();
  prediction.input(20, idleInput()); expect(prediction.movement!.checkpoint()).toEqual(stopped);
  expect(b.player.life.alive).toBe(true);
});
it.each(['signal','atrium'])('%s replays unacknowledged input and converges to authority after delayed acknowledgements', mapId => {
  const b = new Battle(customMatch(mapId), 'normal', 'm4', seededRandom(1));
  b.actors.forEach(a => { a.human = true; });
  if(mapId==='atrium')b.player.movement.reset(930,1439.5);
  const host = new MatchSession(b); host.bind('p', b.player.id);
  const state = (): StateMessage => ({ type: 'state', roomId: 'test', round: 1, actorId: b.player.id, mapId, mode: 'tdm', state: b.snapshot(), result: null,
    ack: host.acknowledgements().p, movement: b.player.movement.checkpoint(), jumpHeld: host.jumpHeld('p'), poses: [], effects: [], bursts: [], grenades: [], events: [] });
  const prediction = new Prediction(); prediction.accept(state());
  const commands = Array.from({ length: 20 }, (_, sequence) => ({ sequence, input: { ...idleInput(), right: true, jump: sequence >= 4 && sequence <= 6 }, actions: [] }));
  for (const command of commands) prediction.input(command.sequence, command.input);
  const anticipated = prediction.movement!.checkpoint();
  for (const command of commands.slice(0, 10)) { host.submit('p', command); host.tick(); }
  prediction.accept(state());
  expect(prediction.movement!.checkpoint()).toEqual(anticipated);
  for (const command of commands.slice(10)) { host.submit('p', command); host.tick(); }
  prediction.accept(state());
  expect(prediction.movement!.checkpoint()).toEqual(b.player.movement.checkpoint());
});

it('renders between ticks, eases corrections and snaps life transitions without changing physics', () => {
  const b = new Battle(customMatch('signal'), 'normal', 'm4', seededRandom(1));
  const state = (): StateMessage => ({ type: 'state', roomId: 'test', round: 1, actorId: b.player.id, mapId: 'signal', mode: 'tdm', state: b.snapshot(), result: null,
    ack: -1, movement: b.player.movement.checkpoint(), jumpHeld: false, poses: [], effects: [], bursts: [], grenades: [], events: [] });
  const prediction = new Prediction(); prediction.accept(state());
  const start = prediction.movement!.x;
  prediction.input(0, { ...idleInput(), right: true });
  const end = prediction.movement!.x;
  expect(prediction.position(0, 0)!.x).toBe(start);
  expect(prediction.position(0.5, 0)!.x).toBeCloseTo((start + end) / 2);
  const displayed = prediction.position(1, 0)!;
  b.player.movement.x += 12;
  prediction.accept(state());
  expect(prediction.movement!.x).toBeCloseTo(end + 12);
  expect(prediction.position(1, 0)!.x).toBeCloseTo(displayed.x);
  expect(prediction.position(1, 1000)!.x).toBeCloseTo(end + 12, 2);
  b.player.life.deaths++; b.player.movement.reset(900, 300);
  prediction.accept({ ...state(), ack: 0 });
  expect(prediction.position(0.5, 16)).toEqual({ x: 900, y: 300 });
  // Render samples are values, not mutable aliases shared by camera and rig.
  const sample = prediction.position(1, 0)!;
  prediction.input(1, { ...idleInput(), right: true });
  expect(sample).toEqual({ x: 900, y: 300 });
});
