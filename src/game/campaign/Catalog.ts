import { M4, USP, type WeaponConfig, type WeaponId } from '../combat/Combat';

export type ClassId = 'medic' | 'assassin' | 'commando' | 'tank';
export type SkillId = 'heal' | 'regenerate' | 'focus' | 'cloak' | 'supply' | 'overdrive' | 'barrier' | 'iron';
export type ItemId = 'medkit' | 'frag' | 'ammo';
export interface ClassDefinition { name: string; health: number; aim: number; ammo: number; passive: string; skills: [SkillId, SkillId]; color: number }
/** Class roles reference Stats_Classes/Stats_Skills; balance and active abilities are our own. */
export const CLASSES: Record<ClassId, ClassDefinition> = {
  medic: { name: '医疗兵', health: 85, aim: 0.7, ammo: 0.9, passive: '战地护理：受伤后2秒开始回血', skills: ['heal', 'regenerate'], color: 0x81d7ac },
  assassin: { name: '刺客', health: 70, aim: 0.95, ammo: 0.75, passive: '要害瞄准：头部伤害额外提高25%', skills: ['focus', 'cloak'], color: 0xc1a4f0 },
  commando: { name: '突击兵', health: 100, aim: 0.6, ammo: 1.3, passive: '弹药专精：携带更多备用弹药', skills: ['supply', 'overdrive'], color: 0xf0c57a },
  tank: { name: '重装兵', health: 130, aim: 0.55, ammo: 1, passive: '防爆装甲：爆炸伤害降低30%', skills: ['barrier', 'iron'], color: 0x9cbdde },
};
export const SKILLS: Record<SkillId, { name: string; description: string; cooldown: number; duration: number; level: number }> = {
  heal: { name: '战地急救', description: '恢复自己及180px内队友40生命', cooldown: 600, duration: 0, level: 1 },
  regenerate: { name: '再生组织', description: '6秒内每秒恢复10生命', cooldown: 750, duration: 180, level: 2 },
  focus: { name: '精准专注', description: '5秒内散布缩小75%', cooldown: 540, duration: 150, level: 1 },
  cloak: { name: '暗影隐匿', description: '4秒内敌人无法锁定你；开火或受伤解除', cooldown: 660, duration: 120, level: 2 },
  supply: { name: '弹药补给', description: '补满自己及180px内队友的备用弹药', cooldown: 660, duration: 0, level: 1 },
  overdrive: { name: '火力压制', description: '5秒内武器伤害提高20%', cooldown: 750, duration: 150, level: 2 },
  barrier: { name: '装甲屏障', description: '4秒内受到的伤害降低50%', cooldown: 750, duration: 120, level: 1 },
  iron: { name: '钢铁意志', description: '6秒内抵挡下一次攻击的80%伤害', cooldown: 450, duration: 180, level: 2 },
};
export interface CatalogWeapon { config: Readonly<WeaponConfig>; name: string; description: string; price: number; level: number; slot: 'primary' | 'secondary'; pellets: number; spread: number; length: number; artFrame?: readonly [number, number, number, number] }
export const WEAPONS: Record<WeaponId, CatalogWeapon> = {
  ak47: { config: { ...M4, id: 'ak47', damage: 16, shootDelayFrames: 6, recoil: 6, reloadFrames: 42, rangeUnits: 65 }, name: 'AK 47', description: '较慢射速、较强单发伤害，后坐力更明显', price: 320, level: 2, slot: 'primary', pellets: 1, spread: 0, length: 46, artFrame: [26, 14, 57, 20] },
  deagle: { config: { ...USP, id: 'deagle', damage: 34, magazineSize: 7, spareMagazines: 5, shootDelayFrames: 15, recoil: 7, reloadFrames: 38 }, name: 'Desert Eagle', description: '7发大威力副枪；射击间隔较长', price: 300, level: 2, slot: 'secondary', pellets: 1, spread: 0, length: 30, artFrame: [40, 12, 30, 19] },
  m4: { config: M4, name: 'M4', description: '均衡的自动步枪', price: 0, level: 1, slot: 'primary', pellets: 1, spread: 0, length: 39 },
  usp: { config: USP, name: 'USP', description: '可靠的半自动副武器', price: 0, level: 1, slot: 'secondary', pellets: 1, spread: 0, length: 26 },
  vector: { config: { ...M4, id: 'vector', damage: 8, magazineSize: 32, shootDelayFrames: 3, rangeUnits: 48, recoil: 5, reloadFrames: 30 }, name: 'Vector', description: '高射速冲锋枪，适合近距离压制', price: 200, level: 1, slot: 'primary', pellets: 1, spread: 0, length: 30 },
  shotgun: { config: { ...M4, id: 'shotgun', damage: 12, magazineSize: 6, spareMagazines: 5, shootDelayFrames: 22, automatic: false, rangeUnits: 32, recoil: 3, reloadFrames: 48 }, name: '破门者霰弹枪', description: '每发6颗弹丸，贴近目标威力更大', price: 280, level: 2, slot: 'primary', pellets: 6, spread: 12, length: 42 },
  dragunov: { config: { ...M4, id: 'dragunov', damage: 58, magazineSize: 5, spareMagazines: 4, shootDelayFrames: 24, automatic: false, rangeUnits: 120, recoil: 1.4, reloadFrames: 48, xOff: 12 }, name: 'Dragunov', description: '低射速长射程步枪，重视精准点射', price: 500, level: 3, slot: 'primary', pellets: 1, spread: 0, length: 52 },
  saw: { config: { ...M4, id: 'saw', damage: 11, magazineSize: 50, shootDelayFrames: 4, rangeUnits: 50, recoil: 7, reloadFrames: 66 }, name: 'SAW', description: '50发机枪，持续火力与较长换弹时间', price: 450, level: 3, slot: 'primary', pellets: 1, spread: 0, length: 46 },
  beretta: { config: { ...USP, id: 'beretta', damage: 21, shootDelayFrames: 9, recoil: 4 }, name: 'Beretta', description: '威力更大的半自动手枪', price: 180, level: 2, slot: 'secondary', pellets: 1, spread: 0, length: 28 },
};
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
export const defaultLoadout = (classId: ClassId = 'medic'): Loadout => ({ classId, primary: 'm4', secondary: 'usp', skill: CLASSES[classId].skills[0], item: 'medkit', training: { vitality: 0, handling: 0 }, level: 1 });
export function levelForXp(xp: number) { return Math.min(10, 1 + Math.floor(Math.max(0, xp) / 160)); }
export function loadoutStats(loadout: Loadout) {
  const c = CLASSES[loadout.classId];
  return { health: c.health + loadout.training.vitality * 8, aim: c.aim + loadout.training.handling * 0.1, ammo: c.ammo };
}
