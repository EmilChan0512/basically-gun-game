import { BASE_HEAD_BONUS, type HitRegion } from './Ballistics';
export const COMBAT_FRAME_MS = 1000 / 30;
export type WeaponId = 'usp' | 'm4';
export interface WeaponConfig { id: WeaponId; damage: number; magazineSize: number; spareMagazines: number; shootDelayFrames: number; automatic: boolean; rangeUnits: number; reloadFrames: number }
// Stats_Guns + Guns uint assignment + arm_gun_316 timeline. Range is in original 10px units.
export const USP: Readonly<WeaponConfig> = Object.freeze({ id: 'usp', damage: 15, magazineSize: 12, spareMagazines: 5, shootDelayFrames: 7, automatic: false, rangeUnits: 66, reloadFrames: 28 });
export const M4: Readonly<WeaponConfig> = Object.freeze({ id: 'm4', damage: 10, magazineSize: 30, spareMagazines: 3, shootDelayFrames: 4, automatic: true, rangeUnits: 60, reloadFrames: 34 });
export interface ShotClock { remainingFrames: number; phaseMs: number }
export interface DamageEvent { source: string; target: string; amount: number; weapon: WeaponId; timeMs: number; hitRegion: HitRegion }
export interface Combatant { id: string; health: number; maxHealth: number; alive: boolean; respawnAtMs: number | null }
export class GunController {
  ammo: number;
  reserveAmmo: number;
  reloadFrames = 0;
  private insideCombatFrame = false;
  private reloadStartedThisFrame = false;
  constructor(readonly weapon: WeaponConfig = USP, private readonly shotClock: ShotClock = { remainingFrames: 0, phaseMs: 0 }, readonly ammoMultiplier = 1) {
    if (!Number.isFinite(ammoMultiplier) || ammoMultiplier < 0.65) throw new RangeError('Ammo multiplier must be finite and at least the supported class minimum (0.65).');
    this.ammo = weapon.magazineSize;
    // Guns.setGuns: ceil the total before subtracting the full magazine.
    this.reserveAmmo = Math.ceil(weapon.magazineSize * (weapon.spareMagazines + 1) * ammoMultiplier) - weapon.magazineSize;
  }
  get cooldownFrames() { return this.shotClock.remainingFrames; }
  get cooldownMs() { return this.cooldownFrames * COMBAT_FRAME_MS; }
  get reloadMs() { return this.reloadFrames * COMBAT_FRAME_MS; }
  tick(deltaMs: number, beforeFrame?: (offsetMs: number) => void) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError('Combat delta must be finite and nonnegative.');
    let elapsed = 0;
    while (elapsed < deltaMs) {
      const step = Math.min(deltaMs - elapsed, COMBAT_FRAME_MS - this.shotClock.phaseMs);
      elapsed += step;
      this.shotClock.phaseMs += step;
      if (this.shotClock.phaseMs + 1e-7 >= COMBAT_FRAME_MS) {
        this.shotClock.phaseMs = 0;
        // Player.shoot precedes UnitEnterFrame -> Guns.EnterFrame, including on the shot frame.
        this.reloadStartedThisFrame = false;
        this.insideCombatFrame = true;
        try { beforeFrame?.(elapsed); } finally { this.insideCombatFrame = false; }
        if (this.shotClock.remainingFrames > 0) this.shotClock.remainingFrames--;
        // arm_gun_316 completion frame runs after the held-fire attempt in this laboratory ordering.
        if (this.reloadFrames > 0 && !this.reloadStartedThisFrame) {
          this.reloadFrames--;
          if (this.reloadFrames === 0) this.completeReload();
        }
      }
    }
  }
  private completeReload() {
    const loaded = Math.min(this.weapon.magazineSize - this.ammo, this.reserveAmmo);
    this.ammo += loaded;
    this.reserveAmmo -= loaded;
  }
  private startReload() {
    this.reloadFrames = this.weapon.reloadFrames;
    if (this.insideCombatFrame) this.reloadStartedThisFrame = true;
  }
  get canFire() { return this.cooldownFrames === 0 && this.reloadFrames === 0 && this.ammo > 0; }
  fire(source: string, target: Combatant | null, timeMs: number, hitRegion: HitRegion = 'body'): DamageEvent | null {
    if (!this.canFire) return null;
    this.ammo--;
    this.shotClock.remainingFrames = this.weapon.shootDelayFrames;
    this.checkReload();
    if (!target || !target.alive) return null;
    return { source, target: target.id, amount: this.weapon.damage * (hitRegion === 'head' ? BASE_HEAD_BONUS : 1), weapon: this.weapon.id, timeMs, hitRegion };
  }
  // Guns.manualReload: cooldown blocks manual reload; ammunition stays in the clip.
  reload() {
    if (this.reloadFrames > 0 || this.cooldownFrames > 0 || this.ammo === this.weapon.magazineSize || this.reserveAmmo <= 0) return false;
    this.startReload();
    return true;
  }
  // Guns.checkReload: firing the final round starts reload even during cooldown.
  checkReload() {
    if (this.ammo === 0 && this.reserveAmmo > 0 && this.reloadFrames === 0) this.startReload();
  }
  cancelReload() { this.reloadFrames = 0; }
}
export function applyDamage(target: Combatant, event: DamageEvent, respawnDelayMs = 5000): boolean { if (!target.alive || target.id !== event.target) return false; target.health = Math.max(0, target.health - event.amount); if (target.health === 0) { target.alive = false; target.respawnAtMs = event.timeMs + respawnDelayMs; return true; } return false; }
export function respawn(target: Combatant, timeMs: number) { if (!target.alive && target.respawnAtMs !== null && timeMs >= target.respawnAtMs) { target.health = target.maxHealth; target.alive = true; target.respawnAtMs = null; return true; } return false; }
