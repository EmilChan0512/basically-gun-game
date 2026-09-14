import type { GrowthSoundCue } from '../../shared/simulation/growth-v3/Sound';
/** Existing bundled clips with distinct playback treatments; no new external assets. */
export const GROWTH_SOUND_CLIPS: Record<GrowthSoundCue, { clip: string; rate: number }> = {
  shot: { clip: 'S_assaultFire', rate: 1 },
  footstep: { clip: 'footstep', rate: 1 },
  'throw-warning': { clip: 'S_Beep', rate: 1.6 },
  'shield-hit': { clip: 'S_Reflect1', rate: .75 },
  'structure-hit': { clip: 'S_Blunt2', rate: 1.35 },
  emp: { clip: 'S_Skill', rate: .65 },
  heal: { clip: 'S_Heal', rate: 1 },
  'gadget-empty': { clip: 'S_GunClick', rate: .55 },
  intercept: { clip: 'S_Reflect1', rate: 1.6 },
  deploy: { clip: 'S_Equip', rate: .8 },
  smoke: { clip: 'S_Whip1', rate: .55 },
  explosion: { clip: 'S_rocketExplode', rate: 1 },
  decoy: { clip: 'S_assaultFire', rate: 1 },
  armor: { clip: 'S_Powerup', rate: .8 },
};
