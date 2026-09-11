import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { idleInput } from '../../src/game/campaign/Battle';
import { validateEquipment } from '../../src/shared/content/Equipment';
it('rejects unknown, wrong-slot and client-owned damage fields without altering readiness', () => {
  const room = new Room('equipment'); room.join('a', 'A'); room.ready('a', true);
  for (const equipment of [null, { primary: 'knife', secondary: 'usp' }, { primary: 'm4', secondary: 'saw' },
    { primary: 'm4', secondary: 'constructor' }, { primary: 'm4', secondary: 'knife', damage: 999 }]) {
    expect(() => room.equip('a', equipment)).toThrow();
    expect(room.players.get('a')!.ready).toBe(true);
  }
  expect(validateEquipment({ classId: 'tank', primary: 'shotgun', secondary: 'shield' })).toEqual({ classId: 'tank', primary: 'shotgun', secondary: 'shield' });
});
it('binds different equipment, persists through respawn and forbids in-match refills', () => {
  const room = new Room('equipment', 'signal'); room.join('a', 'A'); room.join('b', 'B');
  room.ready('a', true); room.equip('a', { classId: 'assassin', primary: 'scout', secondary: 'knife' });
  expect(room.players.get('a')!.ready).toBe(false);
  room.equip('b', { classId: 'tank', primary: 'shotgun', secondary: 'shield' });
  room.ready('a', true); room.ready('b', true); room.start('a', 7);
  const battle = room.session!.battle;
  expect(battle.actors.map(a => a.offhand!.kind)).toEqual(['melee', 'shield']);
  expect(() => room.equip('b', { primary: 'm4', secondary: 'usp' })).toThrow();
  battle.tick(idleInput());
  expect(() => battle.equipActor(battle.player, { primary: 'm4', secondary: 'usp' })).toThrow();
  battle.player.life.spawnProtectionFrames = 0; battle.damage(battle.player, 9999);
  battle.player.life.respawnFrames = 0; battle.tick(idleInput());
  expect(battle.player.arsenal.selected).toBe('scout');
  expect(battle.player.offhand!.kind).toBe('melee');
  expect(battle.snapshot().actors[0].offhand).toMatchObject({ kind: 'melee', equipped: false });
  const lobby = room.lobby(); lobby.players[0].equipment.primary = 'm4';
  expect(room.players.get('a')!.equipment.primary).toBe('scout');
});
