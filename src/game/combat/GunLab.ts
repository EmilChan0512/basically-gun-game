import { M4, GunController, applyDamage, respawn, USP, type Combatant, type DamageEvent, type WeaponConfig, type WeaponId, type ShotClock } from './Combat';
export interface Point { x: number; y: number }
export class GunLab {
  private readonly shotClock: ShotClock = { remainingFrames: 0, phaseMs: 0 };
  private readonly guns: Record<WeaponId, GunController>;
  private triggerHeld = false;
  private shotPressed = false;
  combatFrame = 0;
  shotsFired = 0;
  lastShotFrame: number | null = null;
  gun: GunController; weapon: WeaponConfig = USP; readonly target: Combatant = { id: 'target-dummy', health: 100, maxHealth: 100, alive: true, respawnAtMs: null }; readonly targetPoint: Point = { x: 980, y: 540 }; score = 0; lastEvent: DamageEvent | null = null;
  constructor(readonly ammoMultiplier = 1) {
    this.guns = { usp: new GunController(USP, this.shotClock, ammoMultiplier), m4: new GunController(M4, this.shotClock, ammoMultiplier) };
    this.gun = this.guns.usp;
  }
  setTrigger(held: boolean) {
    this.triggerHeld = held;
    if (!held) this.shotPressed = false;
  }
  select(id: WeaponId) {
    if (id === this.weapon.id) return;
    this.gun.cancelReload();
    this.gun = this.guns[id];
    this.weapon = this.gun.weapon;
    if (this.triggerHeld) this.shotPressed = true;
    // Guns.swapGuns preserves the shared shootDelay, cancels reload, then checks the new clip.
    this.gun.checkReload();
  }
  fire(timeMs: number, origin: Point = { x: 180, y: 580 }, aim: Point = this.targetPoint): boolean {
    const dx = aim.x-origin.x, dy = aim.y-origin.y, tx = this.targetPoint.x-origin.x, ty = this.targetPoint.y-origin.y;
    const delta = Math.atan2(Math.sin(Math.atan2(dy,dx)-Math.atan2(ty,tx)), Math.cos(Math.atan2(dy,dx)-Math.atan2(ty,tx)));
    const hit = dx*tx+dy*ty >= 0 && Math.abs(delta) <= this.gun.weapon.spreadDeg*Math.PI/180 && Math.hypot(tx,ty) <= this.gun.weapon.range;
    const ammoBefore = this.gun.ammo;
    const event = this.gun.fire('player', hit ? this.target : null, timeMs); this.lastEvent = event;
    if (this.gun.ammo < ammoBefore) { this.shotsFired++; this.lastShotFrame = this.combatFrame; }
    if (!event) return false; if (applyDamage(this.target,event)) this.score++; return true;
  }
  tick(deltaMs: number, timeMs: number, origin?: Point, aim?: Point) {
    this.gun.tick(deltaMs, offsetMs => {
      this.combatFrame++;
      const frameTime = timeMs - deltaMs + offsetMs;
      respawn(this.target, frameTime);
      if (this.triggerHeld && !this.shotPressed) {
        const before = this.shotsFired;
        this.fire(frameTime, origin, aim);
        if (this.shotsFired > before && !this.weapon.automatic) this.shotPressed = true;
      }
    });
    respawn(this.target,timeMs);
  }
  snapshot() { return { weapon:this.weapon.id, ammo:this.gun.ammo, reserveAmmo:this.gun.reserveAmmo, ammoMultiplier:this.ammoMultiplier, cooldownFrames:this.gun.cooldownFrames, cooldownMs:this.gun.cooldownMs, combatFrame:this.combatFrame, shotsFired:this.shotsFired, lastShotFrame:this.lastShotFrame, reloadFrames:this.gun.reloadFrames, reloadMs:this.gun.reloadMs, health:this.target.health, alive:this.target.alive, score:this.score, lastEvent:this.lastEvent }; }
}
