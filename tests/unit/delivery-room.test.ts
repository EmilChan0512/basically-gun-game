import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { idleInput } from '../../src/game/campaign/Battle';

function carrierRoom(players: number) {
  const room = new Room('delivery-lifecycle', 'hijack', 'ctf');
  for (let i = 0; i < players; i++) { room.join(`p${i}`, `Pilot ${i}`); room.ready(`p${i}`, true); }
  room.start('p0', 42);
  const battle = room.session!.battle;
  const carrier = battle.actors.find(actor => actor.id === room.session!.actorId('p0'))!;
  const enemyBase = battle.mission.deliveryBases![1];
  // Geometry fixture only: acquisition and all lifecycle operations use real rules.
  carrier.movement.reset(enemyBase.x, enemyBase.y); room.session!.tick();
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBe(carrier.id);
  return { room, battle, carrier };
}

it('reconnects the same carrier without duplicating pickup or delivery, then accepts fresh input', () => {
  const { room, battle, carrier } = carrierRoom(8);
  room.disconnect('p0');
  expect(room.command('p0', { sequence: 0, input: idleInput(), actions: [] })).toBe(false);
  room.reconnect('p0');
  expect(room.session!.actorId('p0')).toBe(carrier.id);
  expect(battle.actors).toHaveLength(8);
  expect(battle.snapshot().deliveryTargets).toHaveLength(2);
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBe(carrier.id);
  const home = battle.mission.deliveryBases![0];
  carrier.movement.reset(home.x, home.y);
  expect(room.command('p0', { sequence: 0, input: idleInput(), actions: [] })).toBe(true);
  room.session!.tick(); room.session!.tick();
  expect(battle.scores).toEqual([1, 0]);
  expect(battle.journal.since(0).filter(event => event.kind === 'objective-delivery')).toHaveLength(1);
  expect(room.session!.acknowledgements().p0).toBe(0);
});

it.each([2, 8])('expires a carrier in a %i-player room exactly once and cannot reconnect the expired seat', players => {
  const { room, battle, carrier } = carrierRoom(players);
  room.disconnect('p0'); room.expire('p0'); room.expire('p0');
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBeNull();
  expect(battle.actors.some(actor => actor.id === carrier.id)).toBe(false);
  expect(battle.scores).toEqual([0, 0]);
  expect(battle.journal.since(0).filter(event => event.kind === 'objective-return')).toHaveLength(1);
  expect(() => room.reconnect('p0')).toThrow();
  expect(room.command('p0', { sequence: 0, input: idleInput(), actions: [] })).toBe(false);
  expect(room.hostId).toBe('p1');
  if (players === 2) expect(battle.result?.winner).toBe(2);
  else expect(battle.result).toBeNull();
});
