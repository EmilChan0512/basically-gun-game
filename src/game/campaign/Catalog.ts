import sourceWeapons from '../../shared/content/weapon-catalog.json' with { type: 'json' };
import type { WeaponConfig, WeaponId } from '../combat/Combat';

export type ClassId = 'medic' | 'assassin' | 'commando' | 'tank';
export type SkillId = 'heal' | 'regenerate' | 'focus' | 'cloak' | 'stealth' | 'supply' | 'overdrive' | 'barrier' | 'iron';
export type ItemId = 'medkit' | 'frag' | 'ammo';
export interface ClassDefinition { name: string; health: number; aim: number; ammo: number; passive: string; skills: SkillId[]; color: number }
/** Class roles reference Stats_Classes/Stats_Skills; balance and active abilities are our own. */
export const CLASSES: Record<ClassId, ClassDefinition> = {
  medic: { name: '医疗兵', health: 85, aim: 0.7, ammo: 0.9, passive: '战地护理：受伤后2秒开始回血', skills: ['heal', 'regenerate'], color: 0x81d7ac },
  assassin: { name: '刺客', health: 70, aim: 0.95, ammo: 0.75, passive: '要害瞄准：头部伤害额外提高25%', skills: ['focus', 'cloak', 'stealth'], color: 0xc1a4f0 },
  commando: { name: '突击兵', health: 100, aim: 0.6, ammo: 1.3, passive: '弹药专精：携带更多备用弹药', skills: ['supply', 'overdrive'], color: 0xf0c57a },
  tank: { name: '重装兵', health: 130, aim: 0.55, ammo: 1, passive: '防爆装甲：爆炸伤害降低30%', skills: ['barrier', 'iron'], color: 0x9cbdde },
};
export const SKILLS: Record<SkillId, { name: string; description: string; cooldown: number; duration: number; level: number; passive?: boolean }> = {
  stealth: { name: '隐匿', description: '被动：站定5秒后隐形，蹲行保持；站立移动、跳跃、射击、近战或换弹解除。仍可被击中，携带目标物时失效', cooldown: 0, duration: 0, level: 1, passive: true },
  heal: { name: '战地急救', description: '恢复自己及180px内队友40生命', cooldown: 600, duration: 0, level: 1 },
  regenerate: { name: '再生组织', description: '6秒内每秒恢复10生命', cooldown: 750, duration: 180, level: 2 },
  focus: { name: '精准专注', description: '5秒内散布缩小75%', cooldown: 540, duration: 150, level: 1 },
  cloak: { name: '暗影隐匿', description: '4秒内敌人无法锁定你；开火或受伤解除', cooldown: 660, duration: 120, level: 2 },
  supply: { name: '弹药补给', description: '补满自己及180px内队友的备用弹药', cooldown: 660, duration: 0, level: 1 },
  overdrive: { name: '火力压制', description: '5秒内武器伤害提高20%', cooldown: 750, duration: 150, level: 2 },
  barrier: { name: '装甲屏障', description: '4秒内受到的伤害降低50%', cooldown: 750, duration: 120, level: 1 },
  iron: { name: '钢铁意志', description: '6秒内抵挡下一次攻击的80%伤害', cooldown: 450, duration: 180, level: 2 },
};
export interface ProjectileDefinition { kind: 'rocket' | 'bounce' | 'homing'; steps: number; gravity: number; radius: number; splashMultiplier: number; fuse: number; seekRadius: number; turn: number }
export interface CatalogWeapon { config: Readonly<WeaponConfig>; source: string; classId: ClassId | 'shared'; name: string; description: string; price: number; level: number; slot: 'primary' | 'secondary'; pellets: number; spread: number; length: number; grip: string; reloadGrip: string; fireGrip: string; artFrameId: number; projectile?: ProjectileDefinition; artFrame?: readonly [number, number, number, number] }
/** Stats_Guns class pools and level requirements. Knife/shield use secondary slots by design. */
export const WEAPONS = sourceWeapons as Record<WeaponId, CatalogWeapon>;
export const MAX_LEVEL = 50;
export const MAX_XP = (MAX_LEVEL - 1) * 160;
export const STARTER_WEAPONS: WeaponId[] = ['m4', 'scout', 'saw', 'shotgun', 'usp'];
export function canEquipWeapon(classId: ClassId, id: WeaponId) { return WEAPONS[id]?.classId === 'shared' || WEAPONS[id]?.classId === classId; }
export const CLASS_STARTERS: Record<ClassId, WeaponId> = { medic: 'm4', assassin: 'scout', commando: 'saw', tank: 'shotgun' };
export const ITEMS: Record<ItemId, { name: string; description: string; price: number; level: number; charges: number }> = {
  medkit: { name: '急救包', description: '恢复自己40生命，每次出战2份', price: 0, level: 1, charges: 2 },
  ammo: { name: '弹药包', description: '补满备用弹药，每次出战2份', price: 120, level: 1, charges: 2 },
  frag: { name: '破片手雷', description: '朝准星投掷，延时爆炸；每次出战2枚', price: 180, level: 2, charges: 2 },
};
export interface Training { vitality: number; handling: number }
export { SPECIAL_OFFHANDS, isSpecialOffhand, canEquipOffhand } from '../../shared/content/Offhands';
import type { SpecialOffhandId } from '../../shared/content/Offhands';
export type { SpecialOffhandId };
export type SecondaryId = WeaponId | SpecialOffhandId;
export interface Loadout { classId: ClassId; primary: WeaponId; secondary: SecondaryId; skill: SkillId; item: ItemId; training: Training; level: number }
export const defaultLoadout = (classId: ClassId = 'medic'): Loadout => ({ classId, primary: CLASS_STARTERS[classId], secondary: 'usp', skill: CLASSES[classId].skills[0], item: 'medkit', training: { vitality: 0, handling: 0 }, level: 1 });
export function levelForXp(xp: number) { return Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, xp) / 160)); }
export function loadoutStats(loadout: Loadout) {
  const c = CLASSES[loadout.classId];
  return { health: c.health + loadout.training.vitality * 8, aim: c.aim + loadout.training.handling * 0.1, ammo: c.ammo };
}
