import { validateDamageContext, type DamageContext } from './DamageContext';
import type { Point } from '../../game/combat/Ballistics';
export interface ShieldState { durability: number; deployed: boolean }
/** Own-game baseline: 120-degree frontal arc; bullets absorb up to remaining
 * durability. Explosions, melee and environmental damage bypass this shield. */
export function interceptShield(state: ShieldState, center: Point, aim: Point, damage: DamageContext) {
  validateDamageContext(damage);
  if (!Number.isFinite(state.durability) || state.durability < 0
    || [center.x, center.y, aim.x, aim.y].some(n => !Number.isFinite(n))) throw Error('Invalid shield state');
  if (!state.deployed || state.durability === 0 || damage.kind !== 'bullet') return { amount: damage.amount, blocked: 0 };
  const incoming = { x: damage.origin!.x - center.x, y: damage.origin!.y - center.y };
  const facing = { x: aim.x - center.x, y: aim.y - center.y };
  const length = Math.hypot(incoming.x, incoming.y) * Math.hypot(facing.x, facing.y);
  if (!length || (incoming.x * facing.x + incoming.y * facing.y) / length < 0.5) return { amount: damage.amount, blocked: 0 };
  const blocked = Math.min(state.durability, damage.amount);
  state.durability -= blocked;
  if (!state.durability) state.deployed = false;
  return { amount: damage.amount - blocked, blocked };
}
