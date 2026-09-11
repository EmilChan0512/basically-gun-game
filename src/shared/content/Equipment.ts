import { WEAPONS, CLASSES, ITEMS, isSpecialOffhand, canEquipOffhand, type ClassId, type SecondaryId, type SkillId, type ItemId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';
export interface EquipmentLoadout { primary: WeaponId; secondary: SecondaryId; classId?: ClassId; skill?: SkillId; item?: ItemId }
/** Structural validation. Server account ownership is checked separately; debug rooms bypass ownership only. */
export function validateEquipment(value: unknown): EquipmentLoadout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid equipment');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['primary', 'secondary', 'classId', 'skill', 'item'].includes(key)) || typeof data.primary !== 'string' || typeof data.secondary !== 'string'
    || !Object.hasOwn(WEAPONS, data.primary) || WEAPONS[data.primary as WeaponId].slot !== 'primary'
    || !(isSpecialOffhand(data.secondary) || Object.hasOwn(WEAPONS, data.secondary) && WEAPONS[data.secondary as WeaponId].slot === 'secondary')) throw Error('Invalid equipment');
  if (data.classId !== undefined && (typeof data.classId !== 'string' || !Object.hasOwn(CLASSES, data.classId))) throw Error('Invalid class');
  const classId = (data.classId ?? 'medic') as ClassId;
  if (data.skill !== undefined && (typeof data.skill !== 'string' || !CLASSES[classId].skills.includes(data.skill as SkillId))) throw Error('技能与职业不匹配');
  if (data.item !== undefined && (typeof data.item !== 'string' || !Object.hasOwn(ITEMS, data.item))) throw Error('Invalid tactical item');
  if (isSpecialOffhand(data.secondary) && !canEquipOffhand(String(data.classId ?? 'medic'), data.secondary)) throw Error('副手与职业不匹配：刀仅限刺客，盾仅限重装兵');
  return { ...(data.classId ? { classId } : {}), ...(data.skill ? { skill: data.skill as SkillId } : {}),
    ...(data.item ? { item: data.item as ItemId } : {}), primary: data.primary as WeaponId, secondary: data.secondary as SecondaryId };
}
