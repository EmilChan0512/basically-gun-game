import { GROWTH_V3_RULES } from '../../content/growth-v3/Core';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS, type GrowthCardId, type GrowthEvolutionId, type GrowthUpgradeId } from '../../content/growth-v3/Cards';
import { GROWTH_V3_OPERATORS } from '../../content/growth-v3/Operators';
import type { GrowthLoadoutV3 } from '../../content/growth-v3/Loadout';

export interface GrowthOffer { batch: number; cards: GrowthUpgradeId[]; tick: number }
export interface GrowthProgressionState {
  xp: number; level: number; selected: GrowthUpgradeId[]; offer: GrowthOffer | null;
  serial: number; rerolls: number; choices: { id: GrowthUpgradeId; tick: number; latency: number }[];
  ultimate: boolean;
}
export function newProgression(): GrowthProgressionState {
  return { xp:0,level:1,selected:[],offer:null,serial:0,rerolls:1,choices:[],ultimate:false };
}
function pick<T>(items: readonly T[], random: () => number): T {
  const n=random(); if(!Number.isFinite(n)||n<0||n>=1||!items.length)throw Error('Invalid growth draw');
  return items[Math.floor(n*items.length)];
}
function eligibleEvolution(state: GrowthProgressionState, loadout: GrowthLoadoutV3): GrowthEvolutionId | undefined {
  if(state.selected.length!==3)return undefined;
  const route=GROWTH_V3_OPERATORS[loadout.classId].abilities[0]===loadout.abilityId?'A':'B';
  return (Object.keys(GROWTH_V3_EVOLUTIONS) as GrowthEvolutionId[]).find(id=>{
    const evo=GROWTH_V3_EVOLUTIONS[id];
    return evo.classId===loadout.classId&&evo.group===route&&evo.requires.every(key=>state.selected.includes(key));
  });
}
export function offerGrowthV3(state: GrowthProgressionState, loadout: GrowthLoadoutV3, tick: number, random: () => number,
  previous?: readonly GrowthUpgradeId[]): GrowthOffer | null {
  if(state.offer||state.selected.length>=Math.min(4,state.level-1))return state.offer;
  const available=loadout.pool.filter(id=>!state.selected.includes(id)), result: GrowthUpgradeId[]=[];
  const evolution=eligibleEvolution(state,loadout);
  if(evolution)result.push(evolution);
  else {
    const route=GROWTH_V3_OPERATORS[loadout.classId].abilities[0]===loadout.abilityId?'A':'B';
    const abilityCards=available.filter(id=>GROWTH_V3_CARDS[id].group===route);
    if(abilityCards.length)result.push(pick(abilityCards,random));
  }
  while(result.length<3) {
    const choices=available.filter(id=>!result.includes(id)); if(!choices.length)break;
    result.push(pick(choices,random));
  }
  // Deterministically replace one ordinary slot if a refresh happened to reproduce the same set.
  if(previous&&result.length===previous.length&&result.every(id=>previous.includes(id))) {
    const other=available.filter(id=>!previous.includes(id));
    if(other.length) {
      const replacement=pick(other,random); let slot=result.length-1;
      while(slot>=0&&result[slot]===evolution)slot--;
      if(slot>=0)result[slot]=replacement;
    }
  }
  if(!result.length)return null;
  state.offer={batch:++state.serial,cards:result,tick}; return state.offer;
}
export function awardGrowthV3(state: GrowthProgressionState, loadout: GrowthLoadoutV3, amount: number, tick: number, random: () => number) {
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid growth XP');
  state.xp=Math.min(1000000000,state.xp+amount);
  state.level=GROWTH_V3_RULES.xpThresholds.filter(value=>state.xp>=value).length;
  offerGrowthV3(state,loadout,tick,random);
}
export function chooseGrowthV3(state: GrowthProgressionState, loadout: GrowthLoadoutV3, batch: number, id: unknown,
  tick: number, random: () => number) {
  const offer=state.offer;
  if(!offer||offer.batch!==batch||typeof id!=='string'||!offer.cards.includes(id as GrowthUpgradeId)||state.selected.includes(id as GrowthUpgradeId))return false;
  state.selected.push(id as GrowthUpgradeId); state.choices.push({id:id as GrowthUpgradeId,tick,latency:Math.max(0,tick-offer.tick)});
  state.offer=null; offerGrowthV3(state,loadout,tick,random); return true;
}
export function rerollGrowthV3(state: GrowthProgressionState, loadout: GrowthLoadoutV3, batch: number, tick: number, random: () => number) {
  if(!state.offer||state.offer.batch!==batch||state.rerolls<=0)return false;
  const old=[...state.offer.cards]; state.offer=null; state.rerolls--;
  offerGrowthV3(state,loadout,tick,random,old); return true;
}
export function cardGroup(id: GrowthUpgradeId) { return Object.hasOwn(GROWTH_V3_CARDS,id)?GROWTH_V3_CARDS[id as GrowthCardId].group:'Evolution'; }

export interface ContributionState {
  window: number; support: number; healing: number; targetHealing: number; objective: number;
  healable: number; healingRemainders: Record<string,number>;
  creditedEvents: Record<string,number>;
}
export function newContributions(): ContributionState {
  return { window:0,support:0,healing:0,targetHealing:0,objective:0,healable:0,healingRemainders:{},creditedEvents:{} };
}
export function contributionWindow(state: ContributionState, tick: number) {
  const window=Math.floor(tick/GROWTH_V3_RULES.supportWindowTicks);
  if(window!==state.window) {
    state.window=window; state.support=state.healing=state.targetHealing=state.objective=0;
    state.healingRemainders={};
  }
  for(const [key,until] of Object.entries(state.creditedEvents))if(tick>=until)delete state.creditedEvents[key];
}
/** Call with actual restored mHP, after damage/healing authority. Never accepts advertised heal power. */
export function healingCredit(source: ContributionState, target: ContributionState, healerId: string, restored: number, tick: number, self: boolean) {
  if(!Number.isSafeInteger(restored)||restored<0)throw Error('Invalid restored health');
  contributionWindow(source,tick); contributionWindow(target,tick);
  const eligible=Math.min(restored,target.healable); target.healable=Math.max(0,target.healable-restored);
  if(self||eligible===0)return 0;
  const units=(target.healingRemainders[healerId]??0)+eligible;
  const raw=Math.floor(units/2000), xp=Math.min(raw,20-target.targetHealing,40-source.healing,60-source.support);
  // Only fractional <2HP remainder survives; capped or previously uncredited healing is never back-paid.
  target.healingRemainders[healerId]=units%2000;
  source.healing+=xp; source.support+=xp; target.targetHealing+=xp; return xp;
}
export function supportCredit(state: ContributionState, amount: number, eventId: string, tick: number, expiresTick: number) {
  if(!Number.isSafeInteger(amount)||amount<0||!eventId||expiresTick<=tick)throw Error('Invalid support credit');
  contributionWindow(state,tick);
  if(state.creditedEvents[eventId]!==undefined)return 0;
  state.creditedEvents[eventId]=expiresTick;
  const xp=Math.min(amount,60-state.support);state.support+=xp;return xp;
}
export function objectiveCredit(state: ContributionState,tick:number) {
  contributionWindow(state,tick);const xp=Math.min(2,60-state.objective);state.objective+=xp;return xp;
}
