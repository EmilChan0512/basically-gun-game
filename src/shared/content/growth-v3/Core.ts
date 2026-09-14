/** Four-operator specification v1.0. Shared by authority, preview and deterministic simulation. */
export const GROWTH_V3_VERSION = 1;
export const GROWTH_CLASS_IDS = ['assault', 'tank', 'sniper', 'medic'] as const;
export type GrowthClassId = typeof GROWTH_CLASS_IDS[number];
export type ContentStage = 2 | 5;
/** Shared complete-content gate for account, room, gunsmith and local range. */
export const GROWTH_V3_STAGE: ContentStage = 5;
export const GROWTH_V3_RULES = {
  ticksPerSecond: 30, matchTicks: 27000, ultimateTick: 21600,
  respawnTicks: 150, spawnProtectionTicks: 75,
  xpThresholds: [0, 200, 450, 800, 1200], killXp: 100, assistXp: 60, assistTicks: 240,
  supportWindowTicks: 900, supportWindowXp: 60, healingWindowXp: 40, targetHealingWindowXp: 20,
  gadgetUseGap: 30, maxGadgetCharges: 3, maxDeployablesPerActor: 1, maxDeployables: 8,
  maxSmokeAreas: 8, maxFlyingGadgets: 32, throwCastTicks: 6, throwRecoveryTicks: 6,
  deployCastTicks: 12, deployRecoveryTicks: 6, deployRange: 80,
  spawnExclusionRadius: 120, objectiveExclusionRadius: 60,
  throwSpeed: 13, throwLift: 5, throwGravity: .5, throwRadius: 2, maxThrowStep: 2,
  bulletStep: 2, healthUnits: 1000, primaryAttachments: 3, secondaryAttachments: 1,
  armorCap: 25, personalReductionCap: .4, combinedReductionCap: .75,
  speedBuffCap: .2, slowCap: .25, slowResistanceTicks: 45,
  reloadFloor: .6, firstShotTicks: 30, defaultNoiseRadius: 600, defaultRadarTicks: 60,
} as const;

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid ${label}`);
}
export function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw Error(`Unknown ${label} field`);
}
export function isClassId(value: unknown): value is GrowthClassId {
  return typeof value === 'string' && (GROWTH_CLASS_IDS as readonly string[]).includes(value);
}
export function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
export function healthUnits(hp: number) { return Math.round(hp * GROWTH_V3_RULES.healthUnits); }
