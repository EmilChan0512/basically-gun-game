import { expect, it } from 'vitest';
import { CoopRecords, COOP_RECORDS_KEY } from '../../src/client/session/CoopRecords';
import { Room } from '../../src/shared/simulation/Room';
import type { StateMessage } from '../../src/shared/protocol/State';

function fixture(): StateMessage {
  const room = new Room('records', 'hijack', 'coop');
  room.join('p', 'Pilot'); room.ready('p', true); room.start('p', 12);
  const battle = room.session!.battle;
  battle.endMatch(1, 'Record persistence fixture, not natural combat');
  return { type: 'state', roomId: room.id, round: room.round, actorId: room.session!.actorId('p')!,
    mapId: room.mapId, mode: room.mode, state: battle.snapshot(), result: battle.result,
    ack: -1, poses: [], effects: [], bursts: [], grenades: [], events: [] };
}
function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
it('records only terminal coop participation, excluding spectators and unrelated actors', () => {
  const records = new CoopRecords(memory()), state = fixture();
  expect(records.record('room', { ...state, result: null })).toBe(false);
  expect(records.record('room', { ...state, mode: 'tdm' })).toBe(false);
  expect(records.record('room', { ...state, actorId: null })).toBe(false);
  expect(records.record('room', { ...state, actorId: 'missing' })).toBe(false);
  expect(records.record('room', state)).toBe(true);
  expect(records.list()[0]).toMatchObject({ outcome: 'won', kills: 0, deaths: 0, mapId: 'hijack' });
});
it('deduplicates terminal repeats and reloads but distinguishes rounds and room incarnations', () => {
  const storage = memory(), state = fixture(), records = new CoopRecords(storage);
  storage.values.set('career', 'unchanged');
  expect(records.record('one', state)).toBe(true);
  expect(records.record('one', state)).toBe(false);
  const restored = new CoopRecords(storage);
  expect(restored.record('one', state)).toBe(false);
  expect(restored.record('one', { ...state, round: 2 })).toBe(true);
  expect(restored.record('two', state)).toBe(true);
  expect(restored.list()).toHaveLength(3);
  expect([...storage.values.keys()].sort()).toEqual(['career', COOP_RECORDS_KEY].sort());
  expect(storage.values.get('career')).toBe('unchanged');
  const copy = restored.list(); copy[0].kills = 999;
  expect(restored.list()[0].kills).toBe(0);
});
it('preserves and deduplicates unwritten records when storage is full, then persists on recovery', () => {
  const storage = memory(), state = fixture(); let fail = false;
  const records = new CoopRecords({ getItem: storage.getItem, setItem(key, value) {
    if (fail) throw Error('QuotaExceededError'); storage.setItem(key, value);
  } });
  records.record('old', state); fail = true;
  expect(records.record('new', state)).toBe(true);
  expect(records.persistent).toBe(false);
  for (let i = 0; i < 5; i++) expect(records.record('new', state)).toBe(false);
  expect(records.list()).toHaveLength(2);
  fail = false; records.record('recovered', state);
  expect(records.persistent).toBe(true);
  expect(new CoopRecords(storage).list()).toHaveLength(3);
});
it('bounds storage to 50 recent records and rejects malformed persisted entries', () => {
  const storage = memory(), state = fixture();
  storage.setItem(COOP_RECORDS_KEY, JSON.stringify({ version: 1, entries: [null, {}, { id: 'bad' }] }));
  const records = new CoopRecords(storage); expect(records.list()).toEqual([]);
  for (let round = 1; round <= 55; round++) records.record('room', { ...state, round });
  expect(records.list()).toHaveLength(50);
  expect(new CoopRecords(storage).list()).toEqual(records.list());
  expect(records.list().some(r => r.id === 'room:1')).toBe(false);
});
it('supports denied storage and recovers corrupt JSON without affecting career data', () => {
  const state = fixture(), records = new CoopRecords();
  expect(records.record('room', state)).toBe(true);
  expect(records.record('room', state)).toBe(false);
  expect(records.persistent).toBe(false);
  const denied = new CoopRecords({ getItem() { throw Error('SecurityError'); }, setItem() { throw Error('SecurityError'); } });
  expect(denied.record('room', state)).toBe(true);
  expect(denied.record('room', state)).toBe(false);
  const storage = memory(); storage.setItem(COOP_RECORDS_KEY, '{broken');
  const recovered = new CoopRecords(storage); recovered.record('room', state);
  expect(recovered.persistent).toBe(true);
  expect(new CoopRecords(storage).list()).toHaveLength(1);
});
