import { freshGrowthMetrics, type GrowthMetrics, type GrowthWeaponMetrics, type GrowthAttachment } from '../content/GrowthRecords';
import { GROWTH_POOLS, STARTER_GROWTH_PERKS, GROWTH_RULES, defaultGrowthLoadout, type GrowthPerkId, type GrowthClassId, type GrowthWeaponId, type GrowthLoadout, type GrowthUpgradeId } from '../content/GrowthCatalog';
import type { RandomSource } from '../../game/combat/Ballistics';

export interface GrowthState {
  healableDamage: number; healingWindowStart: number; healingWindowXp: number;
  attachment: GrowthAttachment; evolutions: boolean; killStreak: number; headshotStreak: number; metrics: GrowthMetrics; weaponMetrics: Partial<Record<GrowthWeaponId, GrowthWeaponMetrics>>;
  perks: GrowthPerkId[]; landingUntil: number; classId: GrowthClassId; primary: GrowthWeaponId; pool: GrowthUpgradeId[]; armor: number; armorUntil: number; ghostUntil: number; stationaryTicks: number; lastDamageTick: number; cooldowns: Record<string, number>; objectiveTicks: number; captureReady: number; xp: number; level: number; selected: GrowthUpgradeId[];
  offer: { batch: number; cards: GrowthUpgradeId[]; tick: number } | null;
  serial: number; rerolls: number; ultimate: boolean; momentumUntil: number; berserkerReady: number;
  scavenged: Record<string, number>; attackers: Record<string, number>;
  choices: { id: GrowthUpgradeId; tick: number; latency: number }[];
}
export const newGrowth = (loadout: GrowthLoadout = defaultGrowthLoadout()): GrowthState => ({ attachment: loadout.attachment ?? 'none', evolutions: loadout.evolutions ?? false, killStreak: 0, headshotStreak: 0, metrics: freshGrowthMetrics(), weaponMetrics: {}, perks: [...(loadout.perks ?? STARTER_GROWTH_PERKS)], landingUntil: 0, classId: loadout.classId, primary: loadout.primary, pool: [...(loadout.pool ?? GROWTH_POOLS[loadout.classId])], armor: 0, armorUntil: 0, ghostUntil: 0, stationaryTicks: 0, lastDamageTick: 0, cooldowns: {}, objectiveTicks: 0, captureReady: 0, xp: 0, level: 1, selected: [], offer: null,
  serial: 0, rerolls: 1, ultimate: false, momentumUntil: 0, berserkerReady: 0,
  healableDamage: 0, healingWindowStart: 0, healingWindowXp: 0,
  scavenged: {}, attackers: {}, choices: [] });
export function offerGrowth(state: GrowthState, random: RandomSource, tick: number) {
  if (state.offer || state.selected.length >= state.level - 1) return;
  const pool = state.pool.filter(id => !state.selected.includes(id));
  if (state.evolutions && state.selected.includes('momentum') && !state.selected.includes('momentumII')) pool.push('momentumII');
  if (state.evolutions && state.selected.includes('momentumII') && state.killStreak >= 2 && !state.selected.includes('killingSpree')) pool.push('killingSpree');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  state.offer = { batch: ++state.serial, cards: pool.slice(0, 3), tick };
}
export function awardGrowth(state: GrowthState, xp: number, random: RandomSource, tick: number) {
  if (!Number.isSafeInteger(xp) || xp <= 0) throw Error('Invalid authority XP');
  state.xp = Math.min(1000000, state.xp + xp);
  state.level = GROWTH_RULES.xpThresholds.filter(value => state.xp >= value).length;
  offerGrowth(state, random, tick);
}
export function selectGrowth(state: GrowthState, batch: number, id: unknown, random: RandomSource, tick: number) {
  const offer = state.offer;
  if (!offer || batch !== offer.batch || !offer.cards.includes(id as GrowthUpgradeId)) return false;
  state.selected.push(id as GrowthUpgradeId);
  state.choices.push({ id: id as GrowthUpgradeId, tick, latency: tick - offer.tick });
  state.offer = null; offerGrowth(state, random, tick); return true;
}
export function rerollGrowth(state: GrowthState, batch: number, random: RandomSource, tick: number) {
  if (!state.offer || state.offer.batch !== batch || state.rerolls <= 0) return false;
  // A new batch invalidates delayed choices even if the same card reappears.
  state.rerolls--; state.offer = null; offerGrowth(state, random, tick); return true;
}
export function growthView(state: GrowthState) {
  return { healingDone: state.metrics.healingDone, healingXp: state.metrics.healingXp, perks: [...state.perks], classId: state.classId, primary: state.primary, armor: state.armor, xp: state.xp, level: state.level, selected: [...state.selected],
    offer: state.offer ? { ...state.offer, cards: [...state.offer.cards] } : null,
    rerolls: state.rerolls, ultimate: state.ultimate, momentumUntil: state.momentumUntil };
}
