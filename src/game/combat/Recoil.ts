import type { RandomSource } from './Ballistics';

export interface ShootingPose { crouching: boolean; airborne: boolean; moving: boolean; aimStat: number }
/** Guns.EnterFrame / shoot / makeBullet, ordinary human USP/M4, no reflection. */
export class Recoil {
  dynamic: number;
  upper: number;
  constructor(public base: number) { this.dynamic = base; this.upper = base; }
  switchWeapon(base: number) {
    this.base = base;
    this.dynamic = base;
    // swapGuns resets dynRecoil only. dynRecoilMod is refreshed by the next Guns.EnterFrame.
  }
  afterShot() { if (this.dynamic < this.base * 1.7) this.dynamic += 0.3; }
  tick(pose: ShootingPose) {
    if (this.dynamic > this.base) this.dynamic -= 0.05;
    const posture = pose.crouching ? 0.6 : pose.airborne ? 1.2 : pose.moving ? 1.1 : 1;
    this.upper = this.dynamic * posture * (2 - pose.aimStat);
  }
  sampleDegrees(random: RandomSource): number {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a value in [0, 1).');
    // This is asymmetric: the lower endpoint uses dynRecoil, not dynRecoilMod.
    return -this.dynamic + value * (this.upper + this.dynamic);
  }
}
