import { expect, it, vi } from 'vitest';
import { CombatFeedback, ammoWarning, type FeedbackActor } from '../../src/client/presentation/CombatFeedback';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';
import { AudioPresentation } from '../../src/client/audio/AudioPresentation';
import type { AudioService } from '../../src/client/audio/AudioService';

const actor = (): FeedbackActor => ({ id: 'player', team: 1, x: 0, y: 0, maxHealth: 100, weapon: 'm4', ammo: 30, reserve: 60, reload: 0,
  life: { alive: true, health: 100, respawnFrames: 0, regenDelay: 0 } });

it('uses authoritative countdown, nine-tick freeze, sixty-tick observation and resets at respawn', () => {
  const f = new CombatFeedback(), a = actor(); f.accept('round', 0, [], a);
  a.life.alive = false; a.life.respawnFrames = 150; a.deathInfo = { sourceName: '<enemy>', cause: 'M4' };
  f.accept('round', 1, [], a); expect(f.frozen).toBe(true); expect(f.seconds).toBe(5); expect(f.killer).toBe('<enemy>');
  f.cycle(); expect(f.observing).toBe(0);
  a.life.respawnFrames = 141; f.accept('round', 10, [], a); expect(f.frozen).toBe(false); expect(f.canObserve).toBe(false);
  a.life.respawnFrames = 90; f.accept('round', 61, [], a); expect(f.canObserve).toBe(true); expect(f.seconds).toBe(3);
  const ally = { ...actor(), id: 'ally' }, enemy = { ...actor(), id: 'enemy', team: 2 };
  expect(f.follow(a, [a, ally, enemy]).id).toBe('ally'); f.cycle(); expect(f.follow(a, [a, ally, enemy]).id).toBe(a.id);
  a.life.alive = true; f.accept('round', 152, [], a); expect(f.dead).toBe(false); expect(f.observing).toBe(0);
});

it('reconnect does not restart death timing and exhausted revives never promise a respawn', () => {
  const a = actor(); a.life.alive = false; a.life.respawnFrames = 50;
  const f = new CombatFeedback(); f.accept('reconnect', 1000, [], a, true);
  expect(f.frozen).toBe(false); expect(f.canObserve).toBe(true); expect(f.noRevive).toBe(true);
});

it('coalesces repeated hit feedback, expires it and leaves low health mechanics untouched', () => {
  const f = new CombatFeedback(), a = actor(); f.accept('round', 0, [], a);
  const hit = { id: 1, tick: 1, kind: 'damage' as const, targetId: a.id, direction: 180 };
  f.accept('round', 1, [hit], a); expect(f.punch).toBe(9); expect(f.flinch(a.id)).toBe(1);
  f.accept('round', 5, [hit], a); expect(f.punch).toBe(4.5);
  a.life.health = 20; a.life.regenDelay = 70;
  f.accept('round', 40, [hit], a); expect(f.punch).toBe(0); expect(f.stage).toContain('危险');
  a.life.regenDelay = 0; f.accept('round', 41, [], a); expect(f.stage).toContain('恢复');
  a.life.health = 100; f.accept('round', 42, [], a); expect(f.stage).toBe('状态正常');
});

it('warns at strictly under 25%, prioritizes zero reserve and excludes equipped melee', () => {
  const a = actor(); a.ammo = 8; expect(ammoWarning(a)).toBe(''); a.ammo = 7; expect(ammoWarning(a)).toContain('25%');
  a.weapon = 'usp'; a.ammo = 3; expect(ammoWarning(a)).toBe(''); a.ammo = 2; expect(ammoWarning(a)).toContain('LOW');
  a.reload = 12; expect(ammoWarning(a)).toBe(''); a.reserve = 0; expect(ammoWarning(a)).toContain('NO RESERVE');
  a.offhand = { kind: 'melee', equipped: true, age: -1, facing: { x: 1, y: 0 }, durability: 0, deployed: false };
  expect(ammoWarning(a)).toBe('');
});

it('preserves victim feedback for hidden shooters without revealing their coordinates or identity before death', () => {
  const b = new Battle(MISSIONS[0]), p = b.player, enemy = b.actors.find(a => a.team !== p.team)!;
  p.life.spawnProtectionFrames = 0; b.damage(p, 1, enemy);
  const message: StateMessage = { type: 'state', roomId: 'r', round: 1, actorId: p.id, mapId: 'x', mode: 'tdm', state: b.snapshot(), result: null, ack: 0, poses: [], effects: [], bursts: [], grenades: [], events: b.journal.since(0) };
  const filtered = visibleState(message, new Set([p.id]), 1, () => true);
  expect(filtered.events[0]).toMatchObject({ kind: 'damage', targetId: p.id });
  expect(filtered.events[0].actorId).toBeUndefined(); expect(filtered.events[0].position).toBeUndefined(); expect(filtered.events[0].direction! % 45).toBe(0);
  b.damage(p, 9999, enemy); const info = b.snapshot().actors.find(a => a.id === p.id)!.deathInfo;
  expect(info?.sourceName).toBe(enemy.name); expect(info?.cause).toBeTruthy();
  expect(Battle.restore(b.checkpoint()).snapshot()).toEqual(b.snapshot());
  for (let i = 0; i < 151; i++) b.tick(idleInput());
  expect(b.player.life.alive).toBe(true); expect(b.snapshot().actors.find(a => a.id === p.id)!.deathInfo).toBeUndefined();
});

it('voices only combat empty reloads and key kills with a shared fifteen-second cooldown', () => {
  const audio = { stop: vi.fn(), voice: vi.fn(() => true), weapon: vi.fn(), cue: vi.fn() };
  const p = new AudioPresentation(audio as unknown as AudioService), a = actor(); p.accept('r', 0, [], [a], a.id);
  a.reload = 30;
  p.accept('r', 1, [{ id: 1, tick: 1, kind: 'reload', actorId: a.id, weapon: 'm4', emptyMagazine: false }], [a], a.id);
  expect(audio.voice).not.toHaveBeenCalled();
  p.accept('r', 10, [{ id: 2, tick: 10, kind: 'shot', actorId: a.id, weapon: 'm4' }, { id: 3, tick: 10, kind: 'reload', actorId: a.id, weapon: 'm4', emptyMagazine: true }], [a], a.id);
  expect(audio.voice).toHaveBeenLastCalledWith('reload');
  p.accept('r', 11, [{ id: 4, tick: 11, kind: 'death', actorId: a.id, targetId: 'enemy' }], [a], a.id);
  expect(audio.voice).toHaveBeenCalledTimes(1);
  p.accept('r', 650, [{ id: 5, tick: 650, kind: 'death', actorId: a.id, targetId: 'enemy' }], [a], a.id);
  expect(audio.voice).toHaveBeenLastCalledWith('kill');
  a.reserve = 0; a.reload = 0;
  p.accept('r', 651, [{ id: 6, tick: 651, kind: 'empty', actorId: a.id }], [a], a.id);
  expect(audio.cue).toHaveBeenLastCalledWith('empty', expect.objectContaining({ rate: .55 }));
});
