import { expect, it } from 'vitest';
import { Interpolation } from '../../src/client/session/Interpolation';
import { Battle } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import type { StateMessage } from '../../src/shared/protocol/State';
it('interpolates remote movement but snaps respawns and never extrapolates', () => {
  const b = new Battle(MISSIONS[0]);
  const message = (): StateMessage => ({ type: 'state', roomId: 'test', round: 1, actorId: 'player', mapId: 'signal', mode: 'tdm', state: b.snapshot(), result: null, ack: 0, poses: [], effects: [], bursts: [], grenades: [], events: [] });
  const interpolation = new Interpolation(); interpolation.push(message(), 0);
  b.frame = 2; b.player.movement.x += 20;
  const next = message(), actor = next.state.actors[0]; interpolation.push(next, 100);
  expect(interpolation.position(actor, 100).x).toBeCloseTo(actor.x - 10);
  expect(interpolation.position(actor, 100 + 1000 / 30).x).toBeCloseTo(actor.x);
  expect(interpolation.position(actor, 1000).x).toBe(actor.x);
  b.frame = 4; b.player.life.deaths++; b.player.movement.x += 100;
  const respawn = message(); interpolation.push(respawn, 200);
  expect(interpolation.position(respawn.state.actors[0], 200).x).toBe(b.player.movement.x);
});

it('keeps a fixed two-tick timeline through jitter and bursts without restarting interpolation', () => {
  const b = new Battle(MISSIONS[0]); const interpolation = new Interpolation();
  const push = (frame: number, time: number, round = 1) => {
    b.frame = frame; b.player.movement.x = 100 + frame * 10;
    const message: StateMessage = { type: 'state', roomId: 'test', round, actorId: 'player', mapId: 'signal', mode: 'tdm',
      state: b.snapshot(), result: null, ack: 0, poses: [], effects: [], bursts: [], grenades: [], events: [] };
    interpolation.push(message, time); return message.state.actors[0];
  };
  push(0, 0); const a = push(2, 70);
  expect(interpolation.position(a, 100).x).toBeCloseTo(110);
  const b4 = push(4, 150);
  expect(interpolation.position(b4, 150).x).toBeCloseTo(125);
  const b6 = push(6, 201);
  expect(interpolation.position(b6, 201).x).toBeCloseTo(140.3);
  const b8 = push(8, 350), b10 = push(10, 350);
  expect(interpolation.position(b10, 350).x).toBeCloseTo(185);
  expect(interpolation.frame(1000)).toBe(10);
  expect(interpolation.position(b10, 1100).x).toBe(200);
  push(8, 1200); expect(interpolation.frame(1200)).toBe(10);
  const newRound = push(0, 1300, 2);
  expect(interpolation.position(newRound, 1300).x).toBe(100);
  expect(interpolation.frame(1300)).toBe(0);
});
