import Phaser from 'phaser';
import { GunController, applyDamage, respawn, type Combatant } from '../combat/Combat';
export class GunLab {
  readonly gun = new GunController();
  readonly target: Combatant = { id: 'target-dummy', health: 100, maxHealth: 100, alive: true, respawnAtMs: null };
  score = 0;
  fire(timeMs: number): boolean { const event = this.gun.fire('player', this.target, timeMs); if (!event) return false; if (applyDamage(this.target, event)) this.score++; return true; }
  tick(deltaMs: number, timeMs: number) { this.gun.tick(deltaMs); respawn(this.target, timeMs); }
  snapshot() { return { ammo: this.gun.ammo, cooldownMs: this.gun.cooldownMs, health: this.target.health, alive: this.target.alive, score: this.score }; }
}
