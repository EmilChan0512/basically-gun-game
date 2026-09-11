import type { Point } from '../../game/combat/Ballistics';
import { SPECIAL_OFFHANDS, type MeleeDefinition } from '../content/Offhands';
import type { DamageContext } from './DamageContext';
export interface MeleeTarget { id: string; team: 1 | 2; alive: boolean; position: Point }
export interface MeleeState { age: number; serial: number; facing: Point; hitIds: string[] }
export const KNIFE_RULES = SPECIAL_OFFHANDS.knife;
/** 30Hz swing, direction locked at start; movement can carry the swing forward. */
export class MeleeSwing {
  private state: MeleeState = { age: -1, serial: 0, facing: { x: 1, y: 0 }, hitIds: [] };
  constructor(readonly rules: MeleeDefinition = KNIFE_RULES) {}
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
    if (s.age >= this.rules.windup && s.age < this.rules.windup + this.rules.active) {
      // Bullet_Melee_Basic is a short forward trace, not an area attack. Sample
      // walls at pixel spacing so the current map's thin masks cannot be skipped.
      if (!s.hitIds.length) for (let distance = 0; distance <= this.rules.reach; distance++) {
        const point = { x: origin.x + s.facing.x * distance, y: origin.y + s.facing.y * distance };
        if (wall(point.x, point.y)) break;
        const target = targets.find(t => t.alive && t.team !== team && t.id !== sourceId
          && Math.abs(t.position.x - point.x) < 13 && Math.abs(t.position.y - point.y) < 22);
        if (!target) continue;
        s.hitIds.push(target.id);
        hits.push({ targetId: target.id, damage: { kind: 'melee', amount: this.rules.damage, sourceId,
          origin: { ...origin }, hitPoint: point, attackId: `${sourceId}:melee:${s.serial}` } });
        break;
      }
    }
    if (++s.age >= this.rules.windup + this.rules.active + this.rules.recovery) s.age = -1;
    return hits;
  }
  checkpoint() { return structuredClone(this.state); }
  restore(state: MeleeState) {
    if (!Number.isInteger(state.age) || state.age < -1 || state.age >= this.rules.windup + this.rules.active + this.rules.recovery || !Number.isSafeInteger(state.serial) || state.serial < 0
      || !Number.isFinite(state.facing.x) || !Number.isFinite(state.facing.y) || Math.abs(Math.hypot(state.facing.x, state.facing.y) - 1) > 1e-6
      || !Array.isArray(state.hitIds) || state.hitIds.some(id => typeof id !== 'string') || new Set(state.hitIds).size !== state.hitIds.length) throw Error('Invalid melee checkpoint');
    this.state = structuredClone(state);
  }
}
