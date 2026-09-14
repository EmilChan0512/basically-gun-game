export interface ContinuousHealSource {
  id: string; ownerId: string; targetId: string;
  amount: number; interval: number; firstPulseTick: number; lastPulseTick: number;
  /** Caller computes alive, connection, smoke, pause and electronic status before arbitration. */
  eligible: boolean;
}
export interface ContinuousHealTarget { lastHealTick: number; activeSource: string | null }
export function newContinuousHealTarget(): ContinuousHealTarget { return {lastHealTick:-1000000000,activeSource:null}; }
/** Select even on non-pulse ticks, so staggered losers cannot fill the winning source's gaps. */
export function chooseContinuousHeal(target: ContinuousHealTarget, targetId: string, sources: readonly ContinuousHealSource[], tick: number): ContinuousHealSource | null {
  const candidates=sources.filter(s=>s.targetId===targetId&&s.eligible&&s.amount>0&&tick<=s.lastPulseTick);
  for(const source of candidates) {
    if(!Number.isSafeInteger(source.amount)||!Number.isSafeInteger(source.interval)||source.interval<1)throw Error('Invalid healing source');
  }
  candidates.sort((a,b)=>b.amount*a.interval-a.amount*b.interval||(a.id<b.id?-1:a.id>b.id?1:0));
  const winner=candidates[0];target.activeSource=winner?.id??null;
  if(!winner||tick<winner.firstPulseTick||(tick-winner.firstPulseTick)%winner.interval!==0||tick-target.lastHealTick<winner.interval)return null;
  return winner;
}
/** Commit only after actual >0 restoration; suppressed, full-health and blocked sources consume no budget. */
export function commitContinuousHeal(target: ContinuousHealTarget, tick: number, restored: number) {
  if(!Number.isSafeInteger(restored)||restored<0)throw Error('Invalid healed amount');
  if(restored>0)target.lastHealTick=tick;
}
