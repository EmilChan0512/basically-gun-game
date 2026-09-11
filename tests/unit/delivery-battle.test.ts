import { expect, it } from 'vitest';
import { Battle } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { createMode } from '../../src/shared/simulation/ModeRules';
import { defaultLoadout } from '../../src/game/campaign/Catalog';

function fixture(goal = 3) {
  const battle = new Battle({ ...customMatch('hijack'), mode: 'ctf', goal, allies: 0, enemies: 1 });
  for (const actor of battle.actors) actor.human = true;
  return battle;
}
it('resolves simultaneous final deliveries as a draw after both team scores update', () => {
  const battle = fixture(1), bases = battle.mission.deliveryBases!;
  battle.actors.forEach(a => { const base = bases[a.team === 1 ? 1 : 0]; a.movement.reset(base.x, base.y); });
  battle.tickPlayers(new Map());
  battle.actors.forEach(a => { const base = bases[a.team - 1]; a.movement.reset(base.x, base.y); });
  battle.tickPlayers(new Map());
  expect(battle.scores).toEqual([1, 1]); expect(battle.result).toMatchObject({ draw: true, winner: null });
  expect(battle.journal.since(0).filter(e => e.kind === 'objective-delivery')).toHaveLength(2);
});
it('times out with tied scores and returns a carrier that falls below killY', () => {
  const battle = fixture(), base = battle.mission.deliveryBases![1];
  battle.player.movement.reset(base.x, base.y); battle.tickPlayers(new Map());
  battle.player.movement.reset(base.x, battle.mission.killY! + 100); battle.tickPlayers(new Map());
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBeNull();
  expect(battle.player.deliveryPreviousWeapon).toBeUndefined();
  battle.frame = battle.mission.seconds * 30 - 1; battle.tickPlayers(new Map());
  expect(battle.result).toMatchObject({ draw: true, winner: null });
});
it('clears cloak on pickup, denies cloak while carrying and permits it after release', () => {
  const battle = fixture(), actor = battle.player, base = battle.mission.deliveryBases![1];
  actor.kit = { ...defaultLoadout('assassin'), skill: 'cloak' };
  actor.skillFrames = 120; actor.movement.reset(base.x, base.y); battle.tickPlayers(new Map());
  expect(actor.skillFrames).toBe(0); expect(battle.useSkill()).toBe(false);
  battle.releaseObjective(actor.id);
  expect(battle.useSkill()).toBe(true);
});
it('releases a departing carrier before a terminal forfeit without waiting for another tick', () => {
  const battle = fixture(), actor = battle.player, base = battle.mission.deliveryBases![1];
  actor.movement.reset(base.x, base.y); battle.tickPlayers(new Map());
  battle.releaseObjective(actor.id); battle.actors = battle.actors.filter(a => a !== actor);
  battle.endMatch(2, 'Departure fixture'); battle.releaseObjective(actor.id);
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBeNull();
  expect(battle.journal.since(0).filter(e => e.kind === 'objective-return')).toHaveLength(1);
});
it('scores a delivery once and resolves a goal of one from authoritative ticks', () => {
  const battle = fixture(1), bases = battle.mission.deliveryBases!;
  battle.player.movement.reset(bases[1].x, bases[1].y); battle.tickPlayers(new Map());
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBe(battle.player.id);
  expect(battle.player.arsenal.selected).toBe('usp');
  battle.swap(); expect(battle.player.arsenal.selected).toBe('usp');
  expect(battle.scores).toEqual([0, 0]);
  battle.player.movement.reset(bases[0].x, bases[0].y); battle.tickPlayers(new Map());
  expect(battle.scores).toEqual([1, 0]); expect(battle.result?.winner).toBe(1);
  expect(battle.player.arsenal.selected).toBe('m4');
  expect(battle.player.deliveryPreviousWeapon).toBeUndefined();
  battle.tickPlayers(new Map()); expect(battle.scores).toEqual([1, 0]);
  expect(battle.journal.since(0).filter(e => e.kind === 'objective-delivery')).toHaveLength(1);
});
it('death returns the carried target without awarding a kill score', () => {
  const battle = fixture(), base = battle.mission.deliveryBases![1];
  battle.player.movement.reset(base.x, base.y); battle.tickPlayers(new Map());
  battle.player.life.spawnProtectionFrames = 0;
  battle.damage(battle.player, 10000, battle.actors[1]); battle.tickPlayers(new Map());
  expect(battle.snapshot().deliveryTargets![1].carrierId).toBeNull();
  expect(battle.scores).toEqual([0, 0]);
  expect(battle.journal.since(0).filter(e => e.kind === 'objective-return')).toHaveLength(1);
});
it('replays a delivery identically from a carrier checkpoint', () => {
  const battle = fixture(), bases = battle.mission.deliveryBases!;
  battle.player.movement.reset(bases[1].x, bases[1].y); battle.tickPlayers(new Map());
  const restored = Battle.restore(battle.checkpoint());
  for (const sim of [battle, restored]) {
    sim.player.movement.reset(bases[0].x, bases[0].y); sim.tickPlayers(new Map());
  }
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(restored.scores).toEqual([1, 0]);
});
it('routes carrier home and intercepts the enemy carrying its own target', () => {
  const battle = fixture(), bases = battle.mission.deliveryBases!, mode = createMode('ctf', bases);
  const [blue, red] = battle.actors;
  blue.movement.reset(bases[1].x, bases[1].y); mode.tick(battle);
  expect(mode.botGoal(battle, undefined, blue).destination).toEqual(bases[0]);
  expect(mode.botGoal(battle, undefined, red).destination).toBe(blue.movement);
});
