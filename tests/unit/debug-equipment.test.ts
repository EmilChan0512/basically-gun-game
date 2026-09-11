import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { validateEquipment } from '../../src/shared/content/Equipment';
import { CLASSES, SKILLS, ITEMS } from '../../src/game/campaign/Catalog';

it('changes only the controlled debug actor in place and clears old actions, cooldowns and projectiles', () => {
  const room = new Room('debug', 'hijack', 'tdm', true); room.join('a', 'A'); room.join('b', 'B');
  const session = room.session!, battle = session.battle, actor = battle.actors[0], peer = battle.actors[1];
  session.tick(); const peerBefore = { health: peer.life.health, kit: structuredClone(peer.kit) }, position = actor.movement.checkpoint();
  actor.life.health = 1; actor.skillCooldown = 50; actor.skillFrames = 20; actor.itemCharges = 0; actor.itemCooldown = 9;
  actor.kills = 4; actor.life.deaths = 2; battle.scores[0] = 4;
  battle.grenades.push({ source: actor, x: 10, y: 20, vx: 0, vy: 0, fuse: 50 });
  room.command('a', { sequence: 0, input: { ...idleInput(), fire: true }, actions: ['swap', 'skill', 'item'] });
  room.equip('a', { classId: 'tank', primary: 'saw', secondary: 'siegius', skill: 'iron', item: 'frag' });
  expect(actor.movement.checkpoint()).toEqual(position);
  expect(actor.life).toMatchObject({ alive: true, health: 130, deaths: 2 });
  expect(actor).toMatchObject({ skillCooldown: 0, skillFrames: 0, itemCooldown: 0, itemCharges: 2, kills: 4 });
  expect(actor.kit).toMatchObject({ classId: 'tank', skill: 'iron', item: 'frag' });
  expect(actor.offhand?.id).toBe('siegius'); expect(actor.arsenal.selected).toBe('saw');
  expect(battle.grenades).toEqual([]); expect(battle.scores[0]).toBe(4);
  expect(peer.life.health).toBe(peerBefore.health); expect(peer.kit).toEqual(peerBefore.kit);
  expect(session.acknowledgements().a).toBe(0); expect(session.diagnostics('a')?.queue).toBe(0);
  session.tick(); expect(actor.skillFrames).toBe(0); expect(actor.offhand?.equipped).toBe(false); expect(actor.arsenal.shots).toBe(0);
  expect(room.command('a', { sequence: 1, input: idleInput(), actions: ['skill'] })).toBe(true);
  session.tick(); expect(actor.skillFrames).toBeGreaterThan(0);
});

it('validates every class skill and tactical item, rejects forged configurations atomically', () => {
  const room = new Room('debug', 'hijack', 'tdm', true); room.join('a', 'A'); room.session!.tick();
  for (const [classId, definition] of Object.entries(CLASSES)) for (const skill of definition.skills) {
    for (const item of Object.keys(ITEMS)) expect(validateEquipment({ classId, skill, item, primary: 'm4', secondary: 'usp' })).toMatchObject({ classId, skill, item });
  }
  const before = room.session!.checkpoint(), lobby = room.lobby();
  for (const equipment of [
    { classId: 'medic', primary: 'm4', secondary: 'katana', skill: 'heal' },
    { classId: 'tank', primary: 'm4', secondary: 'shield', skill: 'cloak' },
    { classId: 'assassin', primary: 'm4', secondary: 'knife', skill: 'constructor' },
    { classId: 'tank', primary: 'm4', secondary: 'shield', skill: 'iron', item: 'missing' },
    { classId: 'tank', primary: 'm4', secondary: 'shield', skill: 'iron', health: 999 },
  ]) {
    expect(() => room.equip('a', equipment)).toThrow();
    expect(room.session!.checkpoint()).toEqual(before); expect(room.lobby()).toEqual(lobby);
  }
  expect(() => room.equip('missing', { primary: 'm4', secondary: 'usp' })).toThrow();
});

it('retains live debug choices across death, reconnect and restoration', () => {
  const room = new Room('debug', 'hijack', 'tdm', true); room.join('a', 'A');
  room.equip('a', { classId: 'assassin', primary: 'dragunov', secondary: 'katana', skill: 'cloak', item: 'ammo' });
  const battle = room.session!.battle, actor = battle.player;
  battle.damage(actor, 9999); expect(actor.life.alive).toBe(false);
  room.equip('a', { classId: 'tank', primary: 'saw', secondary: 'blast-shield', skill: 'barrier', item: 'frag' });
  expect(actor.life.alive).toBe(true); expect(actor.life.health).toBe(130);
  room.disconnect('a'); room.reconnect('a');
  expect(room.players.get('a')!.equipment.skill).toBe('barrier');
  const restored = Battle.restore(battle.checkpoint());
  expect(restored.player.kit).toEqual(actor.kit); expect(restored.player.offhand?.id).toBe('blast-shield');
  restored.damage(restored.player, 9999); restored.player.life.respawnFrames = 0; restored.tick(idleInput());
  expect(restored.player.kit?.skill).toBe('barrier'); expect(restored.player.offhand?.id).toBe('blast-shield');
});

it('keeps ordinary match equipment immutable, even through the debug-only API', () => {
  const room = new Room('normal'); room.join('a', 'A'); room.join('b', 'B');
  room.equip('a', { classId: 'assassin', primary: 'm4', secondary: 'knife', skill: 'cloak' });
  room.ready('a', true); room.ready('b', true); room.start('a', 1);
  room.session!.tick(); const before = room.session!.checkpoint();
  expect(() => room.equip('a', { primary: 'm4', secondary: 'usp' })).toThrow();
  expect(() => room.session!.reconfigureDebugPlayer('a', { primary: 'm4', secondary: 'usp' })).toThrow();
  expect(room.session!.checkpoint()).toEqual(before);
  expect(room.session!.battle.player.kit?.skill).toBe('cloak');
  expect(SKILLS.cloak.duration).toBeGreaterThan(0);
});
