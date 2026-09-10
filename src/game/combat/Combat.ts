export type WeaponId = 'usp' | 'carbine';
export interface WeaponConfig { id: WeaponId; damage: number; magazineSize: number; spareMagazines: number; fireCooldownMs: number; automatic: boolean; range: number; reloadMs: number; spreadDeg: number }
// USP clipSpare=5 is EXTRACTED. Timings/range/spread remain laboratory placeholders.
export const USP: Readonly<WeaponConfig> = Object.freeze({ id: 'usp', damage: 15, magazineSize: 12, spareMagazines: 5, fireCooldownMs: 250, automatic: false, range: 900, reloadMs: 900, spreadDeg: 0 });
// Entire CARBINE configuration is TUNED; it is not a recovered original weapon.
export const CARBINE: Readonly<WeaponConfig> = Object.freeze({ id: 'carbine', damage: 10, magazineSize: 30, spareMagazines: 3, fireCooldownMs: 100, automatic: true, range: 1000, reloadMs: 1400, spreadDeg: 2 });
export interface DamageEvent { source: string; target: string; amount: number; weapon: WeaponId; timeMs: number }
export interface Combatant { id: string; health: number; maxHealth: number; alive: boolean; respawnAtMs: number | null }
export class GunController {
  ammo: number;
  reserveAmmo: number;
  reloadMs = 0;
  constructor(readonly weapon: WeaponConfig = USP, private readonly shotClock = { remainingMs: 0 }) {
    this.ammo = weapon.magazineSize;
    // Baseline loadout only: unitInfo.amm=1, no skills or match modifiers.
    this.reserveAmmo = weapon.magazineSize * weapon.spareMagazines;
  }
  get cooldownMs() { return this.shotClock.remainingMs; }
  set cooldownMs(value: number) { this.shotClock.remainingMs = value; }
  tick(deltaMs: number) {
    this.cooldownMs = Math.max(0, this.cooldownMs - deltaMs);
    if (this.reloadMs <= 0) return;
    this.reloadMs = Math.max(0, this.reloadMs - deltaMs);
    if (this.reloadMs < 1e-7) {
      this.reloadMs = 0;
      const loaded = Math.min(this.weapon.magazineSize - this.ammo, this.reserveAmmo);
      this.ammo += loaded;
      this.reserveAmmo -= loaded;
    }
  }
  fire(source: string, target: Combatant | null, timeMs: number): DamageEvent | null {
    if (this.cooldownMs > 1e-7 || this.reloadMs > 0 || this.ammo <= 0) return null;
    this.ammo--;
    this.cooldownMs = this.weapon.fireCooldownMs;
    this.checkReload();
    if (!target || !target.alive) return null;
    return { source, target: target.id, amount: this.weapon.damage, weapon: this.weapon.id, timeMs };
  }
  // Guns.manualReload: cooldown blocks manual reload; ammunition stays in the clip.
  reload() {
    if (this.reloadMs > 0 || this.cooldownMs > 1e-7 || this.ammo === this.weapon.magazineSize || this.reserveAmmo <= 0) return false;
    this.reloadMs = this.weapon.reloadMs;
    return true;
  }
  // Guns.checkReload: firing the final round starts reload even during cooldown.
  checkReload() {
    if (this.ammo === 0 && this.reserveAmmo > 0 && this.reloadMs === 0) this.reloadMs = this.weapon.reloadMs;
  }
  cancelReload() { this.reloadMs = 0; }
}
export function applyDamage(target: Combatant, event: DamageEvent, respawnDelayMs = 5000): boolean { if (!target.alive || target.id !== event.target) return false; target.health = Math.max(0, target.health - event.amount); if (target.health === 0) { target.alive = false; target.respawnAtMs = event.timeMs + respawnDelayMs; return true; } return false; }
export function respawn(target: Combatant, timeMs: number) { if (!target.alive && target.respawnAtMs !== null && timeMs >= target.respawnAtMs) { target.health = target.maxHealth; target.alive = true; target.respawnAtMs = null; return true; } return false; }
