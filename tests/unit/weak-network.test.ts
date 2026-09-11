import { expect, it } from 'vitest';
import { FireInput } from '../../src/client/session/FireInput';
import { ShotPresentation } from '../../src/client/session/ShotPresentation';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import type { StateMessage } from '../../src/shared/protocol/State';

it('captures a click shorter than one tick and preserves semi-auto release edges', () => {
  const fire = new FireInput();
  fire.edge(true, 5); fire.edge(false, 15);
  expect(fire.sample(false, 33)).toBe(true);
  expect(fire.sample(false, 66)).toBe(false);
  expect(fire.sample(false, 99)).toBe(false);
  fire.edge(true, 100); fire.edge(false, 105); fire.edge(true, 120); fire.edge(false, 125);
  expect([133, 166, 199, 232].map(t => fire.sample(false, t))).toEqual([true, false, true, false]);
  fire.edge(true, 300); expect(fire.sample(false, 600)).toBe(false);
});

it('expires tracers when snapshots freeze and never revives duplicates', () => {
  const battle = new Battle(MISSIONS[0]);
  const effect = { frame: 10, actorId: 'player', trace: { origin: { x: 0, y: 0 }, end: { x: 100, y: 0 } } } as StateMessage['effects'][number];
  const message = { roomId: 'test', round: 1, state: { ...battle.snapshot(), frame: 10 }, effects: [effect] } as StateMessage;
  const shots = new ShotPresentation(); shots.accept(message, 1000);
  expect(shots.visible(1050)).toHaveLength(1);
  expect(shots.visible(1101)).toHaveLength(0);
  shots.accept(message, 1600); expect(shots.visible(1600)).toHaveLength(0);
  shots.accept({ ...message, state: { ...message.state, frame: 20 }, effects: [{ ...effect, frame: 11 }] }, 2000);
  expect(shots.visible(2000)).toHaveLength(0);
});

it('drains a 600ms continuous-input burst in three ticks instead of keeping 600ms of backlog', () => {
  const battle = new Battle(MISSIONS[0]), session = new MatchSession(battle); session.bind('p', 'player');
  for (let sequence = 0; sequence < 18; sequence++) session.submit('p', { sequence, input: { ...idleInput(), right: true }, actions: [] });
  expect(session.diagnostics('p')).toMatchObject({ queue: 3, coalesced: 15 });
  for (let i = 0; i < 3; i++) session.tick();
  expect(session.acknowledgements().p).toBe(17);
});

it('coalesces stale continuous input without deleting short fire and jump transitions or actions', () => {
  const battle = new Battle(MISSIONS[0]), session = new MatchSession(battle); session.bind('p', 'player');
  const inputs = [false, false, true, false, false, false];
  inputs.forEach((fire, sequence) => session.submit('p', { sequence, input: { ...idleInput(), fire, jump: sequence === 2 }, actions: sequence === 3 ? ['swap'] : [] }));
  for (let i = 0; i < 6; i++) session.tick();
  expect(session.diagnostics('p')).toMatchObject({ firePresses: 1, shots: 1 });
  expect(battle.player.arsenal.selected).toBe('usp');
  expect(battle.player.movement.jumping).toBe(true);
});

it('uses the received aim for online fire instead of smoothing toward an old aim', () => {
  const battle = new Battle(MISSIONS[0]), session = new MatchSession(battle); session.bind('p', 'player');
  const aim = { x: 700, y: 200 };
  session.submit('p', { sequence: 0, input: { ...idleInput(), fire: true, aim }, actions: [] }); session.tick();
  expect(battle.player.aim).toEqual(aim);
  expect(session.diagnostics('p')!.shots).toBe(1);
});
