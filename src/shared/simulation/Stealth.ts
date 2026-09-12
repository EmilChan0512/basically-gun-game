/** 30 Hz equipped passive; independent of damage immunity. */
export const STEALTH_DELAY = 150;
export interface Concealable {
  stealthFrames?: number;
  kit: { skill: string } | null;
  skillFrames: number;
  deliveryPreviousWeapon?: string;
}
export function isConcealed(actor: Concealable) {
  return actor.deliveryPreviousWeapon === undefined && (actor.kit?.skill === 'stealth' && (actor.stealthFrames ?? 0) >= STEALTH_DELAY
    || actor.kit?.skill === 'cloak' && actor.skillFrames > 0);
}
export function stepStealth(frames: number, eligible: boolean, stationary: boolean, crouching: boolean, airborne: boolean, attacking: boolean, reloading: boolean) {
  if (!eligible || airborne || attacking || reloading) return 0;
  if (frames >= STEALTH_DELAY && crouching) return STEALTH_DELAY;
  return stationary ? Math.min(STEALTH_DELAY, frames + 1) : 0;
}
