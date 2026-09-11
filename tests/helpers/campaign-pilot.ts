import type { Battle, BattleInput } from '../../src/game/campaign/Battle';
import { clearSight, nextWaypoint } from '../../src/game/campaign/Navigation';

/** A test player: only ordinary input and legal weapon actions, never score/HP/position writes. */
export function pilot(b: Battle): BattleInput {
  const p = b.player.movement;
  const enemies = b.actors.filter(a => a.team === 2 && a.life.alive).sort((a, c) => Math.abs(a.movement.x - p.x) - Math.abs(c.movement.x - p.x));
  const visible = enemies.find(a => clearSight({ x: p.x, y: p.y - 42 }, { x: a.movement.x, y: a.movement.y - (a.movement.crouching ? 20 : 33) }, b.wall));
  const target = visible ?? enemies[0];
  const destination = b.mission.mode === 'dom' ? b.mission.objective : target?.movement ?? b.mission.objective;
  const next = nextWaypoint(b.mission.navigation, p, destination);
  const stop = b.mission.mode === 'dom' ? Math.abs(p.x - destination.x) < 30 && Math.abs(p.y - destination.y) < 70 : !!visible && Math.abs(visible.movement.x - p.x) < 280;
  const dx = next.x - p.x;
  const jump = !stop && (b.wall(p.x + Math.sign(dx) * 48, p.y - 20) || next.y < p.y - 35 && Math.abs(dx) < 260);
  if (!b.player.arsenal.gun.ammo && !b.player.arsenal.gun.reserveAmmo) b.swap();
  return { left: !stop && dx < -8, right: !stop && dx > 8, crouch: stop && !p.jumping, jump: jump && b.frame % 2 === 0,
    fire: b.player.life.alive && !!visible && (b.player.arsenal.selected === 'm4' || b.frame % 10 === 0),
    aim: target ? { x: target.movement.x, y: target.movement.y - (target.movement.crouching ? 20 : 38) } : { x: p.x + 200, y: p.y - 42 } };
}
