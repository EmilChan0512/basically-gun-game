import { VISION_RADIUS } from '../simulation/Vision';
import { GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS } from '../content/GrowthRecords';
import { MAPS } from '../content/Maps';
import { GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATE, GROWTH_WEAPONS, GROWTH_CLASSES, GROWTH_POOLS, GROWTH_ULTIMATES, GROWTH_PERKS, GROWTH_ALTERNATIVES } from '../content/GrowthCatalog';
import { PVE_SCENARIOS } from '../content/PvEScenarios';
import { WEAPONS, CLASSES, SKILLS, ITEMS, SPECIAL_OFFHANDS } from '../../game/campaign/Catalog';
import { KNIFE_RULES } from '../simulation/Melee';
import { SHIELD_RULES } from '../simulation/Offhand';
import { GROWTH_V3_RULES, GROWTH_V3_VERSION, GROWTH_V3_STAGE } from '../content/growth-v3/Core';
import { GROWTH_V3_WEAPONS } from '../content/growth-v3/Weapons';
import { GROWTH_V3_ATTACHMENTS } from '../content/growth-v3/Attachments';
import { GROWTH_V3_OPERATORS, GROWTH_V3_ABILITIES, GROWTH_V3_PASSIVES, GROWTH_V3_ULTIMATES } from '../content/growth-v3/Operators';
import { GROWTH_V3_GADGETS } from '../content/growth-v3/Gadgets';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS } from '../content/growth-v3/Cards';
import { GROWTH_V3_PERKS } from '../content/growth-v3/Perks';
import { GROWTH_SOUND_RADII } from '../simulation/growth-v3/Sound';
import { GROWTH_V3_PRESETS } from '../content/growth-v3/Presets';

/** Compatibility fingerprint, not a security signature. Increment rules when executable semantics change. */
export function contentFingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return hash.toString(16).padStart(16, '0');
}
export const CONTENT_VERSION = contentFingerprint({ rules: 58, visionRadius: VISION_RADIUS, growthPresets: GROWTH_V3_PRESETS, growthStage: GROWTH_V3_STAGE, growthSound: GROWTH_SOUND_RADII,
  growthV3: [GROWTH_V3_VERSION, GROWTH_V3_RULES, GROWTH_V3_WEAPONS, GROWTH_V3_ATTACHMENTS, GROWTH_V3_OPERATORS, GROWTH_V3_ABILITIES,
    GROWTH_V3_PASSIVES, GROWTH_V3_ULTIMATES, GROWTH_V3_GADGETS, GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, GROWTH_V3_PERKS],
  growth: [GROWTH_RULES, GROWTH_UPGRADES, GROWTH_ULTIMATE, GROWTH_WEAPONS, GROWTH_CLASSES, GROWTH_POOLS, GROWTH_ULTIMATES, GROWTH_PERKS, GROWTH_ALTERNATIVES], records: [GROWTH_ATTACHMENTS, GROWTH_ACHIEVEMENTS, GROWTH_TRAITS], maps: MAPS, scenarios: PVE_SCENARIOS, weapons: WEAPONS,
  offhands: SPECIAL_OFFHANDS, knife: KNIFE_RULES, shield: SHIELD_RULES, classes: CLASSES, skills: SKILLS, items: ITEMS });
