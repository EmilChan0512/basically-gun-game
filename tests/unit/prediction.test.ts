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
it('replays unacknowledged input and converges to authority after delayed acknowledgements', () => {
  const b = new Battle(customMatch('signal'), 'normal', 'm4', seededRandom(1));
  b.actors.forEach(a => { a.human = true; });
  const host = new MatchSession(b); host.bind('p', b.player.id);
  const state = (): StateMessage => ({ type: 'state', roomId: 'test', round: 1, actorId: b.player.id, mapId: 'signal', mode: 'tdm', state: b.snapshot(), result: null,
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
