import { expect, it } from 'vitest';
import { LocalSession } from '../../src/client/session/LocalSession';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';

it('display rates do not accumulate command backlog or change simulation input', () => {
  const results = [30, 60, 144].map(hz => {
    const battle = new Battle(MISSIONS[0], 'easy', 'm4', seededRandom(4));
    const session = new LocalSession(battle);
    session.action('swap');
    for (let i = 0; i < hz; i++) session.advance(1000 / hz, () => ({ ...idleInput(), right: true }));
    expect(session.host.acknowledgements().local).toBe(29);
    expect(battle.player.arsenal.selected).toBe('usp');
    return battle.snapshot();
  });
  expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
});

it('pause discards actions queued before the next simulation tick', () => {
  const battle = new Battle(MISSIONS[0]); const session = new LocalSession(battle);
  session.action('swap'); session.advance(5, idleInput);
  session.clearInput(); session.advance(30, idleInput);
  expect(battle.player.arsenal.selected).toBe('m4');
});
