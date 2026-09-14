export interface VisionCircle { id: string; x: number; y: number; radius: number }
interface BeaconView extends VisionCircle {
  team: 1 | 2; gadgetId: string; armed: boolean; stopped: boolean; health: number; expiresTick: number;
}
/** Area reconnaissance deliberately ignores walls and smoke. */
export function beaconCircles(entities: readonly BeaconView[], team: 1 | 2, tick: number): VisionCircle[] {
  return entities.filter(e => e.team === team && e.gadgetId === 'sn_beacon' && e.armed && !e.stopped && e.health > 0 && tick < e.expiresTick)
    .map(e => ({ id: e.id, x: e.x, y: e.y, radius: e.radius }));
}
export function inBeaconVision(point: { x: number; y: number }, circles: readonly VisionCircle[]) {
  return circles.some(c => Math.hypot(point.x-c.x, point.y-c.y) <= c.radius);
}
