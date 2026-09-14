import type { WeaponId } from '../../../game/combat/Combat';
export type GrowthSoundCue = 'shot' | 'footstep' | 'throw-warning' | 'shield-hit' | 'structure-hit' | 'emp' | 'heal' | 'gadget-empty' | 'intercept' | 'deploy' | 'smoke' | 'explosion' | 'decoy' | 'armor';
export interface GrowthSoundSample { cue: GrowthSoundCue; pan: -1 | 0 | 1; distance: 0 | 1 | 2; weapon?: WeaponId }
export interface GrowthSoundRecipient extends GrowthSoundSample { id: string }
export const GROWTH_SOUND_RADII = { footstep: 240, tactical: 480, explosion: 720 } as const;
/** Capture at emission. The wire sends one quantized listener sample, never source coordinates. */
export function growthSoundRecipients(cue: GrowthSoundCue, point: { x: number; y: number }, radius: number,
  listeners: readonly { id: string; x: number; y: number; alive: boolean }[]): GrowthSoundRecipient[] {
  return listeners.filter(a => a.alive && Math.hypot(a.x - point.x, a.y - point.y) <= radius).map(a => {
    const d = Math.hypot(a.x - point.x, a.y - point.y);
    return { id: a.id, cue, pan: Math.abs(point.x - a.x) < 24 ? 0 : point.x > a.x ? 1 : -1,
      distance: d < radius / 3 ? 0 : d < radius * 2 / 3 ? 1 : 2 };
  });
}
