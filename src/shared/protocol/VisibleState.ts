import type { StateMessage } from './State';
import { clearSight } from '../../game/campaign/Navigation';
import { VISION_RADIUS, VISION_EYE_HEIGHT } from '../simulation/Vision';
/** Filter every coordinate-bearing channel, not only radar actor markers. */
export function visibleState(message: StateMessage, visible: ReadonlySet<string>, team: 1 | 2, wall: (x: number, y: number) => boolean): StateMessage {
  const observers = message.state.actors.filter(a => a.team === team && a.life.alive);
  const pointVisible = (p: { x: number; y: number }) => observers.some(a => Math.hypot(p.x - a.x, p.y - a.y) <= VISION_RADIUS
    && clearSight({ x: a.x, y: a.y - VISION_EYE_HEIGHT }, p, wall));
  const hitVisible = (hit: StateMessage['effects'][number]['trace']['hit']) => !hit || hit.type === 'wall' || visible.has(hit.target);
  return { ...message,
    state: { ...message.state, actors: message.state.actors.filter(a => visible.has(a.id)) },
    poses: message.poses.filter(p => visible.has(p.id)),
    effects: message.effects.filter(e => !!e.actorId && visible.has(e.actorId) && hitVisible(e.trace.hit) && hitVisible(e.trace.initialHit)),
    bursts: message.bursts.filter(pointVisible), grenades: message.grenades.filter(pointVisible),
    events: message.events.filter(e => e.kind.startsWith('objective-') || e.kind === 'result'
      || (!e.actorId || visible.has(e.actorId)) && (!e.targetId || visible.has(e.targetId))),
  };
}
