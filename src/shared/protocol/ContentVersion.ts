import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS } from '../content/GrowthRecords';
import { MAPS } from '../content/Maps';
import { GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATE, GROWTH_WEAPONS, GROWTH_CLASSES, GROWTH_POOLS, GROWTH_ULTIMATES, GROWTH_PERKS, GROWTH_ALTERNATIVES } from '../content/GrowthCatalog';
import { PVE_SCENARIOS } from '../content/PvEScenarios';
import { WEAPONS, CLASSES, SKILLS, ITEMS, SPECIAL_OFFHANDS } from '../../game/campaign/Catalog';
import { KNIFE_RULES } from '../simulation/Melee';
import { SHIELD_RULES } from '../simulation/Offhand';

/** Compatibility fingerprint, not a security signature. Increment rules when executable semantics change. */
export function contentFingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return hash.toString(16).padStart(16, '0');
}
export const CONTENT_VERSION = contentFingerprint({ rules: 33, growth: [GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATE, GROWTH_WEAPONS, GROWTH_CLASSES, GROWTH_POOLS, GROWTH_ULTIMATES, GROWTH_PERKS, GROWTH_ALTERNATIVES], records: [GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS], maps: MAPS, scenarios: PVE_SCENARIOS, weapons: WEAPONS,
  offhands: SPECIAL_OFFHANDS, knife: KNIFE_RULES, shield: SHIELD_RULES, classes: CLASSES, skills: SKILLS, items: ITEMS });
