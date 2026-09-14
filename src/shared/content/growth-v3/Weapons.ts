import type { WeaponId as ArtWeaponId } from '../../../game/combat/Combat';
import type { ContentStage, GrowthClassId } from './Core';

export type WeaponFamily = 'AR' | 'SMG' | 'SG' | 'PREC' | 'LMG' | 'SIDE';
export interface GrowthWeaponDefinition {
  name: string; artId: ArtWeaponId; family: WeaponFamily; stage: ContentStage;
  damage: number; pellets: number; headMultiplier: number;
  mode: 'auto' | 'semi' | 'burst'; interval: number; burstGap: number;
  magazine: number; totalAmmo: number; reload: number; emptyReload: number;
  falloffStart: number; falloffEnd: number; maxRange: number; minDamageScale: number;
  prepare: number; spread: number; bloomPerShot: number; bloomCap: number;
  recoverWait: number; recoverPerTick: number; visualKick: number; fanDegrees: number;
  feed: 'box' | 'tube' | 'cylinder';
}
type Timing = readonly [number, number, number, number, number, number, number];
type Range = readonly [number, number, number, number];
type Spread = readonly [number, number, number, number, number, number, number];
function weapon(name: string, artId: ArtWeaponId, family: WeaponFamily, stage: ContentStage,
  damage: number, pellets: number, headMultiplier: number, mode: GrowthWeaponDefinition['mode'],
  timing: Timing, range: Range, spread: Spread, feed: GrowthWeaponDefinition['feed'] = 'box'): GrowthWeaponDefinition {
  const [interval, burstGap, magazine, totalAmmo, reload, emptyReload, prepare] = timing;
  const [falloffStart, falloffEnd, maxRange, minDamageScale] = range;
  const [base, bloomPerShot, bloomCap, recoverWait, recoverPerTick, visualKick, fanDegrees] = spread;
  return { name, artId, family, stage, damage, pellets, headMultiplier, mode, interval, burstGap,
    magazine, totalAmmo, reload, emptyReload, prepare, falloffStart, falloffEnd, maxRange, minDamageScale,
    spread: base, bloomPerShot, bloomCap, recoverWait, recoverPerTick, visualKick, fanDegrees, feed };
}

/** Art mappings reuse existing assets only; they never supply gameplay parameters. */
export const GROWTH_V3_WEAPONS = {
  m4: weapon('M4', 'm4', 'AR', 2, 10, 1, 1.45, 'auto', [4,0,30,120,34,42,8], [360,650,900,.65], [1.2,.25,2,6,.20,1.2,0]),
  famas: weapon('FAMAS', 'famas', 'AR', 2, 8, 1, 1.45, 'auto', [3,0,24,120,45,55,8], [320,580,850,.65], [1.5,.30,2.4,6,.20,1,0]),
  burst_ar: weapon('三连发步枪', 'g36', 'AR', 2, 12, 1, 1.45, 'burst', [3,10,27,108,42,51,9], [400,700,950,.70], [.8,.18,1.4,6,.25,1.3,0]),
  mp5: weapon('MP5', 'mp5', 'SMG', 2, 8, 1, 1.45, 'auto', [3,0,30,150,32,40,6], [220,460,700,.50], [1.8,.25,2.2,5,.25,.8,0]),
  vector: weapon('Vector', 'vector', 'SMG', 5, 6, 1, 1.45, 'auto', [2,0,24,144,38,48,6], [180,380,650,.45], [2,.30,2.8,5,.28,.7,0]),
  ump: weapon('UMP', 'ump', 'SMG', 5, 13, 1, 1.45, 'auto', [5,0,24,120,36,45,7], [260,500,750,.55], [1.6,.25,2,6,.20,1.4,0]),
  shotgun: weapon('泵动霰弹枪', 'shotgun', 'SG', 2, 10, 7, 1.20, 'semi', [24,0,5,30,48,60,9], [100,280,450,.25], [1.8,0,0,0,0,3,12], 'tube'),
  auto_sg: weapon('半自动霰弹枪', 'aa12', 'SG', 5, 7, 7, 1.20, 'semi', [15,0,8,40,54,66,9], [90,250,420,.25], [2,.20,1,6,.20,2.2,14]),
  slug_sg: weapon('独头弹霰弹枪', 'spas12', 'SG', 5, 42, 1, 1.45, 'semi', [18,0,6,30,45,57,10], [240,500,750,.55], [1,.30,1.2,8,.20,2.4,0], 'tube'),
  scout: weapon('Scout', 'scout', 'PREC', 2, 52, 1, 1.45, 'semi', [25,0,4,24,48,60,12], [800,1400,1800,.80], [.45,.30,.60,9,.15,3.2,0]),
  dmr: weapon('半自动DMR', 'dragunov', 'PREC', 2, 28, 1, 1.45, 'semi', [10,0,12,60,45,57,10], [600,1000,1400,.75], [.70,.25,1.25,7,.20,2,0]),
  heavy_sniper: weapon('重型栓狙', 'barrett', 'PREC', 5, 72, 1, 1.45, 'semi', [45,0,3,18,66,81,18], [1000,1600,2000,.85], [.30,.40,.80,12,.10,4.5,0]),
  saw: weapon('SAW', 'saw', 'LMG', 2, 9, 1, 1.45, 'auto', [4,0,50,200,65,78,12], [320,600,900,.65], [1.8,.20,3,8,.16,1.2,0]),
  heavy_lmg: weapon('重压制机枪', 'rpd', 'LMG', 5, 12, 1, 1.45, 'auto', [5,0,60,180,90,108,15], [420,750,1000,.70], [2,.20,3.2,9,.15,1.6,0]),
  compact_lmg: weapon('短管轻机枪', 'aughbar', 'LMG', 5, 8, 1, 1.45, 'auto', [3,0,40,160,60,72,10], [260,500,800,.55], [2,.25,2.6,7,.20,1,0]),
  usp: weapon('USP', 'usp', 'SIDE', 2, 15, 1, 1.45, 'semi', [7,0,12,60,28,36,6], [200,450,650,.60], [1.2,.20,1,5,.25,1.1,0]),
  revolver: weapon('左轮', 'p357', 'SIDE', 2, 34, 1, 1.45, 'semi', [15,0,6,30,48,60,8], [300,600,850,.65], [.9,.30,1.2,7,.20,2.8,0], 'cylinder'),
  burst_pistol: weapon('连发手枪', 'raffica', 'SIDE', 5, 9, 1, 1.45, 'burst', [2,12,15,75,36,45,6], [140,300,500,.45], [1.8,.30,2,6,.25,.8,0]),
} as const;
export type GrowthWeaponId = keyof typeof GROWTH_V3_WEAPONS;
export const GROWTH_V3_SIDEARMS = ['usp', 'revolver', 'burst_pistol'] as const;
export type GrowthSidearmId = typeof GROWTH_V3_SIDEARMS[number];
export const GROWTH_V3_PRIMARY_POOLS: Record<GrowthClassId, readonly GrowthWeaponId[]> = {
  assault: ['m4','famas','burst_ar','mp5','vector','ump','shotgun'],
  tank: ['saw','heavy_lmg','compact_lmg','shotgun','auto_sg','slug_sg','mp5','ump'],
  sniper: ['scout','dmr','heavy_sniper','m4','mp5'],
  medic: ['famas','m4','burst_ar','mp5','ump','shotgun','auto_sg'],
};
export function isGrowthWeaponId(value: unknown): value is GrowthWeaponId {
  return typeof value === 'string' && Object.hasOwn(GROWTH_V3_WEAPONS, value);
}
export function growthPrimaryPool(classId: GrowthClassId, stage: ContentStage) {
  return GROWTH_V3_PRIMARY_POOLS[classId].filter(id => GROWTH_V3_WEAPONS[id].stage <= stage);
}
