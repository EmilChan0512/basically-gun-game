import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS, freshGrowthMetrics, type GrowthMetrics, type GrowthTrait, type GrowthAchievement } from './GrowthRecords';
import { GROWTH_WEAPONS, GROWTH_CLASSES, GROWTH_ALTERNATIVES, GROWTH_PERKS, GROWTH_POOLS, defaultGrowthLoadout, validateGrowthLoadout,
  type GrowthWeaponId, type GrowthClassId, type GrowthLoadout, type GrowthUpgradeId, type GrowthPerkId } from './GrowthCatalog';

export interface GrowthCareer {
  weaponXp: Partial<Record<GrowthWeaponId, number>>; metrics: GrowthMetrics; traits: GrowthTrait[]; achievements: GrowthAchievement[];
  version: 2; xp: number; mastery: Record<GrowthClassId, number>; matches: number; wins: number;
  loadouts: GrowthLoadout[]; selectedSlot: number;
}
export const growthLevel = (xp: number) => Math.min(50, 1 + Math.floor(xp / 400));
export const masteryLevel = (xp: number) => Math.min(50, 1 + Math.floor(xp / 250));
export const growthSlots = (xp: number) => growthLevel(xp) >= 5 ? 3 : growthLevel(xp) >= 3 ? 2 : 1;
export const freshGrowthCareer = (): GrowthCareer => ({ weaponXp: {}, metrics: freshGrowthMetrics(), traits: [], achievements: [], version: 2, xp: 0, mastery: { assault: 0, tank: 0, sniper: 0, medic: 0 }, matches: 0, wins: 0, loadouts: [defaultGrowthLoadout()], selectedSlot: 0 });
export function unlockedGrowthPool(career: GrowthCareer, classId: GrowthClassId): GrowthUpgradeId[] {
  const level = masteryLevel(career.mastery[classId]);
  return [...GROWTH_POOLS[classId], ...GROWTH_ALTERNATIVES[classId].filter((_, i) => level >= (i === 0 ? 2 : 4) || classId !== 'medic' && i === (classId === 'sniper' ? 0 : 1) && career.traits.includes(classId === 'assault' ? 'runner' : classId === 'tank' ? 'survivor' : 'marksman'))];
}
export function unlockedGrowthPerks(career: GrowthCareer): GrowthPerkId[] {
  return (Object.keys(GROWTH_PERKS) as GrowthPerkId[]).filter(id => growthLevel(career.xp) >= GROWTH_PERKS[id].level);
}
export function ownedGrowthLoadout(career: GrowthCareer, input: unknown): GrowthLoadout {
  const loadout = validateGrowthLoadout(input);
  if (loadout.pool!.some(id => !unlockedGrowthPool(career, loadout.classId).includes(id))) throw Error('升级尚未解锁');
  if (loadout.perks!.some(id => !unlockedGrowthPerks(career).includes(id))) throw Error('Perk尚未解锁');
  if ((career.weaponXp[loadout.primary] ?? 0) < GROWTH_ATTACHMENTS[loadout.attachment ?? 'none'].xp) throw Error('武器配件尚未解锁');
  if (loadout.title !== 'none' && loadout.title && !career.achievements.includes(loadout.title)) throw Error('称号尚未解锁');
  if (loadout.evolutions && masteryLevel(career.mastery[loadout.classId]) < 5) throw Error('进化升级需要职业熟练度Lv.5');
  return loadout;
}
export function validateGrowthCareer(value: GrowthCareer) {
  const integer = (x: number) => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000;
  if (!value || value.version !== 2 || !integer(value.xp) || !integer(value.matches) || !integer(value.wins) || value.wins > value.matches
    || !value.mastery || Object.keys(GROWTH_CLASSES).some(id => !integer(value.mastery[id as GrowthClassId]))
    || !Array.isArray(value.loadouts) || value.loadouts.length < 1 || value.loadouts.length > growthSlots(value.xp)
    || !Number.isInteger(value.selectedSlot) || value.selectedSlot < 0 || value.selectedSlot >= value.loadouts.length) throw Error('Invalid growth career');
  if (!value.metrics || Object.keys(freshGrowthMetrics()).some(key => !integer(value.metrics[key as keyof GrowthMetrics]))
    || !value.weaponXp || Object.entries(value.weaponXp).some(([id, xp]) => !Object.hasOwn(GROWTH_WEAPONS, id) || !integer(xp))
    || !Array.isArray(value.traits) || value.traits.some(id => !Object.hasOwn(GROWTH_TRAITS, id))
    || !Array.isArray(value.achievements) || value.achievements.some(id => !Object.hasOwn(GROWTH_ACHIEVEMENTS, id))) throw Error('Invalid growth records');
  value.loadouts.forEach(loadout => ownedGrowthLoadout(value, loadout));
}

/** Additive upgrade from the released three-class career. Validation still rejects damaged records. */
export function migrateGrowthCareer(input: unknown): GrowthCareer {
  if (!input || typeof input !== 'object') throw Error('Invalid growth career');
  const old = input as GrowthCareer;
  if ((input as { version: number }).version !== 1) { validateGrowthCareer(old); return old; }
  if (!old.mastery || !old.metrics) throw Error('Invalid legacy growth career');
  const next: GrowthCareer = { ...structuredClone(old), version: 2,
    mastery: { ...old.mastery, medic: 0 }, metrics: { ...old.metrics, healingDone: 0, healingXp: 0 } };
  validateGrowthCareer(next); return next;
}
