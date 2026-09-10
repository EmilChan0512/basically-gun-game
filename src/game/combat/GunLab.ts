import { CARBINE, GunController, applyDamage, respawn, USP, type Combatant, type DamageEvent, type WeaponConfig } from './Combat';
export interface Point { x: number; y: number }
export class GunLab {
  private readonly shotClock = { remainingMs: 0 };
  private readonly guns = { usp: new GunController(USP, this.shotClock), carbine: new GunController(CARBINE, this.shotClock) };
  gun = this.guns.usp; weapon: WeaponConfig = USP; readonly target: Combatant = { id: 'target-dummy', health: 100, maxHealth: 100, alive: true, respawnAtMs: null }; readonly targetPoint: Point = { x: 980, y: 540 }; score = 0; lastEvent: DamageEvent | null = null;
  select(id: 'usp' | 'carbine') {
    if (id === this.weapon.id) return;
    this.gun.cancelReload();
    this.gun = this.guns[id];
    this.weapon = this.gun.weapon;
    // Guns.swapGuns preserves the shared shootDelay, cancels reload, then checks the new clip.
    this.gun.checkReload();
  }
  fire(timeMs: number, origin: Point = { x: 180, y: 580 }, aim: Point = this.targetPoint): boolean {
    const dx = aim.x-origin.x, dy = aim.y-origin.y, tx = this.targetPoint.x-origin.x, ty = this.targetPoint.y-origin.y;
    const delta = Math.atan2(Math.sin(Math.atan2(dy,dx)-Math.atan2(ty,tx)), Math.cos(Math.atan2(dy,dx)-Math.atan2(ty,tx)));
    const hit = dx*tx+dy*ty >= 0 && Math.abs(delta) <= this.gun.weapon.spreadDeg*Math.PI/180 && Math.hypot(tx,ty) <= this.gun.weapon.range;
    const event = this.gun.fire('player', hit ? this.target : null, timeMs); this.lastEvent = event;
    if (!event) return false; if (applyDamage(this.target,event)) this.score++; return true;
  }
  tick(deltaMs:number,timeMs:number) { this.gun.tick(deltaMs); respawn(this.target,timeMs); }
  snapshot() { return { weapon:this.weapon.id, ammo:this.gun.ammo, reserveAmmo:this.gun.reserveAmmo, cooldownMs:this.gun.cooldownMs, reloadMs:this.gun.reloadMs, health:this.target.health, alive:this.target.alive, score:this.score, lastEvent:this.lastEvent }; }
}
