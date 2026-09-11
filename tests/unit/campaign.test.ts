import { describe, expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { CampaignProgress, SAVE_KEY } from '../../src/game/campaign/Progress';
import { Arsenal } from '../../src/game/campaign/Arsenal';
import { pilot } from '../helpers/campaign-pilot';
import { clearSight, nextWaypoint } from '../../src/game/campaign/Navigation';

describe('campaign progression and local saves', () => {
  it('only unlocks a mission after winning its predecessor and preserves progress on reload', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const progress = new CampaignProgress(storage);
    expect(progress.canPlay(1)).toBe(false);
    expect(() => progress.complete(2, 3)).toThrow('locked');
    for (let i = 0; i < MISSIONS.length; i++) { expect(progress.canPlay(i)).toBe(true); progress.complete(i, 2); }
    progress.complete(0, 1);
    const loaded = new CampaignProgress(storage);
    expect(loaded.finished).toBe(true);
    expect(loaded.data.best.signal).toBe(2);
    expect(loaded.data.completed).toHaveLength(4);
  });
  it('handles corrupt, unsupported, blocked and partially malformed saves without blocking play', () => {
    for (const value of ['broken', 'null', '{"version":9}', '{"version":1,"completed":["uplink"],"best":null}']) {
      const progress = new CampaignProgress({ getItem: () => value, setItem: () => { throw Error('denied'); } });
      expect(progress.unlocked).toBe(0); progress.complete(0, 1); expect(progress.unlocked).toBe(1); expect(progress.storageAvailable).toBe(false);
    }
    const noStorage = new CampaignProgress(); noStorage.complete(0, 1); expect(noStorage.canPlay(1)).toBe(true);
    expect(SAVE_KEY).toContain('v1');
  });
});

describe('team rules, lifecycle and objectives', () => {
  it('rejects friendly fire and spawn damage, attributes kills once, and freezes a completed match', () => {
    const b = new Battle({ ...MISSIONS[1], goal: 1 }, 'normal', 'm4', seededRandom(1));
    const enemy = b.actors.find(a => a.team === 2)!;
    expect(b.damage(b.actors[1], 100, b.player)).toBe(false);
    expect(b.actors[1].life.health).toBe(85);
    expect(b.damage(enemy, 100, b.player)).toBe(false);
    enemy.life.spawnProtectionFrames = 0;
    expect(b.damage(enemy, 100, b.player)).toBe(true);
    expect(b.damage(enemy, 100, b.player)).toBe(false);
    b.tick(idleInput()); expect(b.phase).toBe('won'); expect(b.scores).toEqual([1, 0]); expect(b.player.kills).toBe(1);
    const state = b.snapshot(); b.advance(10000, pilot(b)); b.damage(b.player, 999); expect(b.snapshot()).toEqual(state);
  });
  it('respawns on update 151 with protection and ammunition and suppresses held fire until release', () => {
    const b = new Battle(MISSIONS[0], 'easy', 'usp', seededRandom(8)); b.damage(b.player, 999);
    const held = { ...idleInput(), fire: true };
    for (let i = 0; i < 150; i++) b.tick(held);
    expect(b.player.life.alive).toBe(false); b.tick(held);
    expect(b.player.life.alive).toBe(true); expect(b.player.life.spawnProtectionFrames).toBe(75);
    for (let i = 0; i < 10; i++) b.tick(held);
    expect(b.player.arsenal.gun.ammo).toBe(12);
    b.tick(idleInput()); b.tick(held); expect(b.player.arsenal.gun.ammo).toBe(11);
  });
  it('scores only uncontested occupation, not kills, and timeout ties fail the mission', () => {
    const b = new Battle(MISSIONS[2], 'easy', 'm4', seededRandom(3));
    // Isolate the objective rule from aiming and navigation, with declared fixture positions.
    for (const a of b.actors.slice(1)) { a.life.alive = false; a.life.respawnFrames = 10000; }
    b.player.movement.reset(900, 599.5);
    for (let i = 0; i < 30; i++) b.tick(idleInput());
    expect(b.scores).toEqual([1, 0]); expect(b.objective).toBe('blue');
    const enemy = b.actors.find(a => a.team === 2)!; enemy.life.alive = true; enemy.movement.reset(925, 599.5);
    for (let i = 0; i < 30; i++) b.tick(idleInput());
    expect(b.objective).toBe('contested'); expect(b.scores).toEqual([1, 0]);
    enemy.life.spawnProtectionFrames = 0; b.damage(enemy, 999, b.player); expect(b.scores).toEqual([1, 0]);
    const tie = new Battle({ ...MISSIONS[0], seconds: 1 });
    for (let i = 0; i < 30; i++) tie.tick(idleInput());
    expect(tie.phase).toBe('lost'); expect(tie.reason).toContain('平局');
  });
  it('is deterministic across display scheduling at 15/30/60/120Hz', () => {
    const states = [15, 30, 60, 120].map(hz => {
      const b = new Battle(MISSIONS[1], 'normal', 'm4', seededRandom(22));
      for (let i = 0; i < hz * 10; i++) b.advance(1000 / hz, { ...idleInput(), right: true, fire: true });
      return b.snapshot();
    });
    for (const state of states.slice(1)) expect(state).toEqual(states[0]);
  });
  it('bots traverse high platforms, attack and defeat an idle player without position shortcuts', () => {
    const b = new Battle(MISSIONS[1], 'normal', 'm4', seededRandom(42));
    let reachedTop = false, airborne = false;
    for (let i = 0; i < 2500 && b.phase === 'running'; i++) {
      b.tick(idleInput());
      reachedTop ||= b.actors.slice(1).some(a => a.movement.x > 730 && a.movement.x < 1070 && a.movement.y < 501);
      airborne ||= b.actors.slice(1).some(a => a.movement.jumping);
    }
    expect(reachedTop).toBe(true); expect(airborne).toBe(true); expect(b.phase).toBe('lost'); expect(b.player.life.deaths).toBeGreaterThan(0);
  });
  it('uses finite independent ammo, shared cooldown, cancelled reloads and reserve-only resupply', () => {
    const guns = new Arsenal();
    guns.gun.ammo = 10; expect(guns.gun.reload()).toBe(true); guns.swap(); guns.swap();
    expect(guns.gun.reloadFrames).toBe(0); expect(guns.gun.ammo).toBe(10);
    guns.gun.reserveAmmo = 0; guns.resupply(); expect(guns.gun.reserveAmmo).toBe(78); expect(guns.gun.ammo).toBe(10);
    guns.setTrigger(true); guns.tick('p', 1, { x: 0, y: 0 }, { x: 500, y: 0 }, { crouching: false, airborne: false, moving: false, aimStat: 1 }, [], () => false, () => 0.5);
    expect(guns.gun.ammo).toBe(9); const cooldown = guns.gun.cooldownFrames; guns.swap(); expect(guns.gun.cooldownFrames).toBe(cooldown);
  });
  it('navigation respects authored connectivity and sight is blocked by terrain', () => {
    const b = new Battle(MISSIONS[1]);
    expect(clearSight({ x: 600, y: 560 }, { x: 1200, y: 560 }, b.wall)).toBe(false);
    expect(clearSight({ x: 600, y: 400 }, { x: 1200, y: 400 }, b.wall)).toBe(true);
    const m = MISSIONS[1]; expect(nextWaypoint(m.navigation, m.spawns[0][0], m.spawns[1][0])).toEqual(m.navigation[1]);
  });
  it('an exhausted bot navigates back to its supply box and resumes with finite ammo', () => {
    const b = new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(5));
    const enemy = b.actors[1]; enemy.movement.reset(900, 599.5);
    enemy.arsenal.gun.ammo = enemy.arsenal.gun.reserveAmmo = 0; enemy.arsenal.swap();
    enemy.arsenal.gun.ammo = enemy.arsenal.gun.reserveAmmo = 0;
    b.tick(idleInput()); expect(enemy.brain.state).toBe('resupply');
    for (let i = 0; i < 250 && enemy.arsenal.empty; i++) b.tick(idleInput());
    expect(enemy.movement.x).toBeGreaterThan(1500); expect(enemy.arsenal.empty).toBe(false);
    expect(enemy.arsenal.gun.reserveAmmo).toBeGreaterThan(0);
  });
});

describe('complete playable short campaign using ordinary input', () => {
  for (const difficulty of ['easy', 'normal'] as const) {
    for (const mission of MISSIONS) {
      it(`${difficulty}: can win ${mission.id} without editing score, health, positions or AI`, () => {
        const b = new Battle(mission, difficulty, 'm4', seededRandom(42));
        while (b.phase === 'running') b.tick(pilot(b));
        expect(b.phase, JSON.stringify(b.snapshot())).toBe('won');
        expect(b.player.kills).toBeGreaterThan(0);
        expect(b.scores[0]).toBeGreaterThanOrEqual(mission.goal);
      });
    }
  }
});
