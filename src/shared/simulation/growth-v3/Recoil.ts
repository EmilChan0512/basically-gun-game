/** Millidegrees for deterministic presentation; never read by ballistic or movement rules. */
export interface GrowthRecoil { shot: number; hit: number; hitTick: number; added: number }
export const newGrowthRecoil = (): GrowthRecoil => ({ shot:0, hit:0, hitTick:-1, added:0 });
export function decayGrowthRecoil(state: GrowthRecoil) {
  state.shot=Math.max(0,state.shot-400); state.hit=Math.max(0,state.hit-400);
}
export function addShotRecoil(state: GrowthRecoil, degrees: number) { state.shot=Math.min(8000,state.shot+Math.round(degrees*1000)); }
export function addHitRecoil(state: GrowthRecoil, tick: number, scale: number) {
  if(state.hitTick!==tick){state.hitTick=tick;state.added=0;}
  const amount=Math.min(3000-state.added,1500);
  state.added+=amount;state.hit+=Math.round(amount*scale);
}
