import { describe, expect, it } from 'vitest';
import { Room } from '../helpers/LegacyGrowthRoom';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import { awardGrowth, growthView } from '../../src/shared/simulation/Growth';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { GROWTH_RULES, GROWTH_WEAPONS } from '../../src/shared/content/GrowthCatalog';

function setup(count = 2) {
  const room = new Room('growth-test', 'signal', 'tdm', false, 'growth');
  for (let i = 0; i < count; i++) { room.join(`p${i}`, `Pilot ${i}`); room.ready(`p${i}`, true); }
  room.start('p0', 34);
  const battle = room.session!.battle;
  return { room, battle, a: battle.player, b: battle.actors.find(a => a.team === 2)! };
}

describe('independent growth rules', () => {
  it('starts solo with one equally equipped bot that moves, shoots and selects upgrades', () => {
    const { room, battle, a, b } = setup(1);
    expect(room.players.size).toBe(1); expect(battle.actors).toHaveLength(2);
    expect(a.human).toBe(true); expect(b.human).toBe(false);
    expect(b.life.maxHealth).toBe(a.life.maxHealth);
    expect(b.arsenal.gun.weapon).toEqual(a.arsenal.gun.weapon);
    a.movement.reset(300, 599.5); b.movement.reset(500, 599.5);
    awardGrowth(b.growth!, 200, seededRandom(2), 0);
    for (let i = 0; i < 90; i++) room.session!.tick();
    expect(b.growth!.selected).toHaveLength(1); expect(b.arsenal.shots).toBeGreaterThan(0);
    expect(battle.result).toBeNull();
  });

  it('keeps solo play after spectators leave, reconnects the human, and removes bots next multiplayer round', () => {
    const { room, battle } = setup(1);
    room.join('spectator', 'Spectator'); room.disconnect('spectator'); room.expire('spectator');
    expect(battle.result).toBeNull();
    room.disconnect('p0'); room.reconnect('p0'); expect(room.session!.actorId('p0')).toBe(battle.player.id);
    room.join('p1', 'Second'); battle.endMatch(1, 'fixture'); room.returnToLobby('p0');
    room.ready('p0', true); room.ready('p1', true); room.start('p0', 2);
    expect(room.session!.battle.actors).toHaveLength(2);
    expect(room.session!.battle.actors.every(a => a.human)).toBe(true);
    room.disconnect('p1'); room.expire('p1'); expect(room.session!.battle.result?.winner).toBe(1);
  });

  it('ends a solo room when its only human expires, while classic PvP still requires two', () => {
    const { room, battle } = setup(1); room.disconnect('p0'); room.expire('p0');
    expect(battle.result).not.toBeNull();
    const classic = new Room('classic'); classic.join('a', 'A'); classic.ready('a', true);
    expect(() => classic.start('a', 1)).toThrow('Room not ready');
  });

  it('uses fixed equipment and health, rejects old equipment edits and unsupported modes', () => {
    const { room, battle, a } = setup();
    expect(a.kit).toBeNull(); expect(a.life.maxHealth).toBe(100);
    expect(a.arsenal.gun.weapon).toEqual(GROWTH_WEAPONS.m4);
    expect(a.growth?.classId).toBe('assault'); expect(battle.mission.seconds).toBe(900);
    expect(() => room.equip('p0', {})).toThrow();
    expect(() => new Room('bad', 'signal', 'coop', false, 'growth')).toThrow();
    const classic = new Room('classic'); classic.join('a', 'A'); classic.join('b', 'B');
    classic.ready('a', true); classic.ready('b', true); classic.start('a', 1);
    expect(classic.session!.battle.player.growth).toBeUndefined();
  });

  it('awards a kill once, ignores protected hits and awards recent assists', () => {
    const { battle, a, b } = setup(4), ally = battle.actors.find(x => x !== a && x.team === a.team)!;
    battle.damage(b, 1000, a); expect(a.growth!.xp).toBe(0);
    b.life.spawnProtectionFrames = 0;
    battle.damage(b, 10, ally); battle.damage(b, 1000, a); battle.damage(b, 1000, a);
    expect(a.growth!.xp).toBe(100); expect(ally.growth!.xp).toBe(60); expect(b.growth!.xp).toBe(0);
    expect(b.growth!.attackers).toEqual({});
  });

  it('rejects stale/repeated choices, queues levels and never repeats owned cards', () => {
    const { battle, a } = setup(), g = a.growth!;
    awardGrowth(g, 1200, seededRandom(1), 0);
    expect(g.level).toBe(5); expect(g.offer!.cards).toHaveLength(3);
    const first = structuredClone(g.offer!);
    expect(battle.growthChoice(a.id, first.batch, 'not-a-card')).toBe(false);
    expect(battle.growthChoice(a.id, first.batch, first.cards[0])).toBe(true);
    expect(battle.growthChoice(a.id, first.batch, first.cards[0])).toBe(false);
    while (g.offer) {
      expect(new Set(g.offer.cards).size).toBe(3);
      expect(g.offer.cards.some(id => g.selected.includes(id))).toBe(false);
      battle.growthChoice(a.id, g.offer.batch, g.offer.cards[0]);
    }
    expect(new Set(g.selected).size).toBe(4); expect(g.choices).toHaveLength(4);
    expect(battle.snapshot().actors[0].growth).not.toHaveProperty('offer');
    expect(growthView(g)).not.toHaveProperty('attackers');
  });

  it('limits refresh to once and invalidates the previous batch', () => {
    const { battle, a } = setup(), g = a.growth!;
    awardGrowth(g, 200, seededRandom(5), 0);
    const old = structuredClone(g.offer!);
    expect(battle.growthChoice(a.id, old.batch, null, true)).toBe(true);
    expect(g.rerolls).toBe(0); expect(g.offer!.batch).not.toBe(old.batch);
    expect(battle.growthChoice(a.id, old.batch, old.cards[0])).toBe(false);
    expect(battle.growthChoice(a.id, g.offer!.batch, null, true)).toBe(false);
  });

  it('posture and low-health upgrades narrow actual shot trajectories without multiplying each other', () => {
    const saved = setup().battle.checkpoint();
    const shoot = (selected: ('controlledBurst' | 'lastStand')[], low = false) => {
      const battle = Battle.restore(saved), actor = battle.player;
      actor.growth!.selected = selected; actor.life.health = low ? 20 : 100;
      const aim = { x: actor.movement.x + 500, y: actor.movement.y - 28 }; actor.aim = { ...aim };
      battle.tick({ ...idleInput(), crouch: true, fire: true, aim });
      const trace = battle.effects.find(e => e.actorId === actor.id)!.trace;
      return Math.abs(Math.atan2(trace.end.y - trace.origin.y, trace.end.x - trace.origin.x));
    };
    expect(shoot(['controlledBurst'])).toBeLessThan(shoot([]));
    expect(shoot(['lastStand'], true)).toBeLessThan(shoot([], true));
    expect(shoot(['controlledBurst', 'lastStand'], true)).toBeCloseTo(shoot(['lastStand'], true), 8);
    expect(shoot(['lastStand'])).toBeCloseTo(shoot([]), 8);
  });

  it('momentum makes a post-kill advance faster and expires without permanently changing movement', () => {
    const { battle, a, b } = setup(); a.growth!.selected.push('momentum'); b.life.spawnProtectionFrames = 0;
    battle.damage(b, 1000, a); expect(a.growth!.momentumUntil).toBe(90);
    battle.tick({ ...idleInput(), right: true }); expect(a.movement.speedScale).toBe(1.2);
    battle.frame = 89; battle.tick(idleInput()); expect(a.movement.speedScale).toBe(1);
  });

  it('retains progress through death, allows dead selection, clears temporary speed, resets next round', () => {
    const { room, battle, a } = setup();
    a.growth!.momentumUntil = 900; a.movement.speedScale = 1.2;
    awardGrowth(a.growth!, 200, seededRandom(1), 0);
    battle.damage(a, 10000);
    expect(a.growth!.momentumUntil).toBe(0); expect(a.movement.speedScale).toBe(1);
    expect(battle.growthChoice(a.id, a.growth!.offer!.batch, a.growth!.offer!.cards[0])).toBe(true);
    for (let i = 0; i < 151; i++) room.session!.tick();
    expect(a.life.alive).toBe(true); expect(a.growth!.level).toBe(2);
    expect(a.arsenal.gun.weapon).toEqual(GROWTH_WEAPONS.m4);
    battle.endMatch(1, 'fixture'); room.returnToLobby('p0');
    room.ready('p0', true); room.ready('p1', true); room.start('p0', 2);
    expect(room.session!.battle.player.growth).toMatchObject({ level: 1, xp: 0, selected: [], rerolls: 1, ultimate: false });
  });

  it('checkpoint preserves random offers, remaining refresh and temporary effects', () => {
    const { room, a } = setup(); awardGrowth(a.growth!, 800, seededRandom(2), 0);
    a.growth!.momentumUntil = 100;
    const restored = MatchSession.restore(room.session!.checkpoint());
    const offer = a.growth!.offer!;
    for (const session of [room.session!, restored]) {
      expect(session.battle.growthChoice(a.id, offer.batch, offer.cards[0])).toBe(true);
      session.tick();
    }
    expect(restored.checkpoint()).toEqual(room.session!.checkpoint());
    room.disconnect('p0'); room.reconnect('p0'); expect(room.session!.battle.player.growth!.level).toBe(4);
  });

  it('roll speeds movement, blocks shots and obeys cooldown; slide reload transfers ammo', () => {
    const { battle, a } = setup(); a.growth!.selected.push('slideReload');
    a.arsenal.gun.ammo = 10; const reserve = a.arsenal.gun.reserveAmmo;
    expect(battle.useSkill(a)).toBe(true); expect(battle.useSkill(a)).toBe(false);
    expect(a.arsenal.gun.ammo).toBe(13); expect(a.arsenal.gun.reserveAmmo).toBe(reserve - 3);
    battle.tick({ ...idleInput(), right: true, fire: true });
    expect(a.movement.speedScale).toBe(1.5); expect(a.arsenal.shots).toBe(0);
    for (let i = 0; i < 12; i++) battle.tick(idleInput());
    expect(a.movement.speedScale).toBe(1);
  });

  it('tactical reload only shortens nonempty reload; moving reload accelerates but transfers ammo normally', () => {
    const { battle, a } = setup(); a.growth!.selected.push('tacticalReload', 'quickHands');
    a.arsenal.gun.ammo = 5; battle.reload(a);
    expect(a.arsenal.gun.reloadFrames).toBe(Math.ceil(a.arsenal.gun.weapon.reloadFrames * .8));
    const total = a.arsenal.gun.ammo + a.arsenal.gun.reserveAmmo;
    for (let i = 0; i < 30; i++) battle.tick({ ...idleInput(), right: true });
    expect(a.arsenal.gun.reloadFrames).toBe(0);
    expect(a.arsenal.gun.ammo + a.arsenal.gun.reserveAmmo).toBe(total);
    a.arsenal.gun.ammo = 0; battle.reload(a);
    expect(a.arsenal.gun.reloadFrames).toBe(a.arsenal.gun.weapon.reloadFrames);
  });

  it('scavenges each corpse generation once, never exceeds reserve capacity', () => {
    const { battle, a, b } = setup(); a.growth!.selected.push('scavenger');
    b.movement.reset(a.movement.x + 30, a.movement.y); battle.damage(b, 10000);
    a.supplyReady = 9999; a.arsenal.gun.reserveAmmo = 0; battle.tick(idleInput());
    const reserve = a.arsenal.gun.reserveAmmo; expect(reserve).toBe(15);
    battle.tick(idleInput()); expect(a.arsenal.gun.reserveAmmo).toBe(reserve);
  });

  it('grants the pouch once even while dead; respawn does not refill items', () => {
    const { battle, a } = setup(); const g = a.growth!;
    awardGrowth(g, 200, seededRandom(1), 0); g.offer!.cards[0] = 'grenadePouch';
    a.itemCharges = 0; const batch = g.offer!.batch;
    expect(battle.growthChoice(a.id, batch, 'grenadePouch')).toBe(true);
    expect(battle.growthChoice(a.id, batch, 'grenadePouch')).toBe(false);
    expect(a.itemCharges).toBe(1); battle.damage(a, 10000);
    for (let i = 0; i < 151; i++) battle.tick(idleInput());
    expect(a.itemCharges).toBe(1);
  });

  it('opens ultimate at minute 12 and limits kill healing with a persistent cooldown', () => {
    const { battle, a, b } = setup(4);
    battle.frame = GROWTH_RULES.ultimateTick - 1; battle.tick(idleInput());
    expect(a.growth!.ultimate).toBe(true); a.life.health = 50;
    b.life.spawnProtectionFrames = 0; battle.damage(b, 1000, a);
    expect(a.life.health).toBe(65); expect(a.growth!.momentumUntil).toBe(battle.frame + 90);
    const enemy = battle.actors.find(x => x !== b && x.team === 2)!;
    enemy.life.spawnProtectionFrames = 0; battle.damage(enemy, 1000, a); expect(a.life.health).toBe(65);
    battle.frame = 27000 - 1; battle.tick(idleInput()); expect(battle.result).not.toBeNull();
    expect(battle.growthChoice(a.id, 1, 'momentum')).toBe(false);
  });

  it('advances eight independent growth controllers without exposing private pools', () => {
    const { room, battle } = setup(8);
    for (const actor of battle.actors) awardGrowth(actor.growth!, 200, seededRandom(actor.team), 0);
    for (let sequence = 0; sequence < 60; sequence++) {
      for (let i = 0; i < 8; i++) room.command(`p${i}`, { sequence, input: idleInput(), actions: [] });
      room.session!.tick();
    }
    expect(battle.actors.every(a => a.growth!.offer?.cards.length === 3)).toBe(true);
    expect(JSON.stringify(battle.snapshot())).not.toContain('cards');
    expect(JSON.stringify(battle.snapshot())).not.toContain('attackers');
  });
});
