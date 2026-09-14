import { expect, it } from 'vitest';
import { OfflineGrowthSession } from '../../src/client/session/OfflineGrowthSession';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { idleInput } from '../../src/game/campaign/Battle';
import { offerGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

it('runs one local controller and seven bots with isolated drafts and filtered snapshots', () => {
  const draft = defaultGrowthLoadoutV3('medic'), before = structuredClone(draft);
  const local = new OfflineGrowthSession(draft, 'signal', 'short');
  expect(local.battle.actors.filter(a => a.human)).toHaveLength(1);
  expect(local.battle.actors.filter(a => a.team === 1)).toHaveLength(4);
  expect(local.battle.actors.filter(a => a.team === 2)).toHaveLength(4);
  expect(local.battle.mission.seconds).toBe(600);
  expect(local.state!.growthV3!.ultimateTick).toBe(12600);
  expect(local.state!.state.actors.map(a => a.id).sort()).toEqual([...local.battle.growthV3!.visibleActors(1)].sort());
  const b = local.battle, actor = b.player; actor.life.spawnProtectionFrames = 0;
  local.action('item'); local.input({ ...idleInput(), aim: { x: actor.movement.x + 100, y: actor.movement.y - 100 } });
  for (let i = 0; i < 10; i++) local.advance(1000 / 30);
  expect(actor.itemCharges).toBe(1); expect(draft).toEqual(before);
  expect(local.state!.growthV3!.gadget.charges).toBe(1);
  expect(local.state!.ack).toBe(0);
  expect(b.actors.filter(a => !a.human).some(a => Math.abs(a.movement.vx) > 0)).toBe(true);
  expect(() => local.authority.equipGrowth(local.playerId, defaultGrowthLoadoutV3())).toThrow();
});

it('freezes all authority clocks and clears queued input on pause and disposal', () => {
  const local = new OfflineGrowthSession(defaultGrowthLoadoutV3(), 'signal');
  local.input({ ...idleInput(), right: true, fire: true }); local.action('item'); local.setPaused(true);
  const paused = local.battle.checkpoint();
  local.advance(5000); local.input({ ...idleInput(), right: true }); local.action('skill');
  expect(local.battle.checkpoint()).toEqual(paused);
  local.setPaused(false); local.advance(1000 / 30);
  expect(local.battle.frame).toBe(1); expect(local.battle.player.itemCharges).toBe(2);
  expect(local.battle.player.movement.vx).toBe(0);
  local.dispose(); const stopped = local.battle.checkpoint(); local.advance(5000);
  expect(local.battle.checkpoint()).toEqual(stopped);
});

it('accepts only the current local growth offer and starts a new session with fresh resources', () => {
  const local = new OfflineGrowthSession(defaultGrowthLoadoutV3(), 'signal');
  const owner = local.battle.growthV3!.participant(local.state!.actorId!);
  owner.progression.xp = 200; owner.progression.level = 2;
  offerGrowthV3(owner.progression, owner.loadout, 0, () => .2);
  const offer = owner.progression.offer!;
  const choice = { type: 'growthChoice', roomId: local.room.id, round: local.room.round, batch: offer.batch, upgrade: offer.cards[0] };
  expect(local.choose({ ...choice, roomId: 'other' })).toBe(false);
  expect(local.choose(choice)).toBe(true); expect(local.choose(choice)).toBe(false);
  expect(local.state!.growthV3!.selected).toEqual([choice.upgrade]);
  const next = new OfflineGrowthSession(defaultGrowthLoadoutV3(), 'signal');
  expect(next.room.id).not.toBe(local.room.id); expect(next.state!.growthV3!.selected).toEqual([]);
  expect(next.state!.growthV3!.gadget.charges).toBe(2); expect(next.battle.frame).toBe(0);
});
