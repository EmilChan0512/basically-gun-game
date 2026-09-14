import { freshGrowthCareer, migrateGrowthCareer, growthSlots, type GrowthCareer as LegacyCareer } from '../GrowthCareer';
import { validateGrowthLoadout as validateLegacyLoadout } from '../GrowthCatalog';
import { GROWTH_ACHIEVEMENTS, GROWTH_TRAITS, freshGrowthMetrics } from '../GrowthRecords';
import { assertRecord, GROWTH_CLASS_IDS, isClassId, type ContentStage, type GrowthClassId } from './Core';
import { GROWTH_V3_STAGE } from './Core';
import { GROWTH_V3_WEAPONS, growthPrimaryPool, isGrowthWeaponId, type GrowthWeaponId } from './Weapons';
import { GROWTH_V3_PERKS, GROWTH_V3_PERK_GROUPS, DEFAULT_GROWTH_V3_PERKS, type GrowthPerkId } from './Perks';
import { defaultGrowthLoadoutV3, validateGrowthLoadoutV3, type GrowthLoadoutV3 } from './Loadout';
import { validateAttachments, type GrowthAttachmentId } from './Attachments';
import { defaultGrowthCards, legalGrowthCards, type GrowthCardId } from './Cards';

export interface GrowthCareerV3 extends Omit<LegacyCareer, 'version' | 'loadouts' | 'weaponXp'> {
  version: 3; loadouts: GrowthLoadoutV3[]; weaponXp: Partial<Record<GrowthWeaponId, number>>;
  legacyLoadoutArchive: { slot: number; original: unknown; notices: string[] }[];
}
const CARD_MIGRATION: Record<GrowthClassId, Record<string, GrowthCardId>> = {
  assault: { momentum:'as_C2', tacticalReload:'as_C1', scavenger:'as_C3', grenadePouch:'as_G1', controlledBurst:'as_C2', quickHands:'as_C1', lastStand:'as_C4', slideReload:'as_A1' },
  tank: { brace:'tk_C1', blastPadding:'tk_C3', mobileCover:'tk_A1', emergencyPlate:'tk_A3', fieldRepair:'tk_G2', guardReload:'tk_C2', suppressiveGrip:'tk_C1', reserveDrill:'tk_C4' },
  sniper: { steadyAim:'sn_C1', relocate:'sn_A1', firstShot:'sn_C2', quickScope:'sn_A1', sidearmReady:'sn_C3', precisionCycle:'sn_A2', evasiveReload:'sn_C4', measuredReload:'sn_C4' },
  medic: { triage:'md_C1', widePulse:'md_A1', rapidAid:'md_A2', rescueSprint:'md_C2', sharedSupplies:'md_G1', clinicalGrip:'md_C3', aidReload:'md_C3', selfCare:'md_C4' },
};
const PERK_MIGRATION: Record<string, GrowthPerkId> = {
  fieldDressing:'pk_dressing', preparedSidearm:'pk_sidefeed', steadyLanding:'pk_landing',
  resourceful:'pk_supplyrun', cautiousReload:'pk_reloadguard', supplyRunner:'pk_supplyrun',
};
/** Only migration may default/repair loadout fields; live requests use strict validation. */
export function migrateLegacyLoadout(value: unknown, stage: ContentStage): { loadout: GrowthLoadoutV3; notices: string[] } {
  assertRecord(value, 'legacy loadout');
  if (!isClassId(value.classId)) throw Error('Invalid legacy class');
  const loadout = defaultGrowthLoadoutV3(value.classId), notices: string[] = ['已切换为四干员专属技能与道具规则。'];
  if (isGrowthWeaponId(value.primary) && growthPrimaryPool(value.classId, stage).includes(value.primary)) loadout.primary = value.primary;
  else notices.push('旧主武器不在当前开放许可内，已使用职业默认武器。');
  const mappedPart = ({ heavy:'B01', short:'B02', quickmag:'A01' } as Record<string, GrowthAttachmentId>)[String(value.attachment)];
  if (mappedPart) {
    try { loadout.attachments.primary = validateAttachments(loadout.primary, [mappedPart], stage); }
    catch { notices.push('旧改装与新枪械供弹方式不兼容，已归档；当前使用标准配置。'); }
  } else if (value.attachment && value.attachment !== 'none') notices.push('未识别的旧改装已归档。');
  const legal = legalGrowthCards(loadout.classId, loadout.abilityId), pool: GrowthCardId[] = [];
  const normalized = validateLegacyLoadout(value);
  for (const key of normalized.pool!) {
    const next = typeof key === 'string' ? CARD_MIGRATION[value.classId][key] : undefined;
    if (next && legal.includes(next) && !pool.includes(next) && pool.length < 8) pool.push(next);
    else notices.push(`旧成长项 ${String(key)} 已归档并按合法默认池补齐。`);
  }
  for (const id of [...defaultGrowthCards(loadout.classId, loadout.abilityId), ...legal]) if (pool.length < 8 && !pool.includes(id)) pool.push(id);
  loadout.pool = pool;
  const oldPerks = normalized.perks!.map(id => PERK_MIGRATION[id]).filter((id): id is GrowthPerkId => !!id);
  loadout.perks = GROWTH_V3_PERK_GROUPS.map((group, index) => oldPerks.find(id => GROWTH_V3_PERKS[id].group === group) ?? DEFAULT_GROWTH_V3_PERKS[index]);
  if (value.title === 'none' || typeof value.title === 'string' && Object.hasOwn(GROWTH_ACHIEVEMENTS, value.title)) loadout.title = value.title as GrowthLoadoutV3['title'];
  if (value.evolutions) notices.push('旧进化开关已归档，新竞技进化统一开放。');
  return { loadout: validateGrowthLoadoutV3(loadout, stage), notices };
}
export function freshGrowthCareerV3(): GrowthCareerV3 {
  return { ...freshGrowthCareer(), version: 3, loadouts: [defaultGrowthLoadoutV3()], legacyLoadoutArchive: [] };
}
export function ownedGrowthLoadoutV3(career: GrowthCareerV3, value: unknown, stage: ContentStage = GROWTH_V3_STAGE) {
  const loadout = validateGrowthLoadoutV3(value, stage);
  if (loadout.title !== 'none' && !career.achievements.includes(loadout.title)) throw Error('称号尚未解锁');
  return loadout;
}
export function validateGrowthCareerV3(value: unknown): asserts value is GrowthCareerV3 {
  assertRecord(value, 'growth career');
  const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 1000000000;
  if (value.version !== 3 || !integer(value.xp) || !integer(value.matches) || !integer(value.wins) || value.wins > value.matches) throw Error('Invalid growth progress');
  assertRecord(value.mastery, 'mastery'); assertRecord(value.metrics, 'metrics'); assertRecord(value.weaponXp, 'weapon XP');
  if (GROWTH_CLASS_IDS.some(id => !integer((value.mastery as Record<string, unknown>)[id]))
    || Object.keys(value.mastery).some(id => !isClassId(id))
    || Object.keys(freshGrowthMetrics()).some(id => !integer((value.metrics as Record<string, unknown>)[id]))
    || Object.entries(value.weaponXp).some(([id,xp]) => !Object.hasOwn(GROWTH_V3_WEAPONS,id) || !integer(xp))) throw Error('Invalid growth metrics');
  if (!Array.isArray(value.traits) || value.traits.some(id => typeof id !== 'string' || !Object.hasOwn(GROWTH_TRAITS,id))
    || !Array.isArray(value.achievements) || value.achievements.some(id => typeof id !== 'string' || !Object.hasOwn(GROWTH_ACHIEVEMENTS,id))) throw Error('Invalid growth cosmetics');
  if (!Array.isArray(value.loadouts) || value.loadouts.length < 1 || value.loadouts.length > growthSlots(value.xp)
    || !integer(value.selectedSlot) || value.selectedSlot >= value.loadouts.length || !Array.isArray(value.legacyLoadoutArchive)) throw Error('Invalid growth loadout slots');
  for (const item of value.loadouts) {
    // Stage affects lobby access, not persistence validity: never delete P5 equipment in a P2 room.
    const loadout = validateGrowthLoadoutV3(item, 5);
    if (loadout.title !== 'none' && !value.achievements.includes(loadout.title)) throw Error('Unowned growth title');
  }
  for (const entry of value.legacyLoadoutArchive) {
    assertRecord(entry, 'archive entry');
    if (!integer(entry.slot) || !Array.isArray(entry.notices) || entry.notices.some(text => typeof text !== 'string') || !Object.hasOwn(entry,'original')) throw Error('Invalid loadout archive');
  }
}
export function migrateGrowthCareerV3(value: unknown, stage: ContentStage = 5): GrowthCareerV3 {
  assertRecord(value, 'growth career');
  if (value.version === 3) { validateGrowthCareerV3(value); return structuredClone(value); }
  if (value.version !== 1 && value.version !== 2) throw Error('Unsupported growth schema');
  const legacy = migrateGrowthCareer(value); // Validates the actual released schema before converting it.
  const converted = legacy.loadouts.map(item => migrateLegacyLoadout(item, stage));
  const next: GrowthCareerV3 = { ...structuredClone(legacy), version: 3,
    loadouts: converted.map(item => item.loadout),
    legacyLoadoutArchive: legacy.loadouts.map((original, slot) => ({ slot, original: structuredClone(original), notices: converted[slot].notices })) };
  validateGrowthCareerV3(next); return next;
}
