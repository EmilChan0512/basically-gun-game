import { GROWTH_ACHIEVEMENTS, type GrowthAchievement } from '../GrowthRecords';
import { assertRecord, exactKeys, isClassId, type ContentStage, type GrowthClassId } from './Core';
import { GROWTH_V3_OPERATORS, GROWTH_V3_ABILITIES, isAbilityId, type GrowthAbilityId } from './Operators';
import { GROWTH_V3_GADGETS, isGadgetId, type GrowthGadgetId } from './Gadgets';
import { GROWTH_V3_WEAPONS, GROWTH_V3_SIDEARMS, growthPrimaryPool, isGrowthWeaponId, type GrowthSidearmId, type GrowthWeaponId } from './Weapons';
import { validateAttachments, type GrowthAttachmentId } from './Attachments';
import { defaultGrowthCards, legalGrowthCards, type GrowthCardId } from './Cards';
import { GROWTH_V3_PERKS, defaultClassPerks, validateClassPerks, validateGrowthPerks, type GrowthPerkId } from './Perks';

export interface GrowthLoadoutV3 {
  classId: GrowthClassId; abilityId: GrowthAbilityId; gadgetId: GrowthGadgetId;
  primary: GrowthWeaponId; secondary: GrowthSidearmId;
  attachments: { primary: GrowthAttachmentId[]; secondary: GrowthAttachmentId[] };
  perks: GrowthPerkId[]; pool: GrowthCardId[]; title: GrowthAchievement | 'none';
}
export function defaultGrowthLoadoutV3(classId: GrowthClassId = 'assault'): GrowthLoadoutV3 {
  const operator = GROWTH_V3_OPERATORS[classId], abilityId = operator.abilities[0];
  return { classId, abilityId, gadgetId: operator.gadgets[0], primary: operator.primary, secondary: 'usp',
    attachments: { primary: [], secondary: [] }, perks: defaultClassPerks(classId, abilityId), pool: defaultGrowthCards(classId, abilityId), title: 'none' };
}
/** Public requests require class perks. Only trusted simulation/review of archived builds opts into generic perks. */
export function validateGrowthLoadoutV3(value: unknown, stage: ContentStage, archivedPerks = false): GrowthLoadoutV3 {
  assertRecord(value, 'growth loadout');
  exactKeys(value, ['classId','abilityId','gadgetId','primary','secondary','attachments','perks','pool','title'], 'growth loadout');
  const { classId, abilityId, gadgetId, primary, secondary } = value;
  if (!isClassId(classId)) throw Error('Invalid growth class');
  if (!isAbilityId(abilityId) || GROWTH_V3_ABILITIES[abilityId].classId !== classId) throw Error('not_owner_class');
  if (!isGadgetId(gadgetId) || GROWTH_V3_GADGETS[gadgetId].classId !== classId) throw Error('not_owner_class');
  if (!isGrowthWeaponId(primary) || !growthPrimaryPool(classId, stage).includes(primary)) throw Error('Invalid primary weapon');
  if (!isGrowthWeaponId(secondary) || !(GROWTH_V3_SIDEARMS as readonly string[]).includes(secondary)
    || GROWTH_V3_WEAPONS[secondary].stage > stage) throw Error('Invalid secondary weapon');
  assertRecord(value.attachments, 'attachments'); exactKeys(value.attachments, ['primary','secondary'], 'attachments');
  const attachments = { primary: validateAttachments(primary, value.attachments.primary, stage), secondary: validateAttachments(secondary, value.attachments.secondary, stage) };
  const legacy = archivedPerks && Array.isArray(value.perks) && value.perks.every(id => typeof id === 'string' && id.startsWith('pk_'));
  const perks = legacy ? validateGrowthPerks(value.perks) : validateClassPerks(value.perks, classId, abilityId), allowed = legalGrowthCards(classId, abilityId);
  if (!Array.isArray(value.pool) || value.pool.length !== 8 || new Set(value.pool).size !== 8
    || value.pool.some(id => !allowed.includes(id as GrowthCardId))) throw Error('Choose eight legal cards');
  if (typeof value.title !== 'string' || value.title !== 'none' && !Object.hasOwn(GROWTH_ACHIEVEMENTS, value.title)) throw Error('Invalid title');
  return { classId, abilityId, gadgetId, primary, secondary: secondary as GrowthSidearmId, attachments, perks,
    pool: [...value.pool] as GrowthCardId[], title: value.title as GrowthLoadoutV3['title'] };
}

/** UI-only draft transformation: server still validates the entire submitted result. */
export function changeGrowthAbility(loadout: GrowthLoadoutV3, abilityId: GrowthAbilityId): GrowthLoadoutV3 {
  const allowed = legalGrowthCards(loadout.classId, abilityId), pool = loadout.pool.filter(id => allowed.includes(id));
  for (const id of defaultGrowthCards(loadout.classId, abilityId)) if (pool.length < 8 && !pool.includes(id)) pool.push(id);
  return { ...structuredClone(loadout), abilityId, pool, perks: loadout.perks.every(id => id.startsWith('pk_')) ? [...loadout.perks] : validateGrowthPerks([defaultClassPerks(loadout.classId, abilityId)[0], ...loadout.perks.filter(id => GROWTH_V3_PERKS[id].group !== 'mobility')]) };
}
