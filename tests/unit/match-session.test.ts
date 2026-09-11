import { expect, it } from 'vitest';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { MatchSession } from '../../src/shared/simulation/MatchSession';

it('binds commands to authenticated controller, deduplicates actions and acknowledges only processed commands', () => {
  const battle = new Battle(MISSIONS[0]); const session = new MatchSession(battle);
  session.bind('alice', 'player'); session.bind('bob', 'enemy-0');
  const command = { sequence: 0, input: idleInput(), actions: ['swap' as const] };
  expect(session.submit('unknown', command)).toBe(false);
  expect(session.submit('bob', command)).toBe(true);
  expect(session.submit('bob', command)).toBe(false);
  expect(session.acknowledgements().bob).toBe(-1);
  session.tick(); session.tick();
  expect(battle.actors[1].arsenal.selected).toBe('usp');
  expect(battle.player.arsenal.selected).toBe('m4');
  expect(session.acknowledgements().bob).toBe(0);
  expect(session.submit('bob', { ...command, sequence: 1, input: { ...idleInput(), aim: { x: NaN, y: 0 } } })).toBe(false);
});

it('bounds queues and neutralizes stale or disconnected input', () => {
  const battle = new Battle(MISSIONS[0]); const session = new MatchSession(battle, 3);
  session.bind('alice', 'player'); session.bind('bob', 'enemy-0');
  session.submit('alice', { sequence: 0, input: { ...idleInput(), fire: true }, actions: [] });
  for (let i = 0; i < 30; i++) session.tick();
  expect(battle.player.arsenal.shots).toBe(1);
  for (let i = 1; i <= 32; i++) expect(session.submit('alice', { sequence: i, input: idleInput(), actions: ['swap'] })).toBe(true);
  expect(session.submit('alice', { sequence: 33, input: idleInput(), actions: [] })).toBe(false);
  session.disconnect('alice'); session.tick();
  expect(battle.player.arsenal.selected).toBe('m4');
});
