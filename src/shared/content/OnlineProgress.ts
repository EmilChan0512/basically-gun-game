import { STARTER_WEAPONS, CLASSES, ITEMS, SKILLS, WEAPONS, SPECIAL_OFFHANDS, isSpecialOffhand, defaultLoadout, levelForXp, type ClassId, type ItemId } from '../../game/campaign/Catalog';
import type { WeaponId } from '../../game/combat/Combat';
import { validateEquipment, type EquipmentLoadout } from './Equipment';

export interface OnlineProfile {
  id: string; name: string; credits: number;
  selected: ClassId; weapons: WeaponId[]; items: ItemId[];
  classes: Record<ClassId, { xp: number; equipment: Required<EquipmentLoadout> }>;
  matches: number; wins: number;
}
export function starterEquipment(classId: ClassId = 'medic'): Required<EquipmentLoadout> {
  const { primary, secondary, skill, item } = defaultLoadout(classId);
  return { classId, primary, secondary, skill, item };
}
export function freshOnlineProfile(id: string, name: string): OnlineProfile {
  return { id, name, credits: 350, selected: 'medic', weapons: [...STARTER_WEAPONS], items: ['medkit'], matches: 0, wins: 0,
    classes: Object.fromEntries(Object.keys(CLASSES).map(id => [id, { xp: 0, equipment: starterEquipment(id as ClassId) }])) as OnlineProfile['classes'] };
}
/** Also used by the server: a browser cannot grant itself ownership or levels. */
export function ownedEquipment(profile: OnlineProfile, value: unknown): Required<EquipmentLoadout> {
  const parsed = validateEquipment(value), classId = parsed.classId ?? 'medic';
  const equipment = { ...starterEquipment(classId), ...parsed };
  const level = levelForXp(profile.classes[classId].xp);
  for (const id of [equipment.primary, equipment.secondary]) {
    if (isSpecialOffhand(id)) {
      if (SPECIAL_OFFHANDS[id].level > level) throw Error('该副手尚未达到解锁等级');
    } else if (!profile.weapons.includes(id) || WEAPONS[id].level > level) throw Error('武器尚未购买或职业等级不足');
  }
  if (SKILLS[equipment.skill].level > level) throw Error('技能尚未达到解锁等级');
  if (!profile.items.includes(equipment.item) || ITEMS[equipment.item].level > level) throw Error('道具尚未购买或职业等级不足');
  return equipment;
}
