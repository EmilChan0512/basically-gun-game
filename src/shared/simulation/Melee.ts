import type { Point } from '../../game/combat/Ballistics';
import type { DamageContext } from './DamageContext';
export interface MeleeTarget { id: string; team: 1 | 2; alive: boolean; position: Point }
export interface MeleeState { age: number; serial: number; facing: Point; hitIds: string[] }
export const KNIFE_RULES = { windup: 4, active: 3, recovery: 12, reach: 64, damage: 40, minDot: 0.5 } as const;
/** 30Hz swing, direction locked at start; movement can carry the swing forward. */
export class MeleeSwing {
  private state: MeleeState = { age: -1, serial: 0, facing: { x: 1, y: 0 }, hitIds: [] };
  get busy() { return this.state.age >= 0; }
  start(origin: Point, aim: Point) {
    if (this.busy) return false;
    const x = aim.x - origin.x, y = aim.y - origin.y, length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length === 0) return false;
    this.state = { age: 0, serial: this.state.serial + 1, facing: { x: x / length, y: y / length }, hitIds: [] };
    return true;
  }
  tick(sourceId: string, team: 1 | 2, origin: Point, targets: readonly MeleeTarget[], wall: (x: number, y: number) => boolean) {
    const hits: { targetId: string; damage: DamageContext }[] = [], s = this.state;
    if (!this.busy) return hits;
    if (s.age >= KNIFE_RULES.windup && s.age < KNIFE_RULES.windup + KNIFE_RULES.active) {
      for (const target of targets) {
        if (!target.alive || target.team === team || target.id === sourceId || s.hitIds.includes(target.id)) continue;
        const dx = target.position.x - origin.x, dy = target.position.y - origin.y, distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance > KNIFE_RULES.reach) continue;
        if (distance > 0 && (dx * s.facing.x + dy * s.facing.y) / distance < KNIFE_RULES.minDot) continue;
        // Pixel-spaced samples retain thin mask walls that coarse sight rays can skip.
        const steps = Math.max(1, Math.ceil(distance)); let blocked = false;
        for (let i = 0; i <= steps; i++) if (wall(origin.x + dx * i / steps, origin.y + dy * i / steps)) { blocked = true; break; }
        if (blocked) continue;
        s.hitIds.push(target.id);
        hits.push({ targetId: target.id, damage: { kind: 'melee', amount: KNIFE_RULES.damage, sourceId,
          origin: { ...origin }, hitPoint: { ...target.position }, attackId: `${sourceId}:melee:${s.serial}` } });
      }
    }
    if (++s.age >= KNIFE_RULES.windup + KNIFE_RULES.active + KNIFE_RULES.recovery) s.age = -1;
    return hits;
  }
  checkpoint() { return structuredClone(this.state); }
  restore(state: MeleeState) {
    if (!Number.isInteger(state.age) || state.age < -1 || state.age >= KNIFE_RULES.windup + KNIFE_RULES.active + KNIFE_RULES.recovery || !Number.isSafeInteger(state.serial) || state.serial < 0
      || !Number.isFinite(state.facing.x) || !Number.isFinite(state.facing.y) || Math.abs(Math.hypot(state.facing.x, state.facing.y) - 1) > 1e-6
      || !Array.isArray(state.hitIds) || state.hitIds.some(id => typeof id !== 'string') || new Set(state.hitIds).size !== state.hitIds.length) throw Error('Invalid melee checkpoint');
    this.state = structuredClone(state);
  }
}
