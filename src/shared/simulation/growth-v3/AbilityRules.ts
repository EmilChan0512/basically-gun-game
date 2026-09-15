import type { GrowthPerkId } from '../../content/growth-v3/Perks';
import { GROWTH_V3_ABILITIES, type GrowthAbilityId } from '../../content/growth-v3/Operators';
import type { GrowthClassId } from '../../content/growth-v3/Core';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, legalGrowthCards, type GrowthUpgradeId } from '../../content/growth-v3/Cards';

export interface ResolvedAbility {
  id: GrowthAbilityId; classId: GrowthClassId; name: string;
  cast: number; duration: number; cooldown: number; recovery: number;
  speed: number; reduction: number; spread: number; transfer: number; radius: number;
  heal: number; selfHeal: number; pulseInterval: number; shieldBudget: number; noiseScale: number;
  fireLock: number; gadgetLock: number; swapLock: boolean; reloadLock: boolean; cancellable: boolean;
  maxCharges: number; chargeGap: number; stationarySpread: number;
  pauseOnDamage: boolean; pauseTicks: number; refundPerHit: number; refundGap: number; refundCap: number;
}
/** All modifications are resolved once at cast commit; active casts retain their own snapshot. */
export function resolveAbility(id: GrowthAbilityId, selected: readonly GrowthUpgradeId[], perks: readonly GrowthPerkId[] = []): ResolvedAbility {
  const base = GROWTH_V3_ABILITIES[id], legal = legalGrowthCards(base.classId, id);
  const route = id.endsWith('roll') || id === 'tk_barrier' || id === 'sn_focus' || id === 'md_pulse' ? 'A' : 'B';
  for (const card of selected) {
    if (Object.hasOwn(GROWTH_V3_CARDS, card) && !legal.includes(card as keyof typeof GROWTH_V3_CARDS)) throw Error('Invalid ability build');
    if (Object.hasOwn(GROWTH_V3_EVOLUTIONS, card)) {
      const evo = GROWTH_V3_EVOLUTIONS[card as keyof typeof GROWTH_V3_EVOLUTIONS];
      if (evo.classId !== base.classId || evo.group !== route || evo.requires.some(key => !selected.includes(key))) throw Error('Invalid evolution build');
    }
    if (!Object.hasOwn(GROWTH_V3_CARDS, card) && !Object.hasOwn(GROWTH_V3_EVOLUTIONS, card)) throw Error('Unknown growth card');
  }
  const has = (card: GrowthUpgradeId) => selected.includes(card);
  const d: ResolvedAbility = { ...base, id, maxCharges: 1, chargeGap: 0, stationarySpread: base.spread,
    pauseOnDamage: false, pauseTicks: 0, refundPerHit: 0, refundGap: 0, refundCap: 0 };
  let cooldownDelta = 0, cooldownBase: number = base.cooldown;
  switch (id) {
    case 'as_roll':
      if (has('as_A1')) d.transfer = 3;
      if (has('as_A2')) { cooldownDelta -= 30; d.speed = 1.35; }
      if (has('as_EV_A')) { cooldownBase = 360; cooldownDelta = 0; d.maxCharges = 2; d.chargeGap = 60; }
      break;
    case 'as_reloadrush':
      if (has('as_B1')) d.transfer = 6;
      if (has('as_B2')) { d.duration = 24; cooldownDelta += 30; }
      if (has('as_EV_B')) { d.transfer = 8; cooldownDelta += 30; }
      d.fireLock = d.gadgetLock = d.duration;
      break;
    case 'tk_barrier':
      if (has('tk_A1')) { d.speed = .9; cooldownDelta += 30; }
      if (has('tk_A2')) { d.refundPerHit = 30; d.refundGap = 30; d.refundCap = 60; }
      if (has('tk_EV_A')) { d.speed = 1; d.reduction = .30; }
      break;
    case 'tk_shield':
      if (has('tk_B1')) { d.shieldBudget = 150; d.speed = .80; }
      if (has('tk_B2')) { d.cast = 3; d.recovery = 3; d.duration = 75; }
      d.fireLock = d.gadgetLock = d.duration;
      break;
    case 'sn_focus':
      if (has('sn_A1')) { cooldownDelta -= 60; d.duration = 60; }
      if (has('sn_A2')) { d.refundPerHit = 30; d.refundGap = 30; d.refundCap = 60; }
      if (has('sn_A3')) d.transfer = 1;
      if (has('sn_EV_A')) d.stationarySpread = .25;
      break;
    case 'sn_relocate':
      if (has('sn_B1')) { d.duration = 60; cooldownDelta += 30; }
      if (has('sn_B3')) { d.noiseScale = .25; d.speed = 1.15; }
      if (has('sn_EV_B')) cooldownDelta += 30;
      break;
    case 'md_pulse':
      if (has('md_A1')) { d.radius = 240; d.heal -= 5; d.selfHeal -= 5; }
      if (has('md_A2')) { cooldownDelta -= 84; d.heal -= 5; d.selfHeal -= 5; }
      if (has('md_A3')) { d.speed = 1; cooldownDelta += 42; }
      if (has('md_C4')) d.selfHeal += 5;
      break;
    case 'md_link':
      if (has('md_C4')) d.selfHeal++;
      if (has('md_B1')) { d.radius = 300; d.heal--; d.selfHeal--; }
      if (has('md_B2')) { d.pauseOnDamage = true; d.pauseTicks = 15; }
      if (has('md_B3')) { d.duration = 60; d.pulseInterval = 10; }
      d.fireLock = d.gadgetLock = d.duration;
      break;
  }
  if (perks.includes('as_fullrush') && id === 'as_reloadrush') d.transfer = 1000000;
  if (perks.includes('tk_fortress') && id === 'tk_barrier') { d.reduction += .2; d.speed = 1; }
  if (perks.includes('tk_siege') && id === 'tk_shield') d.shieldBudget += 120;
  if (perks.includes('sn_hunt') && id === 'sn_relocate') d.speed += .2;
  if (perks.includes('md_emergency') && id === 'md_pulse') { d.heal += 25; d.selfHeal += 25; }
  if (perks.includes('md_transfusion') && id === 'md_link') d.heal += 4;
  d.cooldown = Math.ceil(Math.max(cooldownBase * .75, cooldownBase + cooldownDelta));
  return d;
}
export function abilityHealing(def: ResolvedAbility, self: boolean, hp: number, maxHp: number, selected: readonly GrowthUpgradeId[]) {
  return (self ? def.selfHeal : def.heal) + (selected.includes('md_C1') && hp < maxHp * .3 ? def.id === 'md_pulse' ? 10 : 1 : 0);
}
