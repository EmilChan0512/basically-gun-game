import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { idleInput } from '../../src/game/campaign/Battle';
it('late joiners spectate without controllers, reconnect and participate next round', () => {
  const room = new Room('spectators'); room.join('a', 'A'); room.join('b', 'B');
  room.ready('a', true); room.ready('b', true); room.start('a', 1);
  room.join('c', 'C'); expect(room.players.get('c')!.spectator).toBe(true);
  expect(room.session!.battle.actors).toHaveLength(2);
  expect(room.session!.actorId('c')).toBeNull();
  expect(room.command('c', { sequence: 0, input: idleInput(), actions: ['swap'] })).toBe(false);
  room.disconnect('c'); room.reconnect('c'); expect(room.session!.actorId('c')).toBeNull();
  room.session!.battle.endMatch(1, 'fixture'); room.returnToLobby('a');
  for (const p of room.players.values()) { expect(p.spectator).toBe(false); room.ready(p.id, true); }
  room.start('a', 2); expect(room.session!.battle.actors).toHaveLength(3); expect(room.session!.actorId('c')).not.toBeNull();
});
it('spectator seats do not prevent an empty combat team from forfeiting', () => {
  const room = new Room('forfeit'); room.join('a', 'A'); room.join('b', 'B');
  room.ready('a', true); room.ready('b', true); room.start('a', 1);
  room.join('c', 'C'); room.join('d', 'D');
  room.disconnect('b'); room.expire('b');
  expect(room.session!.battle.result?.winner).toBe(1);
});
it('enforces eight slots and readiness and binds independent 4v4 controllers', () => {
  const room = new Room('test');
  for (let i = 0; i < 8; i++) room.join(`p${i}`, `Pilot ${i}`);
  expect(() => room.join('ninth', 'Extra')).toThrow('full');
  expect(() => room.start('p0', 1)).toThrow('ready');
  for (let i = 0; i < 8; i++) room.ready(`p${i}`, true);
  expect(() => room.start('p1', 1)).toThrow();
  room.start('p0', 1);
  expect(room.session!.battle.actors.filter(a => a.human)).toHaveLength(8);
  expect(room.command('p1', { sequence: 0, input: idleInput(), actions: ['swap'] })).toBe(true);
  room.session!.tick();
  expect(room.session!.battle.actors.find(a => a.name === 'Pilot 1')!.arsenal.selected).toBe('usp');
  expect(room.session!.battle.player.arsenal.selected).toBe('m4');
  room.disconnect('p1');
  expect(room.command('p1', { sequence: 1, input: idleInput(), actions: [] })).toBe(false);
});
it('transfers lobby ownership on departure and invalidates readiness when map changes', () => {
  const room = new Room('test'); room.join('a', 'A'); room.join('b', 'B'); room.ready('b', true);
  room.disconnect('a'); expect(room.hostId).toBe('b');
  room.configure('b', 'signal', 'dom'); expect(room.players.get('b')!.ready).toBe(false);
});
it('expires disconnected seats and awards a forfeit without inventing score', () => {
  const room = new Room('expiry'); room.join('a', 'A'); room.join('b', 'B');
  room.ready('a', true); room.ready('b', true); room.start('a', 1);
  room.disconnect('a'); room.expire('a');
  expect(room.players.has('a')).toBe(false); expect(room.hostId).toBe('b');
  expect(room.session!.battle.result).toMatchObject({ winner: 2, draw: false });
  expect(room.session!.battle.scores).toEqual([0, 0]);
});
it('returns to lobby and starts a new round with fresh input state', () => {
  const room = new Room('rounds'); room.join('a', 'A'); room.join('b', 'B');
  room.ready('a', true); room.ready('b', true); room.start('a', 1);
  const old = room.session!.battle.id;
  room.session!.battle.endMatch(1, 'test result');
  expect(() => room.returnToLobby('b')).toThrow();
  room.returnToLobby('a'); expect(room.session).toBeNull();
  expect([...room.players.values()].every(p => !p.ready)).toBe(true);
  room.configure('a', 'signal', 'dom'); room.ready('a', true); room.ready('b', true); room.start('a', 2);
  expect(room.session!.battle.id).not.toBe(old);
  expect(room.session!.battle.mission.mode).toBe('dom');
  expect(room.session!.nextSequence('a')).toBe(0);
});
