import { ASSAULT_POOL, GROWTH_RULES, type GrowthUpgradeId } from '../content/GrowthCatalog';
import type { RandomSource } from '../../game/combat/Ballistics';

export interface GrowthState {
  classId: 'assault'; xp: number; level: number; selected: GrowthUpgradeId[];
  offer: { batch: number; cards: GrowthUpgradeId[]; tick: number } | null;
  serial: number; rerolls: number; ultimate: boolean; momentumUntil: number; berserkerReady: number;
  scavenged: Record<string, number>; attackers: Record<string, number>;
  choices: { id: GrowthUpgradeId; tick: number; latency: number }[];
}
export const newGrowth = (): GrowthState => ({ classId: 'assault', xp: 0, level: 1, selected: [], offer: null,
  serial: 0, rerolls: 1, ultimate: false, momentumUntil: 0, berserkerReady: 0,
  scavenged: {}, attackers: {}, choices: [] });
export function offerGrowth(state: GrowthState, random: RandomSource, tick: number) {
  if (state.offer || state.selected.length >= state.level - 1) return;
  const pool = ASSAULT_POOL.filter(id => !state.selected.includes(id));
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
  return { classId: state.classId, xp: state.xp, level: state.level, selected: [...state.selected],
    offer: state.offer ? { ...state.offer, cards: [...state.offer.cards] } : null,
    rerolls: state.rerolls, ultimate: state.ultimate, momentumUntil: state.momentumUntil };
}
