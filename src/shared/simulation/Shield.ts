import { validateDamageContext, type DamageContext } from './DamageContext';
import type { Point, RandomSource } from '../../game/combat/Ballistics';
import { SPECIAL_OFFHANDS, type ShieldDefinition } from '../content/Offhands';
/** durability is retained only for older internal checkpoints; SFH1 shields do not break. */
export interface ShieldState { durability: number; deployed: boolean }
export const SHIELD_HALF_ARC = 80 * Math.PI / 180;
/** Aim-relative 160-degree coverage, wrapping continuously through +/-180 degrees.
 * Source mechanics: Bullet.doHitEffect / Status damage reduction. */
export function interceptShield(state: ShieldState, center: Point, aim: Point, damage: DamageContext,
  rules: ShieldDefinition = SPECIAL_OFFHANDS.shield, random: RandomSource = () => 1) {
  validateDamageContext(damage);
  if (!Number.isFinite(state.durability) || state.durability < 0
    || [center.x, center.y, aim.x, aim.y].some(n => !Number.isFinite(n))) throw Error('Invalid shield state');
  const bypass = { amount: damage.amount, blocked: 0, reflected: false };
  if (!state.deployed || damage.kind === 'environment' || damage.amount === 0) return bypass;
  const incoming = { x: damage.origin!.x - center.x, y: damage.origin!.y - center.y };
  const facing = { x: aim.x - center.x, y: aim.y - center.y };
  const length = Math.hypot(incoming.x, incoming.y) * Math.hypot(facing.x, facing.y);
  if (!length || (incoming.x * facing.x + incoming.y * facing.y) / length <= Math.cos(SHIELD_HALF_ARC)) return bypass;
  const reflected = damage.kind === 'bullet' && !damage.reflected && rules.reflect > 0 && random() < rules.reflect;
  const amount = reflected ? 0 : damage.amount * (1 - rules.reduction) * (damage.kind === 'explosion' ? rules.explosionMultiplier : 1);
  return { amount, blocked: damage.amount - amount, reflected };
}
