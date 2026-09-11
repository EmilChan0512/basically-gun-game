import type { Point } from '../../game/combat/Ballistics';
import type { PvEScenario } from '../content/PvEScenarios';

/** Prefer enemy entry points; fall back to the map's already validated team
 * spawn points without relaxing either safety radius or inventing coordinates. */
export function coopSpawn(spawns: [Point[], Point[]], actors: { team: number; alive: boolean; position: Point }[], scenario: PvEScenario): Point | undefined {
  return [...spawns[1], ...spawns[0]].find(point => actors.every(actor => !actor.alive
    || Math.hypot(actor.position.x - point.x, actor.position.y - point.y)
      >= (actor.team === 1 ? Math.max(scenario.playerSafeRadius, scenario.actorSafeRadius) : scenario.actorSafeRadius)));
}
