import type { Point } from '../../game/combat/Ballistics';
import type { WeaponId } from '../../game/combat/Combat';
export type DamageKind = 'bullet' | 'explosion' | 'melee' | 'environment';
/** Authority-only damage description. Never accepted from a player command. */
export interface DamageContext {
  kind: DamageKind;
  amount: number;
  sourceId?: string;
  origin?: Point;
  hitPoint?: Point;
  attackId?: string;
  reflected?: boolean;
  weapon?: WeaponId;
}
export function validateDamageContext(context: DamageContext) {
  if (!['bullet', 'explosion', 'melee', 'environment'].includes(context.kind)
    || !Number.isFinite(context.amount) || context.amount < 0
    || (context.kind !== 'environment' && (!context.sourceId || !context.origin || !context.hitPoint))
    || (context.kind === 'environment' && context.sourceId !== undefined)
    || [context.origin, context.hitPoint].some(p => p && (!Number.isFinite(p.x) || !Number.isFinite(p.y)))
    || (context.reflected !== undefined && (typeof context.reflected !== 'boolean' || context.kind !== 'bullet'))
    || (context.attackId !== undefined && (!context.attackId || context.attackId.length > 200))) throw Error('Invalid damage context');
}
