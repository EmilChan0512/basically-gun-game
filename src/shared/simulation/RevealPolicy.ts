import type { SimulationEvent } from './Events';
import { clearSight } from '../../game/campaign/Navigation';
import { VISION_RADIUS, VISION_EYE_HEIGHT } from './Vision';
export interface RevealActor {
  id: string; team: 1 | 2; movement: { x: number; y: number };
  life: { alive: boolean }; kit: { skill: string } | null; skillFrames: number;
}
/** Per-match presentation policy. No client-provided reveal or firing timestamps. */
export class RevealPolicy {
  private lastShots = new Map<string, number>();
  private cursor = 0;
  visible(actors: readonly RevealActor[], frame: number, events: readonly SimulationEvent[],
    wall: (x: number, y: number) => boolean, team: 1 | 2, publicCarriers: ReadonlySet<string> = new Set()) {
    for (const event of events) if (event.id > this.cursor) {
      this.cursor = event.id;
      if (event.kind === 'shot' && event.actorId) this.lastShots.set(event.actorId, event.tick);
    }
    const ids = new Set(actors.map(a => a.id));
    for (const [id, tick] of this.lastShots) if (!ids.has(id) || frame - tick >= 60) this.lastShots.delete(id);
    const observers = actors.filter(a => a.team === team && a.life.alive);
    return new Set(actors.filter(target => {
      if (target.team === team || publicCarriers.has(target.id)) return true;
      if (target.kit?.skill === 'cloak' && target.skillFrames > 0) return false;
      const shot = this.lastShots.get(target.id);
      if (shot !== undefined && frame >= shot && frame - shot < 60) return true;
      return observers.some(observer => Math.hypot(target.movement.x - observer.movement.x, target.movement.y - observer.movement.y) <= VISION_RADIUS
        && clearSight({ x: observer.movement.x, y: observer.movement.y - VISION_EYE_HEIGHT },
          { x: target.movement.x, y: target.movement.y - 33 }, wall));
    }).map(a => a.id));
  }
}
