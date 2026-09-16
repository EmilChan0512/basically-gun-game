import { clamp, type ContentStage } from './Core';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId, type WeaponFamily } from './Weapons';

export type AttachmentSlot = 'muzzle' | 'barrel' | 'grip' | 'stock' | 'ammo' | 'optic';
export type ModifierStat = 'spread' | 'bloomPerShot' | 'bloomCap' | 'recoverPerTick' | 'visualKick' | 'hitKick'
  | 'range' | 'prepare' | 'reload' | 'magazine' | 'totalAmmo' | 'speed' | 'fanDegrees' | 'noise' | 'radar' | 'flash';
export type ModifierCondition = 'always' | 'moving' | 'stationary' | 'first' | 'stationaryFirst' | 'movingFirst'
  | 'braced' | 'focusedFirst' | 'loaded' | 'empty';
export interface StatModifier { stat: ModifierStat; bp: number; when: ModifierCondition }
export interface AttachmentDefinition {
  name: string; slot: AttachmentSlot; stage: ContentStage;
  modifiers: readonly StatModifier[]; weapons: readonly GrowthWeaponId[]; contrast?: boolean;
}
const all = Object.keys(GROWTH_V3_WEAPONS) as GrowthWeaponId[];
const families = (...ids: WeaponFamily[]) => all.filter(id => ids.includes(GROWTH_V3_WEAPONS[id].family));
const primary = all.filter(id => GROWTH_V3_WEAPONS[id].family !== 'SIDE');
const box = all.filter(id => GROWTH_V3_WEAPONS[id].feed === 'box');
const mod = (stat: ModifierStat, bp: number, when: ModifierCondition = 'always'): StatModifier => ({ stat, bp, when });
function part(name: string, slot: AttachmentSlot, stage: ContentStage, weapons: readonly GrowthWeaponId[], ...modifiers: StatModifier[]): AttachmentDefinition {
  return { name, slot, stage, weapons, modifiers };
}
export const GROWTH_V3_ATTACHMENTS = {
  M01: part('补偿器','muzzle',2,families('AR','SMG','LMG'),mod('bloomPerShot',-1500),mod('spread',1000)),
  M02: part('制退器','muzzle',2,all,mod('visualKick',-2000),mod('prepare',1000)),
  M03: part('消音器','muzzle',2,families('AR','SMG','PREC','SIDE'),mod('noise',-2500),mod('radar',-3000),mod('range',-1200)),
  M04: part('消焰器','muzzle',2,families('AR','SMG','LMG','SIDE'),mod('flash',-5000),mod('radar',-1500),mod('bloomPerShot',800)),
  M05: part('收束器','muzzle',2,['shotgun','auto_sg'],mod('fanDegrees',-1800),mod('prepare',1200)),
  M06: part('扩散器','muzzle',2,['shotgun','auto_sg'],mod('fanDegrees',1800),mod('range',-1500)),
  B01: part('重枪管','barrel',2,primary,mod('spread',-2000),mod('range',1200),mod('speed',-400),mod('reload',1200)),
  B02: part('短枪管','barrel',2,primary,mod('speed',400),mod('prepare',-1000),mod('range',-1800),mod('spread',1200)),
  B03: part('精密枪管','barrel',2,[...families('AR','PREC'),'slug_sg'],mod('spread',-2500,'stationaryFirst'),mod('spread',2000,'moving')),
  B04: part('轻量枪管','barrel',2,[...families('AR','SMG','PREC','LMG'),'auto_sg'],mod('speed',300),mod('bloomPerShot',1500)),
  B05: part('加长枪管','barrel',2,primary,mod('range',1800),mod('prepare',1500),mod('speed',-300)),
  B06: part('散热枪管','barrel',2,families('AR','SMG','LMG'),mod('bloomCap',-1500),mod('recoverPerTick',-2000)),
  G01: part('垂直握把','grip',5,[...families('AR','SMG','LMG'),'auto_sg'],mod('bloomPerShot',-1500),mod('spread',1000,'moving')),
  G02: part('三角握把','grip',5,[...families('AR','SMG','PREC','LMG'),'auto_sg'],mod('prepare',-1500),mod('bloomPerShot',1000)),
  G03: part('稳定握把','grip',5,primary,mod('spread',-1500,'stationary'),mod('speed',-200)),
  G04: part('短握把','grip',5,families('AR','SMG','LMG'),mod('spread',-1200,'moving'),mod('spread',1000,'stationary')),
  G05: part('两脚架','grip',5,families('PREC','LMG'),mod('spread',-2500,'braced'),mod('prepare',1500)),
  G06: part('防滑护套','grip',5,all,mod('spread',-1000,'first'),mod('reload',800)),
  S01: part('轻型枪托','stock',5,primary,mod('speed',300),mod('visualKick',1500)),
  S02: part('重型枪托','stock',5,primary,mod('visualKick',-2500),mod('speed',-300),mod('prepare',800)),
  S03: part('贴腮枪托','stock',5,families('AR','PREC','LMG'),mod('spread',-2000,'stationaryFirst'),mod('spread',1500,'moving')),
  S04: part('战术枪托','stock',5,primary,mod('prepare',-1800),mod('visualKick',1200)),
  S05: part('缓冲枪托','stock',5,primary,mod('hitKick',-2500),mod('reload',1000)),
  S06: part('折叠枪托','stock',5,[...families('AR','SMG'),'shotgun','auto_sg','compact_lmg'],mod('speed',400),mod('prepare',-1000),mod('spread',1800)),
  A01: part('快拆弹匣','ammo',2,box,mod('reload',-2500),mod('magazine',-2000)),
  A02: part('扩容弹匣','ammo',2,box,mod('magazine',3000),mod('reload',2000),mod('speed',-300)),
  A03: part('轻型弹匣','ammo',2,box,mod('reload',-1200),mod('prepare',-800),mod('magazine',-1500)),
  A04: part('弹鼓','ammo',2,families('AR','SMG'),mod('magazine',6000),mod('reload',3500),mod('speed',-600),mod('prepare',1500)),
  A05: part('分装弹带','ammo',2,families('LMG'),mod('reload',-2000,'loaded'),mod('totalAmmo',-2000)),
  A06: part('留仓机构','ammo',2,box,mod('reload',-1800,'loaded'),mod('reload',1500,'empty')),
  O01: part('开放照门','optic',5,all,mod('prepare',-1000),mod('spread',800,'stationaryFirst')),
  O02: part('红点','optic',5,all,mod('spread',-1000,'first'),mod('prepare',800)),
  O03: part('全息','optic',5,primary,mod('spread',-1200,'movingFirst'),mod('prepare',1200)),
  O04: part('低倍镜','optic',5,families('AR','PREC','LMG'),mod('spread',-1800,'stationary'),mod('spread',1500,'moving'),mod('prepare',1000)),
  O05: part('高倍镜','optic',5,families('PREC'),mod('spread',-3000,'focusedFirst'),mod('prepare',2500),mod('spread',2000,'moving')),
  O06: { ...part('对比镜','optic',5,families('AR','PREC','LMG'),mod('spread',-800,'first'),mod('prepare',1200)), contrast: true },
} as const;
export type GrowthAttachmentId = keyof typeof GROWTH_V3_ATTACHMENTS;
export function isAttachmentId(value: unknown): value is GrowthAttachmentId {
  return typeof value === 'string' && Object.hasOwn(GROWTH_V3_ATTACHMENTS, value);
}
export function validateAttachments(weaponId: GrowthWeaponId, value: unknown, stage: ContentStage): GrowthAttachmentId[] {
  if (!Array.isArray(value) || value.length > (GROWTH_V3_WEAPONS[weaponId].family === 'SIDE' ? 1 : 3)
    || value.some(id => !isAttachmentId(id))) throw Error('Invalid attachments');
  const ids = value as GrowthAttachmentId[], slots = new Set<AttachmentSlot>();
  for (const id of ids) {
    const def = GROWTH_V3_ATTACHMENTS[id];
    if (def.stage > stage || !def.weapons.includes(weaponId) || slots.has(def.slot)) throw Error('Incompatible attachment');
    slots.add(def.slot);
  }
  return [...ids].sort();
}

export interface WeaponConditions { moving: boolean; airborne: boolean; crouching: boolean; stationaryTicks: number; braceTicks?: number; first: boolean; empty: boolean }
export const NEUTRAL_WEAPON_CONDITIONS: WeaponConditions = { moving: false, airborne: false, crouching: false, stationaryTicks: 0, first: false, empty: false };
function active(when: ModifierCondition, c: WeaponConditions) {
  const moving = c.moving || c.airborne, stationary = !moving;
  switch (when) {
    case 'always': return true;
    case 'moving': return moving;
    case 'stationary': return stationary;
    case 'first': return c.first;
    case 'stationaryFirst': return stationary && c.first;
    case 'movingFirst': return moving && c.first;
    case 'braced': return stationary && c.crouching && (c.braceTicks ?? 0) >= 24;
    case 'focusedFirst': return stationary && c.stationaryTicks >= 30 && c.first;
    case 'loaded': return !c.empty;
    case 'empty': return c.empty;
  }
}
/** Resolve from immutable bases; only the final timer rounder is allowed to ceil time values. */
export function resolveGrowthWeapon(id: GrowthWeaponId, attachments: readonly GrowthAttachmentId[],
  c: WeaponConditions = NEUTRAL_WEAPON_CONDITIONS, stage: ContentStage = 5) {
  const legal = validateAttachments(id, attachments, stage), base = GROWTH_V3_WEAPONS[id];
  const totals: Partial<Record<ModifierStat, number>> = {};
  for (const key of legal) for (const modifier of GROWTH_V3_ATTACHMENTS[key].modifiers) {
    if (active(modifier.when, c)) totals[modifier.stat] = (totals[modifier.stat] ?? 0) + modifier.bp;
  }
  const scale = (stat: ModifierStat, min = 0, max = Infinity) => clamp(1 + (totals[stat] ?? 0) / 10000, min, max);
  const rangeScale = scale('range', .7, 1.25), totalAmmo = Math.max(1, Math.floor(base.totalAmmo * scale('totalAmmo')));
  const magazine = Math.min(totalAmmo, Math.max(1, Math.floor(base.magazine * scale('magazine'))));
  return { ...base, id, totalAmmo, magazine,
    spread: base.spread * scale('spread', .7), bloomPerShot: base.bloomPerShot * scale('bloomPerShot', .7),
    bloomCap: base.bloomCap * scale('bloomCap', .7), recoverPerTick: base.recoverPerTick * scale('recoverPerTick'),
    visualKick: base.visualKick * scale('visualKick', .5), hitKickScale: scale('hitKick', .5),
    fanDegrees: base.fanDegrees * scale('fanDegrees'), speedScale: (id === 'heavy_sniper' ? .85 : 1) * scale('speed', .9, 1.06),
    reload: base.reload * scale('reload', .7), emptyReload: base.emptyReload * scale('reload', .7),
    prepare: base.prepare * scale('prepare', .65),
    falloffStart: base.falloffStart * rangeScale, falloffEnd: base.falloffEnd * rangeScale, maxRange: base.maxRange * rangeScale,
    noiseRadius: 600 * scale('noise'), radarTicks: Math.ceil(60 * scale('radar')), flashScale: scale('flash'),
    contrast: legal.includes('O06'), attachments: legal,
  };
}
export type ResolvedGrowthWeapon = ReturnType<typeof resolveGrowthWeapon>;
export function growthReloadTicks(id: GrowthWeaponId, attachments: readonly GrowthAttachmentId[], empty: boolean,
  benefits: readonly number[] = [], penalties: readonly number[] = []) {
  const base = GROWTH_V3_WEAPONS[id], def = resolveGrowthWeapon(id, attachments, { ...NEUTRAL_WEAPON_CONDITIONS, empty });
  if ([...benefits, ...penalties].some(v => !Number.isFinite(v) || v <= 0)) throw Error('Invalid reload modifier');
  const time = (empty ? def.emptyReload : def.reload) * Math.min(1, ...benefits) * penalties.reduce((a, b) => a * b, 1);
  return Math.ceil(Math.max(1, (empty ? base.emptyReload : base.reload) * .6, time));
}
