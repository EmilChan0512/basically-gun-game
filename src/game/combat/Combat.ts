export type WeaponId = 'usp';
export interface WeaponConfig { id: WeaponId; damage: number; magazineSize: number; fireCooldownMs: number; automatic: boolean; range: number }
export const USP: Readonly<WeaponConfig> = Object.freeze({ id: 'usp', damage: 15, magazineSize: 12, fireCooldownMs: 250, automatic: false, range: 900 });
export interface DamageEvent { source: string; target: string; amount: number; weapon: WeaponId; timeMs: number }
export interface Combatant { id: string; health: number; maxHealth: number; alive: boolean; respawnAtMs: number | null }
export class GunController {
  readonly weapon: WeaponConfig; ammo: number; cooldownMs = 0;
  constructor(weapon: WeaponConfig = USP) { this.weapon = weapon; this.ammo = weapon.magazineSize; }
  tick(deltaMs: number) { this.cooldownMs = Math.max(0, this.cooldownMs - deltaMs); }
  fire(source: string, target: Combatant | null, timeMs: number): DamageEvent | null {
    if (this.cooldownMs > 0 || this.ammo <= 0) return null;
    this.ammo--; this.cooldownMs = this.weapon.fireCooldownMs;
    if (!target || !target.alive) return null;
    return { source, target: target.id, amount: this.weapon.damage, weapon: this.weapon.id, timeMs };
  }
  reload() { this.ammo = this.weapon.magazineSize; this.cooldownMs = 0; }
}
export function applyDamage(target: Combatant, event: DamageEvent, respawnDelayMs = 5000): boolean {
  if (!target.alive || target.id !== event.target) return false;
  target.health = Math.max(0, target.health - event.amount);
  if (target.health === 0) { target.alive = false; target.respawnAtMs = event.timeMs + respawnDelayMs; return true; }
  return false;
}
export function respawn(target: Combatant, timeMs: number) { if (!target.alive && target.respawnAtMs !== null && timeMs >= target.respawnAtMs) { target.health = target.maxHealth; target.alive = true; target.respawnAtMs = null; return true; } return false; }
