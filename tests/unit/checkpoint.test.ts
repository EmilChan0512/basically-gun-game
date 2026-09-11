import { expect, it } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import { defaultLoadout } from '../../src/game/campaign/Catalog';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import { pilot } from '../helpers/campaign-pilot';

it('restores a JSON checkpoint with an airborne grenade, reload, dead actor and AI then continues exactly', () => {
  const kit = defaultLoadout(); kit.item = 'frag';
  const battle = new Battle(MISSIONS[3], 'easy', 'm4', seededRandom(123), kit);
  for (let i = 0; i < 100; i++) battle.tick(pilot(battle));
  battle.player.arsenal.gun.ammo = 2;
  battle.player.arsenal.gun.reload();
  battle.damage(battle.actors[1], 9999);
  battle.useItem({ x: 850, y: 430 });
  expect(battle.grenades).toHaveLength(1);
  expect(battle.player.arsenal.gun.reloadFrames).toBeGreaterThan(0);
  const restored = Battle.restore(JSON.parse(JSON.stringify(battle.checkpoint())));
  expect(restored.checkpoint()).toEqual(battle.checkpoint());
  expect(restored.grenades[0].source).toBe(restored.player);
  for (let i = 0; i < 250; i++) {
    const input = pilot(battle); battle.tick(input); restored.tick(input);
    expect(restored.checkpoint()).toEqual(battle.checkpoint());
  }
});

it('restores pending commands, acknowledgements and fractional tick time', () => {
  const session = new MatchSession(new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(5)));
  session.bind('a', 'player');
  session.submit('a', { sequence: 10, input: { ...idleInput(), jump: true }, actions: ['swap'] });
  session.advance(12);
  const restored = MatchSession.restore(JSON.parse(JSON.stringify(session.checkpoint())));
  for (let i = 0; i < 100; i++) { session.advance(17); restored.advance(17); }
  expect(restored.checkpoint()).toEqual(session.checkpoint());
  expect(restored.submit('a', { sequence: 10, input: idleInput(), actions: ['swap'] })).toBe(false);
});

it('eight-controller recorded input replays identically after a mid-match checkpoint', () => {
  const battle = new Battle({ ...MISSIONS[0], allies: 3, enemies: 4 }, 'easy', 'm4', seededRandom(99), null, 'replay-eight');
  const session = new MatchSession(battle);
  battle.actors.forEach((a, i) => { a.movement.reset(100 + 180 * i, 599.5); session.bind(`p${i}`, a.id); });
  let restored: MatchSession | undefined;
  for (let tick = 0; tick < 180; tick++) {
    for (let i = 0; i < 8; i++) {
      const command = { sequence: tick, input: { ...idleInput(), left: i % 2 === 0 && tick % 60 < 20, right: i % 2 !== 0 && tick % 60 < 20,
        jump: tick % 45 === i, fire: tick % 20 < 5, aim: { x: 900, y: 560 } }, actions: tick % 50 === i ? ['swap' as const] : [] };
      session.submit(`p${i}`, command); restored?.submit(`p${i}`, command);
    }
    session.tick(); restored?.tick();
    if (restored) expect(restored.checkpoint()).toEqual(session.checkpoint());
    if (tick === 70) restored = MatchSession.restore(JSON.parse(JSON.stringify(session.checkpoint())));
  }
  expect(restored!.acknowledgements()).toEqual(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`p${i}`, 179])));
});
