import { WEAPONS, isSpecialOffhand, type SecondaryId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';
export interface EquipmentLoadout { primary: WeaponId; secondary: SecondaryId }
/** Online equipment is independent of local career ownership, training and credits. */
export function validateEquipment(value: unknown): EquipmentLoadout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid equipment');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.primary !== 'string' || typeof data.secondary !== 'string'
    || !Object.hasOwn(WEAPONS, data.primary) || WEAPONS[data.primary as WeaponId].slot !== 'primary'
    || !(isSpecialOffhand(data.secondary) || Object.hasOwn(WEAPONS, data.secondary) && WEAPONS[data.secondary as WeaponId].slot === 'secondary')) throw Error('Invalid equipment');
  return { primary: data.primary as WeaponId, secondary: data.secondary as SecondaryId };
}
