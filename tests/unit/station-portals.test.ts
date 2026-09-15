import { expect, it } from 'vitest';
import { customMatch } from '../../src/shared/content/Maps';
import { STATION_PORTALS } from '../../src/shared/content/maps/Longshot';
import { OriginalMovement } from '../../src/game/movement/OriginalMovement';
import { OriginalLife } from '../../src/game/combat/OriginalLife';
import { wallFor } from '../../src/game/campaign/Missions';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import { Prediction } from '../../src/client/session/Prediction';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import type { StateMessage } from '../../src/shared/protocol/State';
import { traceBulletLine } from '../../src/game/combat/Ballistics';

it.each(STATION_PORTALS)('$id transports to a supported unobstructed destination and cools down', portal => {
  const map = customMatch('longshot'), wall = wallFor(map), movement = new OriginalMovement(wall, map.stairTreads, map.portals);
  movement.reset(portal.entrance.x, portal.entrance.y);
  if (portal.id.endsWith('-down')) {
    movement.tick({ left: false, right: false, crouch: false });
    expect(movement.portalSerial).toBe(0); // Walking to the firing balcony must not eject the player.
  }
  movement.tick({ left: false, right: false, crouch: true });
  expect({ x: movement.x, y: movement.y }).toEqual(portal.exit);
  expect(movement.portalCooldown).toBe(90);
  expect(wall(movement.x, movement.y + 1)).toBe(true);
  expect(wall(movement.x, movement.y - 33)).toBe(false);
  for (let i = 0; i < 10; i++) movement.tick({ left: false, right: false, crouch: false });
  expect(movement.portalSerial).toBe(1);
});

it('cannot jump from the lower high ground to the cabin and can fire down from its balcony', () => {
  const map = customMatch('longshot'), wall = wallFor(map), movement = new OriginalMovement(wall, map.stairTreads);
  movement.reset(1500, 719.5); movement.jump();
  let highest = movement.y;
  for (let i = 0; i < 90; i++) { movement.tick({ left: false, right: true, crouch: false }); highest = Math.min(highest, movement.y); }
  expect(highest).toBeGreaterThan(500);
  const shot = traceBulletLine({ origin: { x: 1710, y: 317.5 }, aim: { x: 1350, y: 680 },
    rangeUnits: 250, random: () => .5, source: 'high', sourceTeam: 1,
    units: [{ id: 'low', team: 2, alive: true, position: { x: 1350, y: 719.5 } }], isOpaqueWall: p => wall(p.x,p.y) });
  expect(shot.hit).toMatchObject({ type: 'unit', target: 'low' });
  const blocked = traceBulletLine({ origin: { x: 1860, y: 318 }, aim: { x: 2240, y: 318 },
    rangeUnits: 250, random: () => .5, source: 'high', units: [], isOpaqueWall: p => wall(p.x,p.y) });
  expect(blocked.hit?.type).toBe('wall');
});

it.each([false, true])('bots from both teams contest the portal cabin (growth=%s)', growth => {
  const battle = new Battle(customMatch('longshot', 'dom'), 'normal', 'm4', seededRandom(2));
  if (growth) battle.enableGrowthV3(Object.fromEntries(battle.actors.map(a => [a.id, defaultGrowthLoadoutV3()])));
  battle.actors.forEach(a => { a.human = false; a.life = new OriginalLife(10000); });
  const arrivals = new Set<number>();
  for (let i = 0; i < 900 && arrivals.size < 2; i++) {
    battle.tickPlayers(new Map());
    for (const a of battle.actors) if (a.movement.portalSerial > 0 && a.movement.y < 400) arrivals.add(a.team);
  }
  expect([...arrivals].sort()).toEqual([1, 2]);
});

it('predicts portal transport without interpolation across the map and replays acknowledgements', () => {
  const battle = new Battle(customMatch('longshot'), 'normal', 'm4', seededRandom(1));
  battle.actors.forEach(a => { a.human = true; });
  battle.player.movement.reset(2365, 959.5);
  const host = new MatchSession(battle); host.bind('p', 'player');
  const packet = (): StateMessage => ({ type: 'state', roomId: 'portal', round: 1, actorId: 'player', mapId: 'longshot', mode: 'tdm',
    state: battle.snapshot(), result: null, ack: host.acknowledgements().p, movement: battle.player.movement.checkpoint(),
    jumpHeld: host.jumpHeld('p'), poses: [], effects: [], bursts: [], grenades: [], events: [] });
  const prediction = new Prediction(); prediction.accept(packet());
  for (let sequence = 0; sequence < 15; sequence++) {
    const command = { sequence, input: { ...idleInput(), right: true, crouch: true }, actions: [] };
    const serial = prediction.movement!.portalSerial;
    prediction.input(sequence, command.input);
    if (prediction.movement!.portalSerial !== serial) expect(prediction.position(.1, 0)).toEqual({ x: 2400, y: 359.5 });
    host.submit('p', command); host.tick();
    if (sequence === 5 || sequence === 14) prediction.accept(packet());
  }
  expect(prediction.movement!.portalSerial).toBe(1);
  expect(prediction.movement!.checkpoint()).toEqual(battle.player.movement.checkpoint());
  const restored = Battle.restore(battle.checkpoint());
  battle.tickPlayers(new Map()); restored.tickPlayers(new Map());
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
});

it('has one central ascent and no transport at the former side entrances', () => {
  const map = customMatch('longshot');
  expect(STATION_PORTALS.filter(p => p.id.endsWith('-up'))).toEqual([
    { id: 'center-up', entrance: { x: 2400, y: 959.5 }, exit: { x: 2400, y: 359.5 }, requiresCrouch: true },
  ]);
  for (const x of [1740, 3060]) {
    const movement = new OriginalMovement(wallFor(map), map.stairTreads, map.portals);
    movement.reset(x, 959.5);
    movement.tick({ left: false, right: false, crouch: true });
    expect(movement.portalSerial).toBe(0);
  }
});
