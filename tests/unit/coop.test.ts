import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { Battle, idleInput } from '../../src/game/campaign/Battle';
import { WaveDirector } from '../../src/shared/simulation/WaveDirector';
import { PVE_SCENARIOS, scenarioFor, validateScenario } from '../../src/shared/content/PvEScenarios';
import { contentFingerprint } from '../../src/shared/protocol/ContentVersion';
import { coopSpawn } from '../../src/shared/simulation/CoopSpawn';
function roomFor(count: number) {
  const room = new Room('coop');
  for (let i = 0; i < count; i++) room.join(`p${i}`, `P${i}`);
  room.configure('p0', 'hijack', 'coop');
  for (let i = 0; i < count; i++) room.ready(`p${i}`, true);
  room.start('p0', 12); return room;
}
it('ends cooperative spawn protection on a real shot, retaining it while waiting or reloading', () => {
  const battle = roomFor(1).session!.battle, player = battle.player;
  battle.tickPlayers(new Map());
  expect(player.life.spawnProtectionFrames).toBe(74);
  battle.reload(player);
  battle.tickPlayers(new Map());
  expect(player.life.spawnProtectionFrames).toBe(73);
  for (let tick = 0; tick < 10 && player.life.spawnProtectionFrames > 0; tick++) {
    battle.tickPlayers(new Map([[player.id, { ...idleInput(), fire: true }]]));
  }
  expect(player.life.spawnProtectionFrames).toBe(0);
  for (let tick = 0; tick < 100; tick++) battle.tickPlayers(new Map());
  const enemy = battle.actors.find(a => a.team === 2)!;
  // Bind ordinary input to the reinforcement to isolate attack/protection rules from AI aim.
  enemy.human = true; enemy.life.spawnProtectionFrames = 60;
  battle.tickPlayers(new Map([[enemy.id, { ...idleInput(), fire: true }]]));
  expect(enemy.life.spawnProtectionFrames).toBe(0);
});
it.each([1, 4, 8])('%i-player coop clears three finite waves through authoritative deaths', count => {
  const room = roomFor(count), battle = room.session!.battle;
  expect(battle.actors).toHaveLength(count);
  expect(battle.actors.every(a => a.team === 1 && a.human)).toBe(true);
  let eliminated = 0;
  for (let tick = 0; tick < 3000 && !battle.result; tick++) {
    for (const enemy of battle.actors.filter(a => a.team === 2 && a.life.alive)) { battle.damage(enemy, 99999); eliminated++; }
    room.session!.tick();
  }
  expect(battle.result?.winner).toBe(1);
  expect(battle.snapshot().waves?.phase).toBe('won');
  expect(eliminated).toBe(count === 1 ? 18 : count === 4 ? 30 : 42);
});
it.each([1, 4, 8])('%i-player team loses after its finite revival pool is exhausted', count => {
  const room = roomFor(count), battle = room.session!.battle;
  for (let tick = 0; tick < 1000 && !battle.result; tick++) {
    for (const actor of battle.actors.filter(a => a.life.alive)) battle.damage(actor, 99999);
    room.session!.tick();
  }
  expect(battle.result?.winner).toBe(2);
  expect(battle.snapshot().waves).toMatchObject({ phase: 'lost', revives: 0, reserved: [] });
});
it('preserves wave budgets and enemy AI across checkpoint restore', () => {
  const battle = roomFor(4).session!.battle;
  for (let i = 0; i < 150; i++) battle.tickPlayers(new Map());
  expect(battle.actors.some(a => a.team === 2)).toBe(true);
  const restored = Battle.restore(JSON.parse(JSON.stringify(battle.checkpoint())));
  for (let i = 0; i < 150; i++) { battle.tickPlayers(new Map()); restored.tickPlayers(new Map()); }
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});
it('does not win on a coop player departure or reset current wave difficulty', () => {
  const room = roomFor(4); for (let i = 0; i < 100; i++) room.session!.tick();
  const remaining = room.session!.battle.snapshot().waves!.remaining;
  room.disconnect('p3'); room.expire('p3');
  expect(room.session!.battle.result).toBeNull();
  expect(room.session!.battle.snapshot().waves!.remaining).toBe(remaining);
});
it('caps live enemies separately from human seats and reserves revivals once', () => {
  const director = new WaveDirector(8), players = Array.from({ length: 8 }, (_, i) => ({ id: i ? `p${i}` : 'p', alive: true }));
  for (let tick = 0; tick < 100; tick++) expect(director.advance(players, 16)).toBe(false);
  expect(director.advance(players, 15)).toBe(true);
  director.reserveRevive('p'); director.reserveRevive('p');
  expect(director.snapshot().revives).toBe(15);
  director.revived('p'); expect(director.canRevive('p')).toBe(false);
});
it('locks tiered live caps per wave and preserves them across disconnect and restore', () => {
  const scenario = scenarioFor('hijack'); scenario.warmupTicks = 0; scenario.intermissionTicks = 0;
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, alive: true }));
  const director = new WaveDirector(4, scenario);
  expect(director.advance(players, 8)).toBe(false);
  expect(director.snapshot().activeCap).toBe(8);
  expect(director.advance(players.slice(0, 1), 7)).toBe(true);
  const restored = new WaveDirector(1); restored.restore(director.snapshot());
  expect(restored.advance(players.slice(0, 1), 7)).toBe(true);
  for (let i = 0; i < 8; i++) restored.spawned();
  restored.advance(players.slice(0, 1), 0);
  expect(restored.advance(players.slice(0, 1), 2)).toBe(false);
  expect(restored.snapshot().activeCap).toBe(2);
  const invalid = structuredClone(scenario); invalid.waves[0].activeCaps = [2, 8, 17];
  expect(() => validateScenario(invalid)).toThrow();
});
it('scenario data controls waves, caps, timers and restoration without using registry defaults', () => {
  const scenario = scenarioFor('hijack'); scenario.warmupTicks = 0; scenario.revivesPerPlayer = 0;
  scenario.waves = [{ budgets: [2, 3, 4], activeCap: 2, spawnIntervalTicks: 5 }];
  const director = new WaveDirector(4, scenario), players = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, alive: true }));
  expect(director.advance(players, 0)).toBe(true); director.spawned();
  expect(director.snapshot()).toMatchObject({ remaining: 2, cooldown: 5, revives: 0 });
  const restored = new WaveDirector(1); restored.restore(director.snapshot());
  scenario.waves[0].activeCap = 16;
  expect(restored.snapshot().scenario.waves[0].activeCap).toBe(2);
  for (let i = 0; i < 5; i++) restored.advance(players, 2);
  expect(restored.advance(players, 2)).toBe(false);
  expect(restored.advance(players, 1)).toBe(true);
  expect(PVE_SCENARIOS[0].waves).toHaveLength(3);
});
it('rejects unsupported maps and invalid content; scenario edits change the compatibility fingerprint', () => {
  expect(() => scenarioFor('signal')).toThrow('no PvE');
  const scenario = scenarioFor('hijack'); const old = contentFingerprint(scenario);
  scenario.waves[0].budgets[0]++;
  expect(contentFingerprint(scenario)).not.toBe(old);
  scenario.waves[0].activeCap = 17; expect(() => validateScenario(scenario)).toThrow();
});
it('uses validated alternate spawn points when entrances are camped without reducing safety', () => {
  const scenario = scenarioFor('hijack');
  const spawns: [{ x: number; y: number }[], { x: number; y: number }[]] = [[{ x: 100, y: 400 }], [{ x: 600, y: 400 }]];
  const actors = [{ team: 1, alive: true, position: { x: 600, y: 400 } }];
  expect(coopSpawn(spawns, actors, scenario)).toEqual(spawns[0][0]);
  actors.push({ team: 1, alive: true, position: { x: 100, y: 400 } });
  expect(coopSpawn(spawns, actors, scenario)).toBeUndefined();
  actors[1].alive = false; expect(coopSpawn(spawns, actors, scenario)).toEqual(spawns[0][0]);
});
it('blocked spawning preserves budget, survives restore and resumes when space is available', () => {
  const room = roomFor(1), battle = room.session!.battle;
  // Fixture fills all authored points with oversized exclusion radii, then
  // restores the normal radii to verify recovery without spending the budget.
  const saved = battle.checkpoint(); saved.waves!.scenario.playerSafeRadius = 1000;
  saved.waves!.scenario.actorSafeRadius = 300;
  saved.mission.spawns = [[{ x: 300, y: 400 }], [{ x: 350, y: 400 }]];
  saved.actors[0].movement.x = 300; saved.actors[0].movement.y = 400;
  saved.mission.terrain = [{ x: 0, y: 400, width: 2000, height: 100 }]; saved.mission.collisionMask = undefined;
  const blocked = Battle.restore(saved);
  for (let i = 0; i < 100; i++) blocked.tickPlayers(new Map());
  expect(blocked.snapshot().waves).toMatchObject({ spawnBlocked: true, remaining: 4, serial: 0 });
  const resumed = Battle.restore(blocked.checkpoint());
  resumed.player.movement.reset(1500, 399.5); resumed.tickPlayers(new Map());
  expect(resumed.snapshot().waves).toMatchObject({ spawnBlocked: false, remaining: 3, serial: 1 });
  expect(resumed.actors.filter(a => a.team === 2)).toHaveLength(1);
});
